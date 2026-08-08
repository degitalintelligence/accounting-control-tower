import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit/logger";
import { canAccessClient, getAuthContext, requirePermission } from "@/lib/authorization";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * GET /api/templates/[id]
 * Detail template beserta semua versi (ordered by version_number DESC).
 * Include recurrence_rules jika ada.
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

    const { admin, organizationId } = authContext.context;

    // Ambil template + semua versi
    const tplResult = await admin
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
          maker_rule,
          checker_rule,
          approver_rule,
          sop_version_id,
          checklist_template_id,
          evidence_schema,
          maker_deadline_rule,
          checker_deadline_rule,
          final_deadline_rule,
          escalation_policy_id,
          child_blueprint,
          weight,
          is_optional,
          effective_from,
          notes,
          created_at
        )
      `
      )
      .eq("id", id)
      .eq("organization_id", organizationId)
      .is("deleted_at", null)
      .single();

    const { data: template, error } = tplResult as unknown as {
      data: (Record<string, unknown> & { id: string; template_versions: unknown[] }) | null;
      error: { message: string; code: string; hint: string; details: string } | null;
    };

    if (error || !template) {
      return NextResponse.json(
        { error: "Template tidak ditemukan." },
        { status: 404 }
      );
    }
    if (!canAccessClient(authContext.context, template.client_id as string | null)) return NextResponse.json({ error: "Template tidak ditemukan." }, { status: 404 });

    // Sort versi descending
    const versions = (template.template_versions ?? []).sort(
      (a, b) =>
        ((b as Record<string, number>).version_number ?? 0) -
        ((a as Record<string, number>).version_number ?? 0)
    );

    // Ambil recurrence_rules jika ada
    const recurrenceResult = await admin
      .from("recurrence_rules")
      .select("id, template_id, rrule, timezone, generation_lead_days, holiday_handling, skip_weekends, created_at, updated_at")
      .eq("template_id", id)
      .is("deleted_at", null);

    const { data: recurrenceRules } = recurrenceResult as unknown as {
      data: unknown[] | null;
      error: { message: string; code: string; hint: string; details: string } | null;
    };

    return NextResponse.json({
      data: {
        ...template,
        template_versions: versions,
        recurrence_rules: recurrenceRules ?? [],
      },
    });
  } catch (err) {
    console.error("[GET /api/templates/[id]] Unexpected error:", err);
    return NextResponse.json(
      { error: "Terjadi kesalahan server." },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/templates/[id]
 * Update metadata template (bukan versi).
 * Hanya field yang diizinkan: name, description, type, priority, risk_level,
 * is_active, effective_from, effective_until.
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

    const authContext = await getAuthContext();
    if (authContext.response) return authContext.response;
    const permissionDenied = await requirePermission(authContext.context, "work_items.manage");
    if (permissionDenied) return permissionDenied;

    const { admin, organizationId } = authContext.context;

    // Ambil data lama untuk audit
    const fetchResult = await admin
      .from("task_templates")
      .select("*")
      .eq("id", id)
      .eq("organization_id", organizationId)
      .is("deleted_at", null)
      .single();

    const { data: existing, error: fetchError } = fetchResult as unknown as {
      data: Record<string, unknown> | null;
      error: { message: string; code: string; hint: string; details: string } | null;
    };

    if (fetchError || !existing) {
      return NextResponse.json(
        { error: "Template tidak ditemukan." },
        { status: 404 }
      );
    }
    if (!canAccessClient(authContext.context, existing.client_id as string | null)) return NextResponse.json({ error: "Template tidak ditemukan." }, { status: 404 });

    const body = await request.json();

    const allowedFields = [
      "name",
      "description",
      "type",
      "priority",
      "risk_level",
      "is_active",
      "effective_from",
      "effective_until",
    ];

    const updateData: Record<string, unknown> = {};
    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updateData[field] = body[field];
      }
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { error: "Tidak ada field yang diupdate." },
        { status: 400 }
      );
    }

    updateData.updated_at = new Date().toISOString();

    const updateResult = await admin
      .from("task_templates")
      .update(updateData as never)
      .eq("id", id)
      .select("id, organization_id, client_id, entity_id, section_id, name, description, type, priority, risk_level, is_active, effective_from, effective_until, parent_template_id, created_by, created_at, updated_at, deleted_at")
      .single();

    const { data: updated, error: updateError } = updateResult as unknown as {
      data: Record<string, unknown> | null;
      error: { message: string; code: string; hint: string; details: string } | null;
    };

    if (updateError) {
      console.error("[PATCH /api/templates/[id]] Supabase error:", {
        message: updateError.message,
        code: updateError.code,
        hint: updateError.hint,
        details: updateError.details,
      });
      return NextResponse.json(
        { error: "Gagal mengupdate template." },
        { status: 500 }
      );
    }

    // Audit log — hanya field yang berubah
    const changedFields: Record<string, unknown> = {};
    for (const key of Object.keys(updateData)) {
      if (key === "updated_at") continue;
      changedFields[key] = {
        old: existing[key],
        new: updateData[key],
      };
    }

    await logAudit(admin, {
      organizationId,
      actorId: user.id,
      action: "template.updated",
      entityType: "task_template",
      entityId: id,
      oldValue: changedFields,
      newValue: updateData,
    });

    return NextResponse.json({ data: updated });
  } catch (err) {
    console.error("[PATCH /api/templates/[id]] Unexpected error:", err);
    return NextResponse.json(
      { error: "Terjadi kesalahan server." },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/templates/[id]
 * Soft delete — set deleted_at dan is_active=false.
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

    const { admin, organizationId } = authContext.context;

    // Verifikasi template exists
    const fetchResult = await admin
      .from("task_templates")
      .select("id, organization_id, client_id, name")
      .eq("id", id)
      .eq("organization_id", organizationId)
      .is("deleted_at", null)
      .single();

    const { data: existing, error: fetchError } = fetchResult as unknown as {
      data: { id: string; organization_id: string; client_id: string | null; name: string } | null;
      error: { message: string; code: string; hint: string; details: string } | null;
    };

    if (fetchError || !existing) {
      return NextResponse.json(
        { error: "Template tidak ditemukan." },
        { status: 404 }
      );
    }
    if (!canAccessClient(authContext.context, existing.client_id)) return NextResponse.json({ error: "Template tidak ditemukan." }, { status: 404 });

    const deleteResult = await admin
      .from("task_templates")
      .update({
        deleted_at: new Date().toISOString(),
        is_active: false,
      } as never)
      .eq("id", id);

    const { error: deleteError } = deleteResult as unknown as {
      error: { message: string; code: string; hint: string; details: string } | null;
    };

    if (deleteError) {
      console.error("[DELETE /api/templates/[id]] Supabase error:", {
        message: deleteError.message,
        code: deleteError.code,
        hint: deleteError.hint,
        details: deleteError.details,
      });
      return NextResponse.json(
        { error: "Gagal menghapus template." },
        { status: 500 }
      );
    }

    await logAudit(admin, {
      organizationId,
      actorId: user.id,
      action: "template.deleted",
      entityType: "task_template",
      entityId: id,
      oldValue: { name: existing.name },
    });

    return NextResponse.json({ message: "Template berhasil dihapus." });
  } catch (err) {
    console.error("[DELETE /api/templates/[id]] Unexpected error:", err);
    return NextResponse.json(
      { error: "Terjadi kesalahan server." },
      { status: 500 }
    );
  }
}
