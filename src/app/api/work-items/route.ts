import { NextRequest, NextResponse } from "next/server";
import { logAudit } from "@/lib/audit/logger";
import { validationMessage, workItemCreateSchema } from "@/lib/validation/schemas";
import { canAccessClient, getAuthContext } from "@/lib/authorization";

/**
 * GET /api/work-items
 * List work items dengan filter, search, dan pagination.
 * Auth via cookie-based client; queries via service role (bypass RLS).
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthContext();
    if (auth.response) return auth.response;
    const { admin, organizationId, isOrgWide, clientIds } = auth.context;

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
    const filter = searchParams.get("filter");

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

    if (!isOrgWide) query = query.in("client_id", clientIds);

    if (status) {
      query = query.eq("status", status);
    }
    if (filter === "review") {
      query = query.eq("status", "under_review");
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
    const auth = await getAuthContext();
    if (auth.response) return auth.response;
    const { admin, userId, organizationId } = auth.context;

    const parsed = workItemCreateSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: validationMessage(parsed.error) }, { status: 400 });
    const body = parsed.data;

    const { assigneeId, assigneeRole, ...workItemFields } = body;
    if (!canAccessClient(auth.context, workItemFields.client_id)) {
      return NextResponse.json({ error: "Client tidak berada dalam scope akses user." }, { status: 403 });
    }

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
      created_by: userId,
    };

    const role = assigneeId ? assigneeRole ?? "maker" : null;
    const insertResult = assigneeId
      ? await admin.rpc("create_work_item_with_assignment", {
          p_title: insertData.title,
          p_type: insertData.type,
          p_organization_id: insertData.organization_id,
          p_client_id: insertData.client_id,
          p_description: insertData.description,
          p_acceptance_criteria: insertData.acceptance_criteria,
          p_priority: insertData.priority,
          p_risk_level: insertData.risk_level,
          p_due_at: insertData.due_at,
          p_start_at: insertData.start_at,
          p_project_id: insertData.project_id,
          p_parent_id: insertData.parent_id,
          p_entity_id: insertData.entity_id,
          p_section_id: insertData.section_id,
          p_created_by: insertData.created_by,
          p_assignee_id: assigneeId,
          p_assignee_role: role,
        } as never)
      : await admin.from("work_items").insert(insertData as never).select().single();

    const { data: rawWorkItem, error } = insertResult as unknown as {
      data: (typeof insertData & { id: string }) | (typeof insertData & { id: string })[] | null;
      error: { message: string; code: string; hint: string; details: string } | null;
    };
    const workItem = Array.isArray(rawWorkItem) ? rawWorkItem[0] ?? null : rawWorkItem;

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

    // Audit log
    await logAudit(admin, {
      organizationId,
      actorId: userId,
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
