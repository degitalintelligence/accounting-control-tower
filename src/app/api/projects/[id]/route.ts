import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit/logger";

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
 * GET /api/projects/[id]
 * Detail project dengan milestones, child work items, dan progress stats.
 */
export async function GET(request: NextRequest, context: RouteContext) {
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

    // Ambil project + work_item
    const projResult = await admin
      .from("projects")
      .select(
        `
        id,
        work_item_id,
        objective,
        success_criteria,
        start_date,
        target_date,
        budgeted_hours,
        created_at,
        updated_at,
        work_items!inner(
          id,
          title,
          description,
          status,
          priority,
          organization_id,
          client_id,
          deleted_at
        )
      `
      )
      .eq("id", id)
      .eq("work_items.organization_id", organizationId)
      .is("work_items.deleted_at", null)
      .single();

    const { data: project, error } = projResult as unknown as {
      data: {
        id: string;
        work_item_id: string;
        objective: string | null;
        success_criteria: string | null;
        start_date: string | null;
        target_date: string | null;
        budgeted_hours: number | null;
        created_at: string;
        updated_at: string;
        work_items: {
          id: string;
          title: string;
          description: string | null;
          status: string;
          priority: string;
          organization_id: string;
          client_id: string;
        };
      } | null;
      error: { message: string; code: string; hint: string; details: string } | null;
    };

    if (error || !project) {
      return NextResponse.json(
        { error: "Project tidak ditemukan." },
        { status: 404 }
      );
    }

    // Ambil milestones (ordered by sort_order)
    const milestonesResult = await admin
      .from("milestones")
      .select("id, project_id, name, description, due_date, sort_order, is_completed, completed_at, created_at")
      .eq("project_id", id)
      .order("sort_order", { ascending: true });

    const { data: milestones } = milestonesResult as unknown as {
      data: Array<{
        id: string;
        project_id: string;
        name: string;
        description: string | null;
        due_date: string | null;
        sort_order: number;
        is_completed: boolean;
        completed_at: string | null;
        created_at: string;
      }> | null;
    };

    // Ambil child work items (project_id = this project, kecuali work_item utama)
    const childrenResult = await admin
      .from("work_items")
      .select("id, title, status, priority, due_at, is_optional, completed_at")
      .eq("project_id", id)
      .neq("id", project.work_item_id)
      .is("deleted_at", null)
      .order("created_at", { ascending: true });

    const { data: children } = childrenResult as unknown as {
      data: Array<{
        id: string;
        title: string;
        status: string;
        priority: string;
        due_at: string | null;
        is_optional: boolean;
        completed_at: string | null;
      }> | null;
    };

    const childItems = children ?? [];
    const completedChildren = childItems.filter(
      (c) => c.status === "completed" || c.status === "approved"
    ).length;

    const milestoneItems = milestones ?? [];
    const completedMilestones = milestoneItems.filter((m) => m.is_completed).length;

    return NextResponse.json({
      data: {
        id: project.id,
        work_item_id: project.work_item_id,
        objective: project.objective,
        success_criteria: project.success_criteria,
        start_date: project.start_date,
        target_date: project.target_date,
        budgeted_hours: project.budgeted_hours,
        created_at: project.created_at,
        updated_at: project.updated_at,
        title: project.work_items.title,
        description: project.work_items.description,
        status: project.work_items.status,
        priority: project.work_items.priority,
        organization_id: project.work_items.organization_id,
        client_id: project.work_items.client_id,
        milestones: milestoneItems,
        work_items: childItems,
        stats: {
          total_milestones: milestoneItems.length,
          completed_milestones: completedMilestones,
          total_work_items: childItems.length,
          completed_work_items: completedChildren,
        },
      },
    });
  } catch (err) {
    console.error("[GET /api/projects/[id]] Unexpected error:", err);
    return NextResponse.json(
      { error: "Terjadi kesalahan server." },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/projects/[id]
 * Update field project (objective, success_criteria, start_date, target_date, budgeted_hours).
 */
export async function PATCH(request: NextRequest, context: RouteContext) {
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

    // Ambil data lama untuk audit
    const fetchResult = await admin
      .from("projects")
      .select(
        `
        id,
        work_item_id,
        objective,
        success_criteria,
        start_date,
        target_date,
        budgeted_hours,
        work_items!inner(organization_id, deleted_at)
      `
      )
      .eq("id", id)
      .eq("work_items.organization_id", organizationId)
      .is("work_items.deleted_at", null)
      .single();

    const { data: existing, error: fetchError } = fetchResult as unknown as {
      data: {
        id: string;
        work_item_id: string;
        objective: string | null;
        success_criteria: string | null;
        start_date: string | null;
        target_date: string | null;
        budgeted_hours: number | null;
      } | null;
      error: { message: string; code: string; hint: string; details: string } | null;
    };

    if (fetchError || !existing) {
      return NextResponse.json(
        { error: "Project tidak ditemukan." },
        { status: 404 }
      );
    }

    const body = await request.json();

    const allowedFields = [
      "objective",
      "success_criteria",
      "start_date",
      "target_date",
      "budgeted_hours",
    ];

    const updateData: Record<string, unknown> = {};
    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updateData[field] = body[field];
      }
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { error: "Tidak ada field yang diupdate." },
        { status: 400 }
      );
    }

    updateData.updated_at = new Date().toISOString();

    const updateResult = await admin
      .from("projects")
      .update(updateData as never)
      .eq("id", id)
      .select()
      .single();

    const { data: updated, error: updateError } = updateResult as unknown as {
      data: Record<string, unknown> | null;
      error: { message: string; code: string; hint: string; details: string } | null;
    };

    if (updateError) {
      console.error("[PATCH /api/projects/[id]] Supabase error:", {
        message: updateError.message,
        code: updateError.code,
        hint: updateError.hint,
        details: updateError.details,
      });
      return NextResponse.json(
        { error: "Gagal mengupdate project." },
        { status: 500 }
      );
    }

    // Audit log
    const changedFields: Record<string, unknown> = {};
    for (const key of Object.keys(updateData)) {
      if (key === "updated_at") continue;
      changedFields[key] = {
        old: (existing as Record<string, unknown>)[key],
        new: updateData[key],
      };
    }

    await logAudit(admin, {
      organizationId,
      actorId: user.id,
      action: "project.updated",
      entityType: "project",
      entityId: id,
      oldValue: changedFields,
      newValue: updateData,
    });

    return NextResponse.json({ data: updated });
  } catch (err) {
    console.error("[PATCH /api/projects/[id]] Unexpected error:", err);
    return NextResponse.json(
      { error: "Terjadi kesalahan server." },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/projects/[id]
 * Soft delete — set work_item.deleted_at (project inherits from work_item).
 */
export async function DELETE(request: NextRequest, context: RouteContext) {
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

    // Ambil project + work_item_id
    const fetchResult = await admin
      .from("projects")
      .select(
        `
        id,
        work_item_id,
        work_items!inner(organization_id, deleted_at)
      `
      )
      .eq("id", id)
      .eq("work_items.organization_id", organizationId)
      .is("work_items.deleted_at", null)
      .single();

    const { data: existing, error: fetchError } = fetchResult as unknown as {
      data: { id: string; work_item_id: string } | null;
      error: { message: string; code: string; hint: string; details: string } | null;
    };

    if (fetchError || !existing) {
      return NextResponse.json(
        { error: "Project tidak ditemukan." },
        { status: 404 }
      );
    }

    // Soft delete via work_item
    const deleteResult = await admin
      .from("work_items")
      .update({ deleted_at: new Date().toISOString() } as never)
      .eq("id", existing.work_item_id);

    const { error: deleteError } = deleteResult as unknown as {
      error: { message: string; code: string; hint: string; details: string } | null;
    };

    if (deleteError) {
      console.error("[DELETE /api/projects/[id]] Supabase error:", {
        message: deleteError.message,
        code: deleteError.code,
        hint: deleteError.hint,
        details: deleteError.details,
      });
      return NextResponse.json(
        { error: "Gagal menghapus project." },
        { status: 500 }
      );
    }

    await logAudit(admin, {
      organizationId,
      actorId: user.id,
      action: "project.deleted",
      entityType: "project",
      entityId: id,
      oldValue: { work_item_id: existing.work_item_id },
    });

    return NextResponse.json({ message: "Project berhasil dihapus." });
  } catch (err) {
    console.error("[DELETE /api/projects/[id]] Unexpected error:", err);
    return NextResponse.json(
      { error: "Terjadi kesalahan server." },
      { status: 500 }
    );
  }
}
