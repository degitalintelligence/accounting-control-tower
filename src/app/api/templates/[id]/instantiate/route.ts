import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit/logger";
import type { InstantiateInput } from "@/types/template";
import { canAccessClient, getAuthContext } from "@/lib/authorization";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * Hitung due date dari deadline rule atau input user.
 */
function computeDueDate(
  finalDeadlineRule: Record<string, unknown> | null,
  inputDueDate?: string | null
): string | null {
  if (inputDueDate) return inputDueDate;

  if (!finalDeadlineRule || Object.keys(finalDeadlineRule).length === 0) return null;

  // Rule format: { type: "offset_days", value: N }
  if (finalDeadlineRule.type === "offset_days" && typeof finalDeadlineRule.value === "number") {
    const now = new Date();
    now.setDate(now.getDate() + finalDeadlineRule.value);
    return now.toISOString();
  }

  // Rule format: { type: "fixed_date", value: "2025-12-31" }
  if (finalDeadlineRule.type === "fixed_date" && typeof finalDeadlineRule.value === "string") {
    return new Date(finalDeadlineRule.value).toISOString();
  }

  return null;
}

/**
 * POST /api/templates/[id]/instantiate
 * Generate work items dari template + versi terbaru.
 * Jika versi punya child_blueprint, buat child work items juga.
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

    const { admin, organizationId } = authContext.context;

    // Ambil template
    const tplResult = await admin
      .from("task_templates")
    .select("id, client_id, entity_id, section_id, organization_id, is_active")
      .eq("id", id)
      .eq("organization_id", organizationId)
      .is("deleted_at", null)
      .eq("is_active", true)
      .single();

    const { data: template, error: tplError } = tplResult as unknown as {
      data: Record<string, unknown> | null;
      error: { message: string; code: string; hint: string; details: string } | null;
    };

    if (tplError || !template) {
      return NextResponse.json(
        { error: "Template tidak ditemukan atau tidak aktif." },
        { status: 404 }
      );
    }
    if (!canAccessClient(authContext.context, template.client_id as string | null)) return NextResponse.json({ error: "Template tidak ditemukan atau tidak aktif." }, { status: 404 });

    // Ambil versi terbaru
    const verResult = await admin
      .from("template_versions")
    .select("id, version_number, final_deadline_rule")
      .eq("template_id", id)
      .order("version_number", { ascending: false })
      .limit(1)
      .single();

    const { data: version, error: verError } = verResult as unknown as {
      data: Record<string, unknown> | null;
      error: { message: string; code: string; hint: string; details: string } | null;
    };

    if (verError || !version) {
      return NextResponse.json(
        { error: "Template belum memiliki versi." },
        { status: 400 }
      );
    }

    const body = (await request.json()) as InstantiateInput;

    const clientResult = await admin.from("clients").select("id").eq("id", template.client_id as string).eq("organization_id", organizationId).is("deleted_at", null).maybeSingle();
    const client = clientResult as unknown as { data: { id: string } | null; error: unknown };
    if (client.error || !client.data) return NextResponse.json({ error: "Client template tidak valid." }, { status: 400 });
    const entityId = (body.custom_fields?.entity_id as string) ?? (template.entity_id as string) ?? null;
    const sectionId = (body.custom_fields?.section_id as string) ?? (template.section_id as string) ?? null;
    if (entityId) {
      const entityResult = await admin.from("entities").select("id").eq("id", entityId).eq("organization_id", organizationId).eq("client_id", template.client_id as string).is("deleted_at", null).maybeSingle();
      const entity = entityResult as unknown as { data: { id: string } | null; error: unknown };
      if (entity.error || !entity.data) return NextResponse.json({ error: "Entity override tidak valid." }, { status: 400 });
    }
    if (sectionId) {
      const sectionResult = await admin.from("sections").select("id").eq("id", sectionId).eq("organization_id", organizationId).or(`client_id.is.null,client_id.eq.${template.client_id as string}`).is("deleted_at", null).maybeSingle();
      const section = sectionResult as unknown as { data: { id: string } | null; error: unknown };
      if (section.error || !section.data) return NextResponse.json({ error: "Section override tidak valid." }, { status: 400 });
    }
    if (body.assignee_id) {
      const assigneeResult = await admin.from("memberships").select("profile_id").eq("profile_id", body.assignee_id).eq("organization_id", organizationId).eq("is_active", true).maybeSingle();
      const assignee = assigneeResult as unknown as { data: { profile_id: string } | null; error: unknown };
      if (assignee.error || !assignee.data) return NextResponse.json({ error: "Assignee bukan anggota aktif organisasi ini." }, { status: 400 });
    }

    const finalDeadlineRule = (version.final_deadline_rule as Record<string, unknown>) ?? null;
    const dueAt = computeDueDate(finalDeadlineRule, body.due_date);

    // Siapkan custom_fields override (jika ada)
    const customFields = body.custom_fields ?? {};

    const instanceKey = (customFields.instance_key as string) ?? `manual:${new Date().toISOString()}`;
    const rpcResult = await admin.rpc("instantiate_template_instance", {
      p_template_id: template.id as string,
      p_template_version_id: version.id as string,
      p_instance_key: instanceKey,
      p_occurrence_date: (dueAt ?? new Date().toISOString()).slice(0, 10),
      p_due_at: dueAt,
      p_start_at: (customFields.start_at as string) ?? null,
      p_created_by: user.id,
      p_entity_id: entityId,
      p_section_id: sectionId,
      p_assignee_id: body.assignee_id ?? null,
      p_source_metadata: customFields,
    } as never);
    const instantiated = rpcResult as unknown as {
      data: { parent: Record<string, unknown>; children: Record<string, unknown>[] } | null;
      error: { message: string; code: string; hint: string; details: string } | null;
    };
    if (instantiated.error || !instantiated.data) {
      console.error("[POST /api/templates/[id]/instantiate] Atomic RPC gagal:", {
        message: instantiated.error?.message,
        code: instantiated.error?.code,
        hint: instantiated.error?.hint,
        details: instantiated.error?.details,
      });
      return NextResponse.json({ error: "Gagal membuat work item dari template." }, { status: 500 });
    }
    const parentWorkItem = instantiated.data.parent;
    const childWorkItems = instantiated.data.children;

    // Audit log
    await logAudit(admin, {
      organizationId,
      actorId: user.id,
      action: "template.instantiated",
      entityType: "task_template",
      entityId: template.id as string,
      newValue: {
        parent_work_item_id: parentWorkItem.id,
        children_count: childWorkItems.length,
        template_version: version.version_number,
      },
    });

    return NextResponse.json(
      {
        data: {
          work_item: parentWorkItem,
          children: childWorkItems,
        },
      },
      { status: 201 }
    );
  } catch (err) {
    console.error("[POST /api/templates/[id]/instantiate] Unexpected error:", err);
    return NextResponse.json(
      { error: "Terjadi kesalahan server." },
      { status: 500 }
    );
  }
}
