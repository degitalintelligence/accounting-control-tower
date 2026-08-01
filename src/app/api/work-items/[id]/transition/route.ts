import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit/logger";
import { canTransition, getTransition } from "@/lib/work-engine/status-machine";
import { publishNotificationEvent } from "@/lib/notification";
import { getIncompleteRequiredChecklist } from "@/lib/checklists";
import type { WorkItemStatus, AssignmentRole } from "@/types/work-item";
import { transitionSchema, validationMessage } from "@/lib/validation/schemas";

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
 * POST /api/work-items/[id]/transition
 * Ubah status work item dengan validasi state machine.
 * Import dari @/lib/work-engine/status-machine (canTransition, getTransition).
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

    let payload: unknown;
    try {
      payload = await request.json();
    } catch {
      return NextResponse.json({ error: "Payload JSON tidak valid." }, { status: 400 });
    }
    const parsed = transitionSchema.safeParse(payload);
    if (!parsed.success) return NextResponse.json({ error: validationMessage(parsed.error) }, { status: 400 });
    const { to_status, reason } = parsed.data;

    // Ambil work item saat ini
    const wiResult = await admin
      .from("work_items")
      .select("id, organization_id, status, risk_level, client_id")
      .eq("id", id)
      .eq("organization_id", organizationId)
      .is("deleted_at", null)
      .single();

    const { data: workItem, error: fetchError } = wiResult as unknown as {
      data: { id: string; organization_id: string; status: string; risk_level: string; client_id: string } | null;
      error: { message: string; code: string; hint: string; details: string } | null;
    };

    if (fetchError || !workItem) {
      return NextResponse.json(
        { error: "Work item tidak ditemukan." },
        { status: 404 }
      );
    }

    const fromStatus = workItem.status as WorkItemStatus;
    const toStatus = to_status as WorkItemStatus;

    // Ambil definisi transisi (untuk cek requiresReason, highRiskOnly)
    const transition = getTransition(fromStatus, toStatus);
    if (!transition) {
      return NextResponse.json(
        {
          error: `Transisi dari '${fromStatus}' ke '${toStatus}' tidak diizinkan.`,
        },
        { status: 400 }
      );
    }

    // Cek requiresReason
    if (transition.requiresReason && (!reason || reason.trim().length === 0)) {
      return NextResponse.json(
        { error: `Alasan wajib diisi untuk transisi ke '${toStatus}'.` },
        { status: 400 }
      );
    }

    // Cek highRiskOnly
    if (
      transition.highRiskOnly &&
      workItem.risk_level !== "critical" &&
      workItem.risk_level !== "high"
    ) {
      return NextResponse.json(
        { error: "Transisi ini hanya untuk work item berisiko tinggi/kritis." },
        { status: 400 }
      );
    }

    if (toStatus === "submitted") {
      const incomplete = await getIncompleteRequiredChecklist(admin, id);
      if (incomplete.length > 0) {
        return NextResponse.json(
          { error: "Checklist wajib belum lengkap.", incomplete_items: incomplete.map((item) => item.checklist_items.label) },
          { status: 422 }
        );
      }
    }

    // Cek role user dari assignments
    const assignmentsResult = await admin
      .from("assignments")
      .select("role")
      .eq("work_item_id", id)
      .eq("profile_id", user.id)
      .is("unassigned_at", null);

    const assignments = assignmentsResult as unknown as {
      data: { role: string }[] | null;
      error: { message: string; code: string; hint: string; details: string } | null;
    };

    if (assignments.error) {
      console.error("[POST /transition] Gagal ambil assignments:", {
        message: assignments.error.message,
        code: assignments.error.code,
        hint: assignments.error.hint,
        details: assignments.error.details,
      });
      return NextResponse.json(
        { error: "Gagal memvalidasi role user." },
        { status: 500 }
      );
    }

    const userRoles = (assignments.data ?? []).map((a) => a.role as AssignmentRole | "system" | "admin");

    // Cek apakah user punya role yang diizinkan
    const hasRequiredRole = userRoles.some((role) =>
      canTransition(fromStatus, toStatus, role)
    );

    if (!hasRequiredRole) {
      return NextResponse.json(
        {
          error: `Hanya role ${transition.allowedRoles.join(" atau ")} yang boleh melakukan transisi ini.`,
        },
        { status: 403 }
      );
    }

    const rpcResult = await admin.rpc("transition_work_item" as never, {
      p_work_item_id: id,
      p_to_status: toStatus,
      p_actor_id: user.id,
      p_reason: reason ?? null,
    } as never);
    const { data: updated, error: transitionError } = rpcResult as unknown as {
      data: Record<string, unknown> | null;
      error: { message: string; code: string; hint: string; details: string } | null;
    };
    if (transitionError) {
      console.error("[POST /transition] Supabase error:", {
        message: transitionError.message,
        code: transitionError.code,
        hint: transitionError.hint,
        details: transitionError.details,
      });
      return NextResponse.json({ error: transitionError.message }, { status: 409 });
    }

    // Audit log
    await logAudit(admin, {
      organizationId,
      actorId: user.id,
      action: "work_item.transition",
      entityType: "work_item",
      entityId: id,
      oldValue: { status: fromStatus },
      newValue: { status: toStatus, reason: reason ?? null, transaction: "transition_work_item" },
    });

    const activeAssignmentsResult = await admin
      .from("assignments")
      .select("profile_id")
      .eq("work_item_id", id)
      .is("unassigned_at", null);
    const activeAssignments = activeAssignmentsResult as unknown as {
      data: { profile_id: string }[] | null;
      error: { message: string } | null;
    };

    if (activeAssignments.error) {
      console.error("[POST /transition] Gagal mengambil penerima notifikasi:", activeAssignments.error.message);
    } else {
      try {
        await publishNotificationEvent(admin, {
          eventType: "status_changed",
          organizationId,
          aggregateType: "work_item",
          aggregateId: id,
          profileIds: (activeAssignments.data ?? [])
            .map((assignment) => assignment.profile_id)
            .filter((profileId) => profileId !== user.id),
          title: "Status work item berubah",
          body: `Status berubah dari ${fromStatus} menjadi ${toStatus}.`,
          data: {
            work_item_id: id,
            from_status: fromStatus,
            to_status: toStatus,
          },
          dedupKey: `status_changed:${id}:${toStatus}:${updated?.updated_at ?? new Date().toISOString()}`,
        });
      } catch (notificationError) {
        console.error("[POST /transition] Gagal mempublikasikan event notifikasi:", notificationError);
      }
    }

    return NextResponse.json({ data: updated });
  } catch (err) {
    console.error("[POST /transition] Unexpected error:", err);
    return NextResponse.json(
      { error: "Terjadi kesalahan server." },
      { status: 500 }
    );
  }
}
