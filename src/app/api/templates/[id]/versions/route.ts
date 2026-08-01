import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit/logger";
import type { CreateVersionInput } from "@/types/template";

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

    const admin = createServiceRoleClient();

    const { organizationId, error: orgError } = await getUserOrganizationId(admin, user.id);
    if (orgError || !organizationId) {
      return NextResponse.json(
        { error: "Organisasi tidak ditemukan untuk user ini." },
        { status: 403 }
      );
    }

    const actorMembership = await admin
      .from("memberships")
      .select("role, client_id")
      .eq("profile_id", user.id)
      .eq("organization_id", organizationId)
      .eq("is_active", true);

    const actorMembershipData = actorMembership as unknown as { data: { role: string; client_id: string | null }[] | null };
    if (!actorMembershipData.data?.some((entry) => ["owner", "admin", "manager", "finance_manager", "accounting_manager"].includes(entry.role))) {
      return NextResponse.json({ error: "Hanya role pengelola yang dapat membuat template version." }, { status: 403 });
    }

    const tplResult = await admin
      .from("task_templates")
      .select("id, organization_id, name")
      .eq("id", id)
      .eq("organization_id", organizationId)
      .is("deleted_at", null)
      .single();

    const { data: template, error: tplError } = tplResult as unknown as {
      data: { id: string; organization_id: string; name: string } | null;
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
      .select("version_number")
      .eq("template_id", id)
      .order("version_number", { ascending: false })
      .limit(1)
      .single();

    const { data: latestVersion } = latestResult as unknown as {
      data: { version_number: number } | null;
      error: { message: string; code: string; hint: string; details: string } | null;
    };

    const nextVersionNumber = (latestVersion?.version_number ?? 0) + 1;

    const body = (await request.json()) as CreateVersionInput;

    // Validasi field wajib
    if (!body.title_template) {
      return NextResponse.json(
        { error: "Field wajib: title_template" },
        { status: 400 }
      );
    }

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
