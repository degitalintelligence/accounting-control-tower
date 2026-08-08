import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit/logger";
import { validateAssignment } from "@/lib/work-engine/assignments";
import { publishNotificationEvent } from "@/lib/notification";
import { ensureChecklistResponses } from "@/lib/checklists";
import type { AssignmentRole } from "@/types/work-item";
import { assignmentSchema, validationMessage } from "@/lib/validation/schemas";
import { validateAssigneeAvailability } from "@/lib/work-engine/planned-leave";
import { canAccessClient, getAuthContext, requirePermission } from "@/lib/authorization";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * Helper: ambil organization_id dari membership user.
 */
async function getUserOrganizationId(
  admin: ReturnType<typeof createServiceRoleClient>,
  userId: string
): Promise<{ organizationId: string | null; error: string | null }> {
  const result = await admin
    .from("memberships")
    .select("organization_id")
    .eq("profile_id", userId)
    .eq("is_active", true)
    .limit(1)
    .single();

  const membership = result as unknown as {
    data: { organization_id: string } | null;
    error: { message: string; code: string; hint: string; details: string } | null;
  };

  if (membership.error || !membership.data) {
    return {
      organizationId: null,
      error: membership.error?.message ?? "User tidak memiliki membership aktif.",
    };
  }

  return { organizationId: membership.data.organization_id, error: null };
}

