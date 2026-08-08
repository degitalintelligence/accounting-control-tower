import { NextRequest, NextResponse } from "next/server";
import { logAudit } from "@/lib/audit/logger";
import { validationMessage, workItemCreateSchema } from "@/lib/validation/schemas";
import { canAccessClient, getAuthContext, requirePermission } from "@/lib/authorization";
import { evaluateApprovalPolicy } from "@/lib/work-engine/approval-policy";

/**
 * GET /api/work-items
 * List work items dengan filter, search, dan pagination.
 * Auth via cookie-based client; queries via service role (bypass RLS).
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthContext();
    if (auth.response) return auth.response;
    const denied = await requirePermission(auth.context, "work_items.view");
    if (denied) return denied;
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
    const clientId = searchParams.get("client_id");
    const entityId = searchParams.get("entity_id");
    const sectionId = searchParams.get("section_id");
    const riskLevel = searchParams.get("risk_level");
    const periodFrom = searchParams.get("period_from");
    const periodTo = searchParams.get("period_to");
    const sourceType = searchParams.get("source_type");
    const search = searchParams.get("search");
    const overdueOnly = searchParams.get("overdue_only") === "true";
    const filter = searchParams.get("filter");

    const withDetail = searchParams.get("detail") !== "0";
    const withCount = searchParams.get("count") !== "0";

    const columns = [
      "id",
      "organization_id",
      "client_id",
      "project_id",
      "parent_id",
      "type",
      "title",
      "description",
      "status",
      "priority",
      "risk_level",
      "due_at",
      "start_at",
      "is_optional",
      "created_by",
      "created_at",
      "updated_at",
      "completed_at",
      "clients:clients(id, name)"
    ];
    if (withDetail) {
      columns.push("assignments:assignments(id, profile_id, role, assigned_at, unassigned_at)");
    }

    let query = admin
      .from("work_items")
      .select(columns.join(",\n"), withCount ? { count: "exact" } : undefined)
      .eq("organization_id", organizationId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .range(from, to);

    if (!isOrgWide) query = query.in("client_id", clientIds);
    if (clientId && (isOrgWide || clientIds.includes(clientId))) query = query.eq("client_id", clientId);
    if (entityId) query = query.eq("entity_id", entityId);
    if (sectionId) query = query.eq("section_id", sectionId);
    if (riskLevel) query = query.eq("risk_level", riskLevel);
    if (periodFrom) query = query.gte("due_at", periodFrom);
    if (periodTo) query = query.lte("due_at", periodTo);
    if (sourceType) query = query.eq("source_type", sourceType);

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
    const denied = await requirePermission(auth.context, "work_items.create");
    if (denied) return denied;
    const { admin, userId, organizationId } = auth.context;

    const parsed = workItemCreateSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: validationMessage(parsed.error) }, { status: 400 });
    const body = parsed.data;

    const { assigneeId, assigneeRole, duplicate_action: duplicateAction, business_period: businessPeriod, ...workItemFields } = body;
    const amount = workItemFields.amount ?? null;
    const currencyCode = workItemFields.currency_code ?? "IDR";
    if (!canAccessClient(auth.context, workItemFields.client_id)) {
      return NextResponse.json({ error: "Client tidak berada dalam scope akses user." }, { status: 403 });
    }

    const duplicateResult = await admin.rpc("find_business_task_duplicates", {
      p_organization_id: organizationId,
      p_client_id: workItemFields.client_id,
      p_type: workItemFields.type,
      p_title: workItemFields.title,
      p_business_period: businessPeriod ?? null,
      p_entity_id: workItemFields.entity_id ?? null,
      p_section_id: workItemFields.section_id ?? null,
      p_exclude_work_item_id: null,
    } as never);
    const duplicateQuery = duplicateResult as unknown as { data: Array<Record<string, unknown>> | null; error: { message: string; code?: string; hint?: string; details?: string } | null };
    if (duplicateQuery.error) {
      console.error("[POST /api/work-items] Duplicate check error:", { message: duplicateQuery.error.message, code: duplicateQuery.error.code, hint: duplicateQuery.error.hint, details: duplicateQuery.error.details });
      return NextResponse.json({ error: "Gagal memeriksa pekerjaan serupa." }, { status: 500 });
    }

    if (workItemFields.checklist_template_id) {
      const checklistResult = await admin
        .from("checklist_templates")
        .select("id")
        .eq("id", workItemFields.checklist_template_id)
        .eq("organization_id", organizationId)
        .eq("is_active", true)
        .is("deleted_at", null)
        .single();
      const checklist = checklistResult as unknown as { data: { id: string } | null; error: { message: string } | null };
      if (checklist.error || !checklist.data) return NextResponse.json({ error: "Template checklist tidak valid untuk organisasi ini." }, { status: 400 });
    }
    const policy = amount === null ? null : await evaluateApprovalPolicy(admin, { organizationId, clientId: workItemFields.client_id, entityId: workItemFields.entity_id ?? null, workItemType: workItemFields.type, riskLevel: workItemFields.risk_level ?? "medium", priority: workItemFields.priority ?? "medium", amount, currencyCode });
    if (duplicateQuery.data?.length && duplicateAction !== "allow") {
      return NextResponse.json({ error: { code: "DUPLICATE_BUSINESS_TASK", message: "Ditemukan pekerjaan aktif dengan identitas bisnis yang sama." }, duplicates: duplicateQuery.data }, { status: 409 });
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
      business_period: businessPeriod ?? null,
      amount,
      currency_code: currencyCode,
      approval_requirement: policy?.approval_requirement ?? "none",
      required_approval_level: policy?.required_approval_level ?? 0,
      approval_policy_id: policy?.policy_id ?? null,
      approval_policy_version: policy?.policy_version ?? null,
      policy_evaluated_at: policy ? new Date().toISOString() : null,
      checklist_template_id: workItemFields.checklist_template_id ?? null,
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
          p_business_period: insertData.business_period,
          p_amount: insertData.amount,
          p_currency_code: insertData.currency_code,
          p_approval_requirement: insertData.approval_requirement,
          p_required_approval_level: insertData.required_approval_level,
          p_approval_policy_id: insertData.approval_policy_id,
          p_approval_policy_version: insertData.approval_policy_version,
          p_policy_evaluated_at: insertData.policy_evaluated_at,
          p_checklist_template_id: insertData.checklist_template_id,
          p_duplicate_warning_acknowledged_at: duplicateAction === "allow" ? new Date().toISOString() : null,
          p_duplicate_warning_acknowledged_by: duplicateAction === "allow" ? userId : null,
        } as never)
      : await admin.from("work_items").insert({ ...insertData, duplicate_warning_acknowledged_at: duplicateAction === "allow" ? new Date().toISOString() : null, duplicate_warning_acknowledged_by: duplicateAction === "allow" ? userId : null } as never).select().single();

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
