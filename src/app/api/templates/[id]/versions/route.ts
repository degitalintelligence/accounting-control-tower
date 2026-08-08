import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit/logger";
import type { CreateVersionInput } from "@/types/template";
import { canAccessClient, getAuthContext, requirePermission } from "@/lib/authorization";
import { resolveChecklistTemplateId } from "@/lib/templates/version";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * POST /api/templates/[id]/versions
 * Tambah versi baru ke template yang sudah ada.
 * version_number di-auto-increment dari versi terakhir.
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
    const permissionDenied = await requirePermission(authContext.context, "sop.manage");
    if (permissionDenied) return permissionDenied;

    const { admin, organizationId } = authContext.context;

    const tplResult = await admin
      .from("task_templates")
      .select("id, organization_id, client_id, name")
      .eq("id", id)
      .eq("organization_id", organizationId)
      .is("deleted_at", null)
      .single();

    const { data: template, error: tplError } = tplResult as unknown as {
      data: { id: string; organization_id: string; client_id: string | null; name: string } | null;
      error: { message: string; code: string; hint: string; details: string } | null;
    };

    if (tplError || !template) {
      return NextResponse.json(
        { error: "Template tidak ditemukan." },
        { status: 404 }
      );
    }

    // Cari versi terakhir untuk auto-increment
    const latestResult = await admin
      .from("template_versions")
      .select("version_number, checklist_template_id")
      .eq("template_id", id)
      .order("version_number", { ascending: false })
      .limit(1)
      .single();

    const { data: latestVersion } = latestResult as unknown as {
      data: { version_number: number; checklist_template_id: string | null } | null;
      error: { message: string; code: string; hint: string; details: string } | null;
    };

    const nextVersionNumber = (latestVersion?.version_number ?? 0) + 1;

    const body = (await request.json()) as CreateVersionInput;
    const checklistTemplateId = resolveChecklistTemplateId(body.checklist_template_id, latestVersion?.checklist_template_id);

    // Validasi field wajib
    if (!body.title_template) {
      return NextResponse.json(
        { error: "Field wajib: title_template" },
        { status: 400 }
      );
    }
    if (checklistTemplateId) {
      const checklistResult = await admin.from("checklist_templates").select("id").eq("id", checklistTemplateId).eq("organization_id", organizationId).eq("is_active", true).is("deleted_at", null).single();
      const checklist = checklistResult as unknown as { data: { id: string } | null; error: { message: string } | null };
      if (checklist.error || !checklist.data) return NextResponse.json({ error: "Template checklist tidak valid." }, { status: 400 });
    }
    if (!canAccessClient(authContext.context, template.client_id)) return NextResponse.json({ error: "Template tidak ditemukan." }, { status: 404 });

    const insertData = {
      template_id: id,
      version_number: nextVersionNumber,
      title_template: body.title_template,
      description_template: body.description_template ?? null,
      acceptance_criteria_template: body.acceptance_criteria_template ?? null,
      maker_rule: body.maker_rule ?? {},
      checker_rule: body.checker_rule ?? {},
      approver_rule: body.approver_rule ?? {},
      sop_version_id: body.sop_version_id ?? null,
      checklist_template_id: checklistTemplateId,
      evidence_schema: body.evidence_schema ?? [],
      maker_deadline_rule: body.maker_deadline_rule ?? {},
      checker_deadline_rule: body.checker_deadline_rule ?? {},
      final_deadline_rule: body.final_deadline_rule ?? {},
      escalation_policy_id: body.escalation_policy_id ?? null,
      child_blueprint: body.child_blueprint ?? [],
      weight: body.weight ?? 1.0,
      is_optional: body.is_optional ?? false,
      effective_from: body.effective_from ?? null,
      notes: body.notes ?? null,
    };

    const insertResult = await admin
      .from("template_versions")
      .insert(insertData as never)
      .select()
      .single();

    const { data: version, error: insertError } = insertResult as unknown as {
      data: Record<string, unknown> | null;
      error: { message: string; code: string; hint: string; details: string } | null;
    };

    if (insertError) {
      console.error("[POST /api/templates/[id]/versions] Supabase error:", {
        message: insertError.message,
        code: insertError.code,
        hint: insertError.hint,
        details: insertError.details,
      });
      return NextResponse.json(
        { error: "Gagal membuat versi baru." },
        { status: 500 }
      );
    }

    // Audit log
    await logAudit(admin, {
      organizationId,
      actorId: user.id,
      action: "template.version_created",
      entityType: "template_version",
      entityId: (version as Record<string, string>).id,
      newValue: { template_id: id, version_number: nextVersionNumber },
    });

    return NextResponse.json({ data: version }, { status: 201 });
  } catch (err) {
    console.error("[POST /api/templates/[id]/versions] Unexpected error:", err);
    return NextResponse.json(
      { error: "Terjadi kesalahan server." },
      { status: 500 }
    );
  }
}