/**
 * POST /api/work-items/[id]/assign
 * Assign user ke work item dengan role (maker/checker/approver).
 * Validasi separation of duties via validateAssignment.
 * Jika assign maker + status 'draft', auto-transition ke 'assigned'.
 */
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const supabase = await createClient();
    const { id } = await context.params;

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const admin = createServiceRoleClient();

    const authContext = await getAuthContext();
    if (authContext.response) return authContext.response;
    const permissionDenied = await requirePermission(authContext.context, "work_items.manage");
    if (permissionDenied) return permissionDenied;

    const { organizationId, error: orgError } = await getUserOrganizationId(admin, user.id);
    if (orgError || !organizationId) {
      return NextResponse.json(
        { error: "Organisasi tidak ditemukan untuk user ini." },
        { status: 403 }
      );
    }

    const requestBody = await request.json();
    const parsed = assignmentSchema.safeParse({
      ...requestBody,
      profile_id: requestBody.profile_id === "self" ? user.id : requestBody.profile_id,
    });
    if (!parsed.success) return NextResponse.json({ error: validationMessage(parsed.error) }, { status: 400 });
    const { profile_id, role, leave_warning_acknowledged } = parsed.data;
    const assignmentRole = role as AssignmentRole;

    const memberResult = await admin
      .from("memberships")
      .select("profile_id, client_id")
      .eq("organization_id", organizationId)
      .eq("profile_id", profile_id)
      .eq("is_active", true);
    const memberData = memberResult as unknown as { data: { profile_id: string; client_id: string | null }[] | null };
    if (!memberData.data?.length) return NextResponse.json({ error: "Pengguna bukan anggota organisasi aktif." }, { status: 403 });

    // Verifikasi work item exists dan milik org yang sama
    const wiResult = await admin
      .from("work_items")
      .select("id, organization_id, client_id, entity_id, type, risk_level, priority, amount, currency_code, required_approval_level, status, start_at, due_at")
      .eq("id", id)
      .eq("organization_id", organizationId)
      .is("deleted_at", null)
      .single();

    const { data: workItem, error: wiError } = wiResult as unknown as {
      data: { id: string; organization_id: string; client_id: string | null; entity_id: string | null; type: string; risk_level: string; priority: string; amount: number | null; currency_code: string; required_approval_level: number; status: string; start_at: string | null; due_at: string | null } | null;
      error: { message: string; code: string; hint: string; details: string } | null;
    };

    if (wiError || !workItem) {
      return NextResponse.json(
        { error: "Work item tidak ditemukan." },
        { status: 404 }
      );
    }

    const targetMatchesScope = memberData.data?.some((member) => member.client_id === null || member.client_id === workItem.client_id);
    if (!targetMatchesScope) return NextResponse.json({ error: "Pengguna tidak memiliki akses ke client work item." }, { status: 403 });

    const availability = await validateAssigneeAvailability(admin, organizationId, profile_id, (workItem as unknown as { start_at?: string | null }).start_at ?? null, (workItem as unknown as { due_at?: string | null }).due_at ?? null, leave_warning_acknowledged === true);
    if (!availability.valid) return NextResponse.json({ error: availability.warning ?? "Assignment bertabrakan dengan planned leave yang disetujui.", code: availability.code, conflicts: availability.conflicts }, { status: 409 });

    let authorization = { authorization_source: "direct", authority_id: null as string | null, delegation_id: null as string | null, principal_id: null as string | null, authorization_limit: null as number | null, authorization_level: null as number | null, snapshot: {} as Record<string, unknown> };
    if (workItem.amount !== null) {
      const authorityResult = await admin.rpc("resolve_effective_authority" as never, { p_organization_id: organizationId, p_client_id: workItem.client_id, p_entity_id: workItem.entity_id, p_profile_id: profile_id, p_role: assignmentRole, p_amount: workItem.amount, p_currency_code: workItem.currency_code, p_risk_level: workItem.risk_level, p_approval_level: workItem.required_approval_level } as never);
      const authority = authorityResult as unknown as { data: Array<{ authorized: boolean; authorization_source: string; authority_id: string | null; delegation_id: string | null; principal_id: string | null; authorization_limit: number | null; authorization_level: number | null; snapshot: Record<string, unknown> }> | null; error: { message: string } | null };
      const resolved = authority.data?.[0];
      if (authority.error || !resolved?.authorized) return NextResponse.json({ error: "Assignee tidak memiliki kewenangan untuk nilai materialitas work item.", code: "INSUFFICIENT_APPROVAL_AUTHORITY" }, { status: 403 });
      authorization = resolved;
    }

    if (!canAccessClient(authContext.context, workItem.client_id)) return NextResponse.json({ error: "Work item tidak ditemukan." }, { status: 404 });

    const validation = await validateAssignment(id, profile_id, assignmentRole);
    if (!validation.valid) return NextResponse.json({ error: validation.error }, { status: 409 });

    const assignResult = await admin
      .from("assignments")
      .insert({
        work_item_id: id,
        profile_id,
        role: assignmentRole,
        assigned_by: user.id,
        authorization_source: authorization.authorization_source,
        authority_id: authorization.authority_id,
        delegation_id: authorization.delegation_id,
        delegation_principal_id: authorization.principal_id,
        authorization_limit: authorization.authorization_limit,
        authorization_level: authorization.authorization_level,
        authorization_snapshot: authorization.snapshot,
      } as never)
      .select()
      .single();

    const { data: assignment, error: insertError } = assignResult as unknown as {
      data: { id: string } | null;
      error: { message: string; code: string; hint: string; details: string } | null;
    };

    if (insertError) {
      console.error("[POST /assign] Supabase error:", {
        message: insertError.message,
        code: insertError.code,
        hint: insertError.hint,
        details: insertError.details,
      });
      return NextResponse.json(
        { error: "Gagal melakukan assignment." },
        { status: 500 }
      );
    }

    await ensureChecklistResponses(admin, id, profile_id, assignmentRole);

    // Auto-transition: draft → assigned jika assign maker dan status masih draft
    // Lewati RPC transition_work_item (jalur state machine terpusat + mencatat history otomatis).
    if (assignmentRole === "maker" && workItem.status === "draft") {
      const transitionResult = await admin.rpc("transition_work_item" as never, {
        p_work_item_id: id,
        p_to_status: "assigned",
        p_actor_id: user.id,
        p_reason: null,
      } as never);

      const { error: transitionError } = transitionResult as unknown as {
        error: { message: string; code: string; hint: string; details: string } | null;
      };

      if (transitionError) {
        console.error("[POST /assign] Gagal auto-transition draft→assigned:", {
          message: transitionError.message,
          code: transitionError.code,
          hint: transitionError.hint,
          details: transitionError.details,
        });
      }
    }

    // Audit log
    await logAudit(admin, {
      organizationId,
      actorId: user.id,
      action: "work_item.assigned",
      entityType: "assignment",
      entityId: assignment!.id,
      newValue: {
        work_item_id: id,
        profile_id,
        role: assignmentRole,
      },
    });

    try {
      await publishNotificationEvent(admin, {
        eventType: "item_assigned",
        organizationId,
        aggregateType: "work_item",
        aggregateId: id,
        profileIds: [profile_id],
        title: "Work item ditugaskan",
        body: `Anda ditugaskan sebagai ${assignmentRole}.`,
        data: {
          work_item_id: id,
          assignment_id: assignment!.id,
          role: assignmentRole,
        },
        dedupKey: `item_assigned:${assignment!.id}`,
      });
    } catch (notificationError) {
      console.error("[POST /assign] Gagal mempublikasikan event notifikasi:", notificationError);
    }

    return NextResponse.json({ data: assignment }, { status: 201 });
  } catch (err) {
    console.error("[POST /assign] Unexpected error:", err);
    return NextResponse.json(
      { error: "Terjadi kesalahan server." },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const admin = createServiceRoleClient();
    const authContext = await getAuthContext();
    if (authContext.response) return authContext.response;
    const permissionDenied = await requirePermission(authContext.context, "work_items.manage");
    if (permissionDenied) return permissionDenied;
    const { organizationId, error } = await getUserOrganizationId(admin, user.id);
    if (error || !organizationId) return NextResponse.json({ error: "Organisasi tidak ditemukan." }, { status: 403 });
    const { id } = await context.params;
    const body = await request.json() as { assignment_id?: string; reason?: string };
    if (!body.assignment_id) return NextResponse.json({ error: "assignment_id wajib diisi." }, { status: 400 });
    const existingResult = await admin
      .from("assignments")
      .select("id, profile_id, role, work_item_id, work_items!inner(organization_id)")
      .eq("id", body.assignment_id)
      .eq("work_item_id", id)
      .eq("work_items.organization_id", organizationId)
      .is("unassigned_at", null)
      .single();
    const existing = existingResult as unknown as { data: { id: string; profile_id: string; role: AssignmentRole } | null; error: { message: string } | null };
    if (existing.error || !existing.data) return NextResponse.json({ error: "Assignment aktif tidak ditemukan." }, { status: 404 });
    const updated = await admin.from("assignments").update({ unassigned_at: new Date().toISOString(), reason: body.reason?.trim() || "Reassign" } as never).eq("id", body.assignment_id);
    const updateData = updated as unknown as { error: { message: string } | null };
    if (updateData.error) return NextResponse.json({ error: "Gagal membatalkan assignment." }, { status: 500 });
    await logAudit(admin, { organizationId, actorId: user.id, action: "work_item.unassigned", entityType: "assignment", entityId: body.assignment_id, oldValue: existing.data, newValue: { reason: body.reason?.trim() || "Reassign" } });
    return NextResponse.json({ data: { id: body.assignment_id } });
  } catch {
    return NextResponse.json({ error: "Terjadi kesalahan server." }, { status: 500 });
  }
}
