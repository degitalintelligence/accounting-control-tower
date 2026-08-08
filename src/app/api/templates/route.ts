import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit/logger";
import type { CreateTemplateInput } from "@/types/template";
import type { WorkItemType } from "@/types/work-item";
import { canAccessClient, getAuthContext, requirePermission } from "@/lib/authorization";

/**
 * GET /api/templates
 * List template untuk org user. Include versi terbaru tiap template.
 * Filter opsional: type, client_id, search (name).
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

    const authContext = await getAuthContext();
    if (authContext.response) return authContext.response;
    const permissionDenied = await requirePermission(authContext.context, "work_items.view");
    if (permissionDenied) return permissionDenied;

    const { admin, organizationId, clientIds, isOrgWide } = authContext.context;

    const { searchParams } = request.nextUrl;
    const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
    const limit = Math.min(
      100,
      Math.max(1, parseInt(searchParams.get("limit") ?? "20", 10))
    );
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    const type = searchParams.get("type");
    const clientId = searchParams.get("client_id");
    const search = searchParams.get("search");

    let query = admin
      .from("task_templates")
      .select(
        `
        id,
        organization_id,
        client_id,
        entity_id,
        section_id,
        name,
        description,
        type,
        priority,
        risk_level,
        is_active,
        effective_from,
        effective_until,
        parent_template_id,
        created_by,
        created_at,
        updated_at,
        template_versions(
          id,
          template_id,
          version_number,
          title_template,
          description_template,
          acceptance_criteria_template,
          checklist_template_id,
          weight,
          is_optional,
          effective_from,
          notes,
          created_at
        )
      `,
        { count: "exact" }
      )
      .eq("organization_id", organizationId)
      .is("deleted_at", null)
      .eq("is_active", true);
    if (!isOrgWide) query = query.in("client_id", clientIds);
    query = query.order("created_at", { ascending: false }).range(from, to);

    if (type) {
      query = query.eq("type", type);
    }
    if (clientId && !canAccessClient(authContext.context, clientId)) return NextResponse.json({ error: "Client tidak berada dalam scope user." }, { status: 403 });
    if (clientId) {
      query = query.eq("client_id", clientId);
    }
    if (search) {
      query = query.ilike("name", `%${search}%`);
    }

    const queryResult = await query;
    const { data, error, count } = queryResult as unknown as {
      data: unknown[] | null;
      error: { message: string; code: string; hint: string; details: string } | null;
      count: number | null;
    };

    if (error) {
      console.error("[GET /api/templates] Supabase error:", {
        message: error.message,
        code: error.code,
        hint: error.hint,
        details: error.details,
      });
      return NextResponse.json(
        { error: "Gagal mengambil data template." },
        { status: 500 }
      );
    }

    // Sort versions per template descending (latest first) & ambil versi terbaru
    const templates = (data ?? []).map((t) => {
      const item = t as Record<string, unknown>;
      const versions = (item.template_versions as unknown[]) ?? [];
      versions.sort((a, b) => ((b as Record<string, number>).version_number ?? 0) - ((a as Record<string, number>).version_number ?? 0));
      return {
        ...item,
        latest_version: versions[0] ?? null,
        template_versions: undefined,
      };
    });

    return NextResponse.json({
      data: templates,
      total: count ?? 0,
      page,
      limit,
    });
  } catch (err) {
    console.error("[GET /api/templates] Unexpected error:", err);
    return NextResponse.json(
      { error: "Terjadi kesalahan server." },
      { status: 500 }
    );
  }
}

/**
 * POST /api/templates
 * Buat template baru + versi pertama.
 * organization_id dari membership, created_by = user.id.
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

    const authContext = await getAuthContext();
    if (authContext.response) return authContext.response;
    const permissionDenied = await requirePermission(authContext.context, "work_items.manage");
    if (permissionDenied) return permissionDenied;

    const { admin, organizationId } = authContext.context;

    const body = (await request.json()) as CreateTemplateInput;

    // Validasi field wajib
    if (!body.name || !body.client_id || !body.version?.title_template) {
      return NextResponse.json(
        { error: "Field wajib: name, client_id, version.title_template" },
        { status: 400 }
      );
    }

    const clientResult = await admin.from("clients").select("id").eq("id", body.client_id).eq("organization_id", organizationId).is("deleted_at", null).maybeSingle();
    const client = clientResult as unknown as { data: { id: string } | null; error: unknown };
    if (client.error || !client.data) return NextResponse.json({ error: "Client tidak ditemukan dalam organisasi ini." }, { status: 400 });
    if (body.entity_id) {
      const entityResult = await admin.from("entities").select("id").eq("id", body.entity_id).eq("organization_id", organizationId).eq("client_id", body.client_id).is("deleted_at", null).maybeSingle();
      const entity = entityResult as unknown as { data: { id: string } | null; error: unknown };
      if (entity.error || !entity.data) return NextResponse.json({ error: "Entity tidak valid untuk client ini." }, { status: 400 });
    }
    if (body.section_id) {
      const sectionResult = await admin.from("sections").select("id").eq("id", body.section_id).eq("organization_id", organizationId).or(`client_id.is.null,client_id.eq.${body.client_id}`).is("deleted_at", null).maybeSingle();
      const section = sectionResult as unknown as { data: { id: string } | null; error: unknown };
      if (section.error || !section.data) return NextResponse.json({ error: "Section tidak valid untuk client ini." }, { status: 400 });
    }
    if (body.parent_template_id) {
      const parentResult = await admin.from("task_templates").select("id").eq("id", body.parent_template_id).eq("organization_id", organizationId).is("deleted_at", null).maybeSingle();
      const parent = parentResult as unknown as { data: { id: string } | null; error: unknown };
      if (parent.error || !parent.data) return NextResponse.json({ error: "Parent template tidak valid." }, { status: 400 });
    }

    const validTypes: WorkItemType[] = ["routine", "project", "ad_hoc", "report"];
    const templateType = body.type ?? "routine";
    if (!validTypes.includes(templateType)) {
      return NextResponse.json(
        { error: `type harus salah satu dari: ${validTypes.join(", ")}` },
        { status: 400 }
      );
    }

    // Insert template
    const templateInsertData = {
      name: body.name,
      description: body.description ?? null,
      type: templateType,
      organization_id: organizationId,
      client_id: body.client_id,
      entity_id: body.entity_id ?? null,
      section_id: body.section_id ?? null,
      priority: body.priority ?? "medium",
      risk_level: body.risk_level ?? "medium",
      is_active: true,
      effective_from: body.effective_from ?? null,
      effective_until: body.effective_until ?? null,
      parent_template_id: body.parent_template_id ?? null,
      created_by: user.id,
    };

    const insertResult = await admin
      .from("task_templates")
      .insert(templateInsertData as never)
      .select("id, organization_id, client_id, entity_id, section_id, name, description, type, priority, risk_level, is_active, effective_from, effective_until, parent_template_id, created_by, created_at, updated_at, deleted_at")
      .single();

    const { data: template, error: insertError } = insertResult as unknown as {
      data: (typeof templateInsertData & { id: string }) | null;
      error: { message: string; code: string; hint: string; details: string } | null;
    };

    if (insertError) {
      console.error("[POST /api/templates] Supabase error:", {
        message: insertError.message,
        code: insertError.code,
        hint: insertError.hint,
        details: insertError.details,
      });
      return NextResponse.json(
        { error: "Gagal membuat template." },
        { status: 500 }
      );
    }

    // Insert versi pertama
    if (body.version.checklist_template_id) {
      const checklistResult = await admin.from("checklist_templates").select("id").eq("id", body.version.checklist_template_id).eq("organization_id", organizationId).eq("is_active", true).is("deleted_at", null).single();
      const checklist = checklistResult as unknown as { data: { id: string } | null; error: { message: string } | null };
      if (checklist.error || !checklist.data) return NextResponse.json({ error: "Template checklist tidak valid." }, { status: 400 });
    }
    if (!canAccessClient(authContext.context, body.client_id)) return NextResponse.json({ error: "Client tidak berada dalam scope akses user." }, { status: 403 });
    const versionInsertData = {
      template_id: template!.id,
      version_number: 1,
      title_template: body.version.title_template,
      description_template: body.version.description_template ?? null,
      acceptance_criteria_template: body.version.acceptance_criteria_template ?? null,
      maker_rule: body.version.maker_rule ?? {},
      checker_rule: body.version.checker_rule ?? {},
      approver_rule: body.version.approver_rule ?? {},
      sop_version_id: body.version.sop_version_id ?? null,
      checklist_template_id: body.version.checklist_template_id ?? null,
      evidence_schema: body.version.evidence_schema ?? [],
      maker_deadline_rule: body.version.maker_deadline_rule ?? {},
      checker_deadline_rule: body.version.checker_deadline_rule ?? {},
      final_deadline_rule: body.version.final_deadline_rule ?? {},
      escalation_policy_id: body.version.escalation_policy_id ?? null,
      child_blueprint: body.version.child_blueprint ?? [],
      weight: body.version.weight ?? 1.0,
      is_optional: body.version.is_optional ?? false,
      effective_from: body.version.effective_from ?? null,
      notes: body.version.notes ?? null,
    };

    const versionResult = await admin
      .from("template_versions")
      .insert(versionInsertData as never)
      .select("id, template_id, version_number, title_template, description_template, acceptance_criteria_template, maker_rule, checker_rule, approver_rule, sop_version_id, checklist_template_id, evidence_schema, maker_deadline_rule, checker_deadline_rule, final_deadline_rule, escalation_policy_id, child_blueprint, weight, is_optional, effective_from, notes, created_at")
      .single();

    const { data: version, error: versionError } = versionResult as unknown as {
      data: Record<string, unknown> | null;
      error: { message: string; code: string; hint: string; details: string } | null;
    };

    if (versionError) {
      console.error("[POST /api/templates] Gagal insert versi:", {
        message: versionError.message,
        code: versionError.code,
        hint: versionError.hint,
        details: versionError.details,
      });
      // Template sudah terbuat, tapi versi gagal — return template saja
      return NextResponse.json({ data: template, warning: "Gagal membuat versi pertama." }, { status: 201 });
    }

    // Audit log
    await logAudit(admin, {
      organizationId,
      actorId: user.id,
      action: "template.created",
      entityType: "task_template",
      entityId: template!.id,
      newValue: { template: template, version },
    });

    return NextResponse.json(
      { data: { ...template, versions: [version] } },
      { status: 201 }
    );
  } catch (err) {
    console.error("[POST /api/templates] Unexpected error:", err);
    return NextResponse.json(
      { error: "Terjadi kesalahan server." },
      { status: 500 }
    );
  }
}
