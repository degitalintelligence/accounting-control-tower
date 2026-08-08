import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit/logger";
import { getAuthContext, requirePermission } from "@/lib/authorization";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * POST /api/projects/[id]/link-work-item
 * Link existing work_item ke project (set work_item.project_id).
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

    const authContext = await getAuthContext();
    if (authContext.response) return authContext.response;

    const permissionDenied = await requirePermission(authContext.context, "work_items.manage");
    if (permissionDenied) return permissionDenied;

    const { admin, organizationId, clientIds, isOrgWide } = authContext.context;

    // Validasi project exists dan milik org
    let projQuery = admin
      .from("projects")
      .select("id, work_item_id, work_items!projects_work_item_id_fkey!inner(organization_id, client_id, deleted_at)")
      .eq("id", id)
      .eq("work_items.organization_id", organizationId)
      .is("work_items.deleted_at", null);
    if (!isOrgWide) projQuery = projQuery.in("work_items.client_id", clientIds);
    const projResult = await projQuery.single();

    const { data: project, error: projError } = projResult as unknown as {
      data: {
        id: string;
        work_item_id: string;
        work_items: { organization_id: string; client_id: string; deleted_at: string | null };
      } | null;
      error: { message: string } | null;
    };

    if (projError || !project) {
      return NextResponse.json(
        { error: "Project tidak ditemukan." },
        { status: 404 }
      );
    }

    const body = await request.json();
    const { work_item_id } = body as { work_item_id?: string };

    if (!work_item_id) {
      return NextResponse.json(
        { error: "Field wajib: work_item_id." },
        { status: 400 }
      );
    }

    // Validasi work_item exists dan milik org yang sama
    const wiResult = await admin
      .from("work_items")
      .select("id, organization_id, client_id, project_id, title")
      .eq("id", work_item_id)
      .eq("organization_id", organizationId)
      .is("deleted_at", null)
      .single();

    const { data: workItem, error: wiError } = wiResult as unknown as {
      data: {
        id: string;
        organization_id: string;
        client_id: string;
        project_id: string | null;
        title: string;
      } | null;
      error: { message: string; code: string; hint: string; details: string } | null;
    };

    if (wiError || !workItem) {
      return NextResponse.json(
        { error: "Work item tidak ditemukan atau bukan milik organisasi ini." },
        { status: 404 }
      );
    }

    if (workItem.client_id !== project.work_items.client_id) {
      return NextResponse.json(
        { error: "Work item harus berasal dari client yang sama dengan project." },
        { status: 409 }
      );
    }

    // Cek apakah sudah linked ke project lain
    if (workItem.project_id && workItem.project_id !== id) {
      return NextResponse.json(
        { error: "Work item sudah linked ke project lain." },
        { status: 409 }
      );
    }

    // Update work_item.project_id
    const updateResult = await admin
      .from("work_items")
      .update({ project_id: id } as never)
      .eq("id", work_item_id)
      .eq("organization_id", organizationId)
      .is("deleted_at", null);

    const { error: updateError } = updateResult as unknown as {
      error: { message: string; code: string; hint: string; details: string } | null;
    };

    if (updateError) {
      console.error("[POST /link-work-item] Supabase error:", {
        message: updateError.message,
        code: updateError.code,
        hint: updateError.hint,
        details: updateError.details,
      });
      return NextResponse.json(
        { error: "Gagal meng-link work item ke project." },
        { status: 500 }
      );
    }

    // Audit log
    await logAudit(admin, {
      organizationId,
      actorId: user.id,
      action: "project.work_item_linked",
      entityType: "project",
      entityId: id,
      newValue: { work_item_id, work_item_title: workItem.title },
    });

    return NextResponse.json({
      message: "Work item berhasil di-link ke project.",
      data: { work_item_id, project_id: id },
    });
  } catch (err) {
    console.error("[POST /link-work-item] Unexpected error:", err);
    return NextResponse.json(
      { error: "Terjadi kesalahan server." },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/projects/[id]/link-work-item
 * Unlink work_item dari project (set work_item.project_id = null).
 * Body: { work_item_id: string }
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

    const authContext = await getAuthContext();
    if (authContext.response) return authContext.response;

    const permissionDenied = await requirePermission(authContext.context, "work_items.manage");
    if (permissionDenied) return permissionDenied;

    const { admin, organizationId, clientIds, isOrgWide } = authContext.context;

    // Validasi project exists dan milik org
    let projQuery = admin
      .from("projects")
      .select(`id, work_item_id, work_items!projects_work_item_id_fkey!inner(organization_id, client_id, deleted_at)`)
      .eq("id", id)
      .eq("work_items.organization_id", organizationId)
      .is("work_items.deleted_at", null);
    if (!isOrgWide) projQuery = projQuery.in("work_items.client_id", clientIds);
    const projResult = await projQuery.single();

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

    const body = await request.json();
    const { work_item_id } = body as { work_item_id?: string };

    if (!work_item_id) {
      return NextResponse.json(
        { error: "Field wajib: work_item_id." },
        { status: 400 }
      );
    }

    // Validasi work_item exists dan linked ke project ini
    const wiResult = await admin
      .from("work_items")
      .select("id, organization_id, project_id, title")
      .eq("id", work_item_id)
      .eq("organization_id", organizationId)
      .eq("project_id", id)
      .is("deleted_at", null)
      .single();

    const { data: workItem, error: wiError } = wiResult as unknown as {
      data: {
        id: string;
        organization_id: string;
        project_id: string | null;
        title: string;
      } | null;
      error: { message: string; code: string; hint: string; details: string } | null;
    };

    if (wiError || !workItem) {
      return NextResponse.json(
        { error: "Work item tidak ditemukan atau tidak linked ke project ini." },
        { status: 404 }
      );
    }

    // Unlink: set project_id = null
    const updateResult = await admin
      .from("work_items")
      .update({ project_id: null } as never)
      .eq("id", work_item_id)
      .eq("organization_id", organizationId)
      .is("deleted_at", null);

    const { error: updateError } = updateResult as unknown as {
      error: { message: string; code: string; hint: string; details: string } | null;
    };

    if (updateError) {
      console.error("[DELETE /link-work-item] Supabase error:", {
        message: updateError.message,
        code: updateError.code,
        hint: updateError.hint,
        details: updateError.details,
      });
      return NextResponse.json(
        { error: "Gagal meng-unlink work item dari project." },
        { status: 500 }
      );
    }

    // Audit log
    await logAudit(admin, {
      organizationId,
      actorId: user.id,
      action: "project.work_item_unlinked",
      entityType: "project",
      entityId: id,
      oldValue: { work_item_id, work_item_title: workItem.title },
    });

    return NextResponse.json({
      message: "Work item berhasil di-unlink dari project.",
    });
  } catch (err) {
    console.error("[DELETE /link-work-item] Unexpected error:", err);
    return NextResponse.json(
      { error: "Terjadi kesalahan server." },
      { status: 500 }
    );
  }
}
