import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit/logger";
import { validationMessage, workItemCreateSchema } from "@/lib/validation/schemas";

/**
 * Helper: ambil organization_id dari membership user.
 * Menggunakan service role client (bypass RLS).
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
 * GET /api/work-items
 * List work items dengan filter, search, dan pagination.
 * Auth via cookie-based client; queries via service role (bypass RLS).
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const admin = createServiceRoleClient();

    // Ambil organization_id dari membership
    const { organizationId, error: orgError } = await getUserOrganizationId(admin, user.id);
    if (orgError || !organizationId) {
      console.error("[GET /api/work-items] Gagal ambil org:", { message: orgError });
      return NextResponse.json(
        { error: "Organisasi tidak ditemukan untuk user ini." },
        { status: 403 }
      );
    }

    const { searchParams } = request.nextUrl;
    const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
    const limit = Math.min(
      100,
      Math.max(1, parseInt(searchParams.get("limit") ?? "20", 10))
    );
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    const status = searchParams.get("status");
    const type = searchParams.get("type");
    const priority = searchParams.get("priority");
    const assigneeId = searchParams.get("assignee_id");
    const projectId = searchParams.get("project_id");
    const search = searchParams.get("search");
    const overdueOnly = searchParams.get("overdue_only") === "true";

    let query = admin
      .from("work_items")
      .select(
        `
        id,
        organization_id,
        client_id,
        project_id,
        parent_id,
        type,
        title,
        description,
        status,
        priority,
        risk_level,
        due_at,
        start_at,
        is_optional,
        created_by,
        created_at,
        updated_at,
        completed_at,
        assignments:assignments(
          id,
          profile_id,
          role,
          assigned_at,
          unassigned_at
        )
      `,
        { count: "exact" }
      )
      .eq("organization_id", organizationId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .range(from, to);

    if (status) {
      query = query.eq("status", status);
    }
    if (type) {
      query = query.eq("type", type);
    }
    if (priority) {
      query = query.eq("priority", priority);
    }
    if (projectId) {
      query = query.eq("project_id", projectId);
    }
    if (search) {
      query = query.ilike("title", `%${search}%`);
    }
    if (overdueOnly) {
      query = query
        .lt("due_at", new Date().toISOString())
        .not("status", "in", '("completed","cancelled")');
    }
    if (assigneeId) {
      query = query.eq("assignments.profile_id", assigneeId);
    }

    const queryResult = await query;
    const { data, error, count } = queryResult as unknown as {
      data: unknown[] | null;
      error: { message: string; code: string; hint: string; details: string } | null;
      count: number | null;
    };

    if (error) {
      console.error("[GET /api/work-items] Supabase error:", {
        message: error.message,
        code: error.code,
        hint: error.hint,
        details: error.details,
      });
      return NextResponse.json(
        { error: "Gagal mengambil data work items." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      data: data ?? [],
      total: count ?? 0,
      page,
      limit,
    });
  } catch (err) {
    console.error("[GET /api/work-items] Unexpected error:", err);
    return NextResponse.json(
      { error: "Terjadi kesalahan server." },
      { status: 500 }
    );
  }
}

/**
 * POST /api/work-items
 * Buat work item baru. Status awal: 'draft'.
 * Auth via cookie-based client; queries via service role (bypass RLS).
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const admin = createServiceRoleClient();

    // Ambil organization_id dari membership
    const { organizationId, error: orgError } = await getUserOrganizationId(admin, user.id);
    if (orgError || !organizationId) {
      console.error("[POST /api/work-items] Gagal ambil org:", { message: orgError });
      return NextResponse.json(
        { error: "Organisasi tidak ditemukan untuk user ini." },
        { status: 403 }
      );
    }

    const parsed = workItemCreateSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: validationMessage(parsed.error) }, { status: 400 });
    const body = parsed.data;

    const { assigneeId, assigneeRole, ...workItemFields } = body;

    const insertData = {
      title: workItemFields.title,
      type: workItemFields.type,
      organization_id: organizationId,
      client_id: workItemFields.client_id,
      description: workItemFields.description ?? null,
      acceptance_criteria: workItemFields.acceptance_criteria ?? null,
      priority: workItemFields.priority ?? "medium",
      risk_level: workItemFields.risk_level ?? "medium",
      due_at: workItemFields.due_at ?? null,
      start_at: workItemFields.start_at ?? null,
      project_id: workItemFields.project_id ?? null,
      parent_id: workItemFields.parent_id ?? null,
      entity_id: workItemFields.entity_id ?? null,
      section_id: workItemFields.section_id ?? null,
      status: "draft" as const,
      created_by: user.id,
    };

    const insertResult = await admin
      .from("work_items")
      .insert(insertData as never)
      .select()
      .single();

    const { data: workItem, error } = insertResult as unknown as {
      data: (typeof insertData & { id: string }) | null;
      error: { message: string; code: string; hint: string; details: string } | null;
    };

    if (error) {
      console.error("[POST /api/work-items] Supabase error:", {
        message: error.message,
        code: error.code,
        hint: error.hint,
        details: error.details,
      });
      return NextResponse.json(
        { error: "Gagal membuat work item." },
        { status: 500 }
      );
    }

    // Auto-assign jika assigneeId diberikan
    if (assigneeId && workItem) {
      const role = assigneeRole ?? "maker";
      const assignResult = await admin.from("assignments").insert({
        work_item_id: workItem.id,
        profile_id: assigneeId,
        role,
        assigned_by: user.id,
      } as never);
      const { error: assignError } = assignResult as unknown as {
        error: { message: string; code: string; hint: string; details: string } | null;
      };

      if (assignError) {
        console.error("[POST /api/work-items] Gagal auto-assign:", {
          message: assignError.message,
          code: assignError.code,
          hint: assignError.hint,
          details: assignError.details,
        });
      }
    }

    // Audit log
    await logAudit(admin, {
      organizationId,
      actorId: user.id,
      action: "work_item.created",
      entityType: "work_item",
      entityId: workItem!.id,
      newValue: workItem,
    });

    return NextResponse.json({ data: workItem }, { status: 201 });
  } catch (err) {
    console.error("[POST /api/work-items] Unexpected error:", err);
    return NextResponse.json(
      { error: "Terjadi kesalahan server." },
      { status: 500 }
    );
  }
}
