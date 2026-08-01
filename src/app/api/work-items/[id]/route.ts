import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit/logger";
import { validationMessage, workItemUpdateSchema } from "@/lib/validation/schemas";

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
 * GET /api/work-items/[id]
 * Detail work item beserta assignments, status_history, jumlah comments, dan files.
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

    const wiResult = await admin
      .from("work_items")
      .select(
        `
        id,
        organization_id,
        client_id,
        entity_id,
        section_id,
        type,
        parent_id,
        project_id,
        title,
        description,
        acceptance_criteria,
        status,
        priority,
        risk_level,
        weight,
        is_optional,
        start_at,
        due_at,
        review_due_at,
        client_due_at,
        source_type,
        checklist_template_id,
        created_by,
        created_at,
        updated_at,
        completed_at,
        assignments:assignments(
          id,
          profile_id,
          role,
          assigned_by,
          assigned_at,
          unassigned_at
        ),
        status_history:work_item_status_history(
          id,
          from_status,
          to_status,
          changed_by,
          reason,
          created_at
        )
      `
      )
      .eq("id", id)
      .eq("organization_id", organizationId)
      .is("deleted_at", null)
      .single();

    const { data: workItem, error } = wiResult as unknown as {
      data: (Record<string, unknown> & { id: string; status: string }) | null;
      error: { message: string; code: string; hint: string; details: string } | null;
    };

    if (error || !workItem) {
      return NextResponse.json(
        { error: "Work item tidak ditemukan." },
        { status: 404 }
      );
    }
    const clientAccess = await admin.from("memberships").select("client_id").eq("profile_id", user.id).eq("organization_id", organizationId).eq("is_active", true);
    const clientRows = clientAccess as unknown as { data: { client_id: string | null }[] | null };
    if (!clientRows.data?.some((membership) => membership.client_id === null || membership.client_id === workItem.client_id)) {
      return NextResponse.json({ error: "Work item tidak ditemukan." }, { status: 404 });
    }

    // Hitung jumlah comments
    const commentsResult = await admin
      .from("comments")
      .select("id", { count: "exact", head: true })
      .eq("work_item_id", id)
      .is("deleted_at", null);
    const commentsCount = (commentsResult as unknown as { count: number | null }).count;

    // Hitung jumlah files
    const filesResult = await admin
      .from("work_item_files")
      .select("id", { count: "exact", head: true })
      .eq("work_item_id", id);
    const filesCount = (filesResult as unknown as { count: number | null }).count;

    return NextResponse.json({
      data: {
        ...workItem,
        comments_count: commentsCount ?? 0,
        files_count: filesCount ?? 0,
      },
    });
  } catch (err) {
    console.error("[GET /api/work-items/[id]] Unexpected error:", err);
    return NextResponse.json(
      { error: "Terjadi kesalahan server." },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/work-items/[id]
 * Update field work item (non-status). Status diubah via /transition.
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
      .from("work_items")
      .select("*")
      .eq("id", id)
      .eq("organization_id", organizationId)
      .is("deleted_at", null)
      .single();

    const { data: existing, error: fetchError } = fetchResult as unknown as {
      data: (Record<string, unknown> & { id: string; status: string }) | null;
      error: { message: string; code: string; hint: string; details: string } | null;
    };

    if (fetchError || !existing) {
      return NextResponse.json(
        { error: "Work item tidak ditemukan." },
        { status: 404 }
      );
    }
    const existingClientId = existing.client_id as string | null | undefined;
    const clientScope = await admin.from("memberships").select("client_id").eq("profile_id", user.id).eq("organization_id", organizationId).eq("is_active", true);
    const clientScopeData = clientScope as unknown as { data: { client_id: string | null }[] | null };
    if (!clientScopeData.data?.some((membership) => membership.client_id === null || membership.client_id === existingClientId)) {
      return NextResponse.json({ error: "Work item tidak ditemukan." }, { status: 404 });
    }

    const parsed = workItemUpdateSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: validationMessage(parsed.error) }, { status: 400 });
    const updateData: Record<string, unknown> = parsed.data;

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { error: "Tidak ada field yang diupdate." },
        { status: 400 }
      );
    }

    updateData.updated_at = new Date().toISOString();

    const updateResult = await admin
      .from("work_items")
      .update(updateData as never)
      .eq("id", id)
      .select()
      .single();
    const { data: updated, error: updateError } = updateResult as unknown as {
      data: Record<string, unknown> | null;
      error: { message: string; code: string; hint: string; details: string } | null;
    };

    if (updateError) {
      console.error("[PATCH /api/work-items/[id]] Supabase error:", {
        message: updateError.message,
        code: updateError.code,
        hint: updateError.hint,
        details: updateError.details,
      });
      return NextResponse.json(
        { error: "Gagal mengupdate work item." },
        { status: 500 }
      );
    }

    // Audit log — hanya field yang berubah
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
      action: "work_item.updated",
      entityType: "work_item",
      entityId: id,
      oldValue: changedFields,
      newValue: updateData,
    });

    return NextResponse.json({ data: updated });
  } catch (err) {
    console.error("[PATCH /api/work-items/[id]] Unexpected error:", err);
    return NextResponse.json(
      { error: "Terjadi kesalahan server." },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/work-items/[id]
 * Soft delete — set deleted_at.
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

    const delFetchResult = await admin
      .from("work_items")
      .select("id, organization_id, status")
      .eq("id", id)
      .eq("organization_id", organizationId)
      .is("deleted_at", null)
      .single();

    const { data: existing, error: fetchError } = delFetchResult as unknown as {
      data: { id: string; organization_id: string; status: string } | null;
      error: { message: string; code: string; hint: string; details: string } | null;
    };

    if (fetchError || !existing) {
      return NextResponse.json(
        { error: "Work item tidak ditemukan." },
        { status: 404 }
      );
    }
    const clientScope = await admin.from("memberships").select("client_id").eq("profile_id", user.id).eq("organization_id", organizationId).eq("is_active", true);
    const clientScopeData = clientScope as unknown as { data: { client_id: string | null }[] | null };
    const itemClient = await admin.from("work_items").select("client_id").eq("id", id).eq("organization_id", organizationId).single();
    const itemClientData = itemClient as unknown as { data: { client_id: string } | null };
    if (!itemClientData.data || !clientScopeData.data?.some((membership) => membership.client_id === null || membership.client_id === itemClientData.data?.client_id)) {
      return NextResponse.json({ error: "Work item tidak ditemukan." }, { status: 404 });
    }

    const deleteResult = await admin
      .from("work_items")
      .update({ deleted_at: new Date().toISOString() } as never)
      .eq("id", id);

    const { error: deleteError } = deleteResult as unknown as {
      error: { message: string; code: string; hint: string; details: string } | null;
    };

    if (deleteError) {
      console.error("[DELETE /api/work-items/[id]] Supabase error:", {
        message: deleteError.message,
        code: deleteError.code,
        hint: deleteError.hint,
        details: deleteError.details,
      });
      return NextResponse.json(
        { error: "Gagal menghapus work item." },
        { status: 500 }
      );
    }

    await logAudit(admin, {
      organizationId,
      actorId: user.id,
      action: "work_item.deleted",
      entityType: "work_item",
      entityId: id,
      oldValue: { status: existing.status },
    });

    return NextResponse.json({ message: "Work item berhasil dihapus." });
  } catch (err) {
    console.error("[DELETE /api/work-items/[id]] Unexpected error:", err);
    return NextResponse.json(
      { error: "Terjadi kesalahan server." },
      { status: 500 }
    );
  }
}
