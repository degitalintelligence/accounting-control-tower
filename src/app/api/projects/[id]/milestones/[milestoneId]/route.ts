import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit/logger";

type RouteContext = {
  params: Promise<{ id: string; milestoneId: string }>;
};

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
 * PATCH /api/projects/[id]/milestones/[milestoneId]
 * Update milestone (name, description, due_date, sort_order, is_completed).
 * Jika is_completed=true, set completed_at=now(). Jika false, clear completed_at.
 */
export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const supabase = await createClient();
    const { id, milestoneId } = await context.params;

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

    // Validasi project access
    const projResult = await admin
      .from("projects")
      .select(`id, work_items!projects_work_item_id_fkey!inner(organization_id, deleted_at)`)
      .eq("id", id)
      .eq("work_items.organization_id", organizationId)
      .is("work_items.deleted_at", null)
      .single();

    const { data: project, error: projError } = projResult as unknown as {
      data: { id: string } | null;
      error: { message: string } | null;
    };

    if (projError || !project) {
      return NextResponse.json(
        { error: "Project tidak ditemukan." },
        { status: 404 }
      );
    }

    // Ambil data lama milestone
    const fetchResult = await admin
      .from("milestones")
      .select("id, project_id, name, description, due_date, sort_order, is_completed, completed_at")
      .eq("id", milestoneId)
      .eq("project_id", id)
      .is("deleted_at", null)
      .single();

    const { data: existing, error: fetchError } = fetchResult as unknown as {
      data: {
        id: string;
        project_id: string;
        name: string;
        description: string | null;
        due_date: string | null;
        sort_order: number;
        is_completed: boolean;
        completed_at: string | null;
      } | null;
      error: { message: string; code: string; hint: string; details: string } | null;
    };

    if (fetchError || !existing) {
      return NextResponse.json(
        { error: "Milestone tidak ditemukan." },
        { status: 404 }
      );
    }

    const body = await request.json();

    const allowedFields = ["name", "description", "due_date", "sort_order"];
    const updateData: Record<string, unknown> = {};

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updateData[field] = body[field];
      }
    }

    // Handle is_completed logic
    if (body.is_completed !== undefined) {
      updateData.is_completed = body.is_completed;
      if (body.is_completed === true) {
        updateData.completed_at = new Date().toISOString();
      } else {
        updateData.completed_at = null;
      }
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { error: "Tidak ada field yang diupdate." },
        { status: 400 }
      );
    }

    const updateResult = await admin
      .from("milestones")
      .update(updateData as never)
      .eq("id", milestoneId)
      .eq("project_id", id)
      .is("deleted_at", null)
      .select()
      .single();

    const { data: updated, error: updateError } = updateResult as unknown as {
      data: Record<string, unknown> | null;
      error: { message: string; code: string; hint: string; details: string } | null;
    };

    if (updateError) {
      console.error("[PATCH /milestones] Supabase error:", {
        message: updateError.message,
        code: updateError.code,
        hint: updateError.hint,
        details: updateError.details,
      });
      return NextResponse.json(
        { error: "Gagal mengupdate milestone." },
        { status: 500 }
      );
    }

    // Audit log
    await logAudit(admin, {
      organizationId,
      actorId: user.id,
      action: "milestone.updated",
      entityType: "milestone",
      entityId: milestoneId,
      oldValue: existing,
      newValue: updateData,
    });

    return NextResponse.json({ data: updated });
  } catch (err) {
    console.error("[PATCH /milestones] Unexpected error:", err);
    return NextResponse.json(
      { error: "Terjadi kesalahan server." },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/projects/[id]/milestones/[milestoneId]
 * Hapus milestone.
 */
export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const supabase = await createClient();
    const { id, milestoneId } = await context.params;

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

    // Validasi project access
    const projResult = await admin
      .from("projects")
      .select(`id, work_items!projects_work_item_id_fkey!inner(organization_id, deleted_at)`)
      .eq("id", id)
      .eq("work_items.organization_id", organizationId)
      .is("work_items.deleted_at", null)
      .single();

    const { data: project, error: projError } = projResult as unknown as {
      data: { id: string } | null;
      error: { message: string } | null;
    };

    if (projError || !project) {
      return NextResponse.json(
        { error: "Project tidak ditemukan." },
        { status: 404 }
      );
    }

    // Validasi milestone exists
    const fetchResult = await admin
      .from("milestones")
      .select("id, name")
      .eq("id", milestoneId)
      .eq("project_id", id)
      .is("deleted_at", null)
      .is("deleted_at", null)
      .single();

    const { data: existing, error: fetchError } = fetchResult as unknown as {
      data: { id: string; name: string } | null;
      error: { message: string } | null;
    };

    if (fetchError || !existing) {
      return NextResponse.json(
        { error: "Milestone tidak ditemukan." },
        { status: 404 }
      );
    }

    const deleteResult = await admin
      .from("milestones")
      .update({ deleted_at: new Date().toISOString() } as never)
      .eq("id", milestoneId)
      .eq("project_id", id)
      .is("deleted_at", null);

    const { error: deleteError } = deleteResult as unknown as {
      error: { message: string; code: string; hint: string; details: string } | null;
    };

    if (deleteError) {
      console.error("[DELETE /milestones] Supabase error:", {
        message: deleteError.message,
        code: deleteError.code,
        hint: deleteError.hint,
        details: deleteError.details,
      });
      return NextResponse.json(
        { error: "Gagal menghapus milestone." },
        { status: 500 }
      );
    }

    // Audit log
    await logAudit(admin, {
      organizationId,
      actorId: user.id,
      action: "milestone.deleted",
      entityType: "milestone",
      entityId: milestoneId,
      oldValue: { project_id: id, name: existing.name },
    });

    return NextResponse.json({ message: "Milestone berhasil dihapus." });
  } catch (err) {
    console.error("[DELETE /milestones] Unexpected error:", err);
    return NextResponse.json(
      { error: "Terjadi kesalahan server." },
      { status: 500 }
    );
  }
}
