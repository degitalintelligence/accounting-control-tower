import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit/logger";
import { validateAssignment } from "@/lib/work-engine/assignments";
import { publishNotificationEvent } from "@/lib/notification";
import { ensureChecklistResponses } from "@/lib/checklists";
import type { AssignmentRole } from "@/types/work-item";
import { assignmentSchema, validationMessage } from "@/lib/validation/schemas";

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
    const { profile_id, role } = parsed.data;
    const assignmentRole = role as AssignmentRole;

    // Verifikasi work item exists dan milik org yang sama
    const wiResult = await admin
      .from("work_items")
      .select("id, organization_id, status")
      .eq("id", id)
      .eq("organization_id", organizationId)
      .is("deleted_at", null)
      .single();

    const { data: workItem, error: wiError } = wiResult as unknown as {
      data: { id: string; organization_id: string; status: string } | null;
      error: { message: string; code: string; hint: string; details: string } | null;
    };

    if (wiError || !workItem) {
      return NextResponse.json(
        { error: "Work item tidak ditemukan." },
        { status: 404 }
      );
    }

    const validation = await validateAssignment(id, profile_id, assignmentRole);
    if (!validation.valid) return NextResponse.json({ error: validation.error }, { status: 409 });

    const assignResult = await admin
      .from("assignments")
      .insert({
        work_item_id: id,
        profile_id,
        role: assignmentRole,
        assigned_by: user.id,
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
    if (assignmentRole === "maker" && workItem.status === "draft") {
      const transitionResult = await admin
        .from("work_items")
        .update({
          status: "assigned",
          updated_at: new Date().toISOString(),
        } as never)
        .eq("id", id);

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
      } else {
        // Catat status history untuk auto-transition
        await admin.from("work_item_status_history").insert({
          work_item_id: id,
          from_status: "draft",
          to_status: "assigned",
          changed_by: user.id,
          reason: "Auto-transition: maker assigned",
        } as never);
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
