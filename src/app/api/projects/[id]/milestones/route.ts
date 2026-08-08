import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit/logger";
import { getAuthContext, requirePermission } from "@/lib/authorization";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * Helper: validasi project exists dan milik org yang sama.
 */
async function validateProjectAccess(
  admin: ReturnType<typeof createServiceRoleClient>,
  projectId: string,
  organizationId: string,
  clientIds: string[],
  isOrgWide: boolean
): Promise<{ valid: boolean; error?: string }> {
  const result = await admin
    .from("projects")
    .select(`id, work_items!projects_work_item_id_fkey!inner(organization_id, client_id, deleted_at)`)
    .eq("id", projectId)
    .eq("work_items.organization_id", organizationId)
    .is("work_items.deleted_at", null)
    .single();

  const { data, error } = result as unknown as {
    data: { id: string; work_items: { client_id: string | null } } | null;
    error: { message: string } | null;
  };

  if (error || !data) {
    return { valid: false, error: "Project tidak ditemukan." };
  }
  if (!isOrgWide && data.work_items.client_id && !clientIds.includes(data.work_items.client_id)) return { valid: false, error: "Project tidak berada dalam scope akses user." };

  return { valid: true };
}

/**
 * GET /api/projects/[id]/milestones
 * List milestones untuk project, ordered by sort_order.
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

    const authContext = await getAuthContext();
    if (authContext.response) return authContext.response;

    const permissionDenied = await requirePermission(authContext.context, "work_items.view");
    if (permissionDenied) return permissionDenied;

    const { admin, organizationId, clientIds, isOrgWide } = authContext.context;

    // Validasi project access
    const access = await validateProjectAccess(admin, id, organizationId, clientIds, isOrgWide);
    if (!access.valid) {
      return NextResponse.json({ error: access.error }, { status: 404 });
    }

    const milestonesResult = await admin
      .from("milestones")
      .select(
        "id, project_id, name, description, due_date, sort_order, is_completed, completed_at, created_at"
      )
      .eq("project_id", id)
      .is("deleted_at", null)
      .order("sort_order", { ascending: true });

    const { data, error, count } = milestonesResult as unknown as {
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
      error: { message: string; code: string; hint: string; details: string } | null;
      count: number | null;
    };

    if (error) {
      console.error("[GET /milestones] Supabase error:", {
        message: error.message,
        code: error.code,
        hint: error.hint,
        details: error.details,
      });
      return NextResponse.json(
        { error: "Gagal mengambil milestones." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      data: data ?? [],
      total: count ?? data?.length ?? 0,
    });
  } catch (err) {
    console.error("[GET /milestones] Unexpected error:", err);
    return NextResponse.json(
      { error: "Terjadi kesalahan server." },
      { status: 500 }
    );
  }
}

/**
 * POST /api/projects/[id]/milestones
 * Tambah milestone baru ke project.
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

    // Validasi project access
    const access = await validateProjectAccess(admin, id, organizationId, clientIds, isOrgWide);
    if (!access.valid) {
      return NextResponse.json({ error: access.error }, { status: 404 });
    }

    const body = await request.json();
    const { name, description, due_date, sort_order } = body as {
      name?: string;
      description?: string;
      due_date?: string;
      sort_order?: number;
    };

    if (!name || name.trim().length === 0) {
      return NextResponse.json(
        { error: "Nama milestone tidak boleh kosong." },
        { status: 400 }
      );
    }

    const insertResult = await admin
      .from("milestones")
      .insert({
        project_id: id,
        name: name.trim(),
        description: description ?? null,
        due_date: due_date ?? null,
        sort_order: sort_order ?? 0,
      } as never)
      .select()
      .single();

    const { data: milestone, error: insertError } = insertResult as unknown as {
      data: {
        id: string;
        project_id: string;
        name: string;
        description: string | null;
        due_date: string | null;
        sort_order: number;
        is_completed: boolean;
        completed_at: string | null;
        created_at: string;
      } | null;
      error: { message: string; code: string; hint: string; details: string } | null;
    };

    if (insertError) {
      console.error("[POST /milestones] Supabase error:", {
        message: insertError.message,
        code: insertError.code,
        hint: insertError.hint,
        details: insertError.details,
      });
      return NextResponse.json(
        { error: "Gagal menambahkan milestone." },
        { status: 500 }
      );
    }

    // Audit log
    await logAudit(admin, {
      organizationId,
      actorId: user.id,
      action: "milestone.created",
      entityType: "milestone",
      entityId: milestone!.id,
      newValue: { project_id: id, name: milestone!.name },
    });

    return NextResponse.json({ data: milestone }, { status: 201 });
  } catch (err) {
    console.error("[POST /milestones] Unexpected error:", err);
    return NextResponse.json(
      { error: "Terjadi kesalahan server." },
      { status: 500 }
    );
  }
}
