import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit/logger";
import type { InstantiateInput, ChildBlueprint } from "@/types/template";
import type { WorkItemType, WorkItemPriority, RiskLevel } from "@/types/work-item";

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

    const admin = createServiceRoleClient();

    const { organizationId, error: orgError } = await getUserOrganizationId(admin, user.id);
    if (orgError || !organizationId) {
      return NextResponse.json(
        { error: "Organisasi tidak ditemukan untuk user ini." },
        { status: 403 }
      );
    }

    // Ambil template
    const tplResult = await admin
      .from("task_templates")
      .select("*")
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

    // Ambil versi terbaru
    const verResult = await admin
      .from("template_versions")
      .select("*")
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

    // Buat parent work item
    const parentInsertData = {
      organization_id: organizationId,
      client_id: template.client_id as string,
      entity_id: entityId,
      section_id: sectionId,
      type: (template.type as WorkItemType) ?? "routine",
      template_id: template.id as string,
      template_version_id: version.id as string,
      title: (version.title_template as string) ?? (template.name as string),
      description: (version.description_template as string) ?? (template.description as string) ?? null,
      acceptance_criteria: (version.acceptance_criteria_template as string) ?? null,
      status: "draft" as const,
      priority: (template.priority as WorkItemPriority) ?? "medium",
      risk_level: (template.risk_level as RiskLevel) ?? "medium",
      weight: (version.weight as number) ?? 1.0,
      is_optional: (version.is_optional as boolean) ?? false,
      due_at: dueAt,
      start_at: (customFields.start_at as string) ?? null,
      source_type: "template" as const,
      created_by: user.id,
    };

    const parentInsertResult = await admin
      .from("work_items")
      .insert(parentInsertData as never)
      .select()
      .single();

    const { data: parentWorkItem, error: parentError } = parentInsertResult as unknown as {
      data: Record<string, unknown> | null;
      error: { message: string; code: string; hint: string; details: string } | null;
    };

    if (parentError) {
      console.error("[POST /api/templates/[id]/instantiate] Gagal buat parent work item:", {
        message: parentError.message,
        code: parentError.code,
        hint: parentError.hint,
        details: parentError.details,
      });
      return NextResponse.json(
        { error: "Gagal membuat work item dari template." },
        { status: 500 }
      );
    }

    // Auto-assign parent jika assignee_id diberikan
    if (body.assignee_id) {
      await admin.from("assignments").insert({
        work_item_id: (parentWorkItem as Record<string, string>).id,
        profile_id: body.assignee_id,
        role: "maker",
        assigned_by: user.id,
      } as never);

      // Auto-transition draft → assigned
      await admin
        .from("work_items")
        .update({ status: "assigned", updated_at: new Date().toISOString() } as never)
        .eq("id", (parentWorkItem as Record<string, string>).id);

      await admin.from("work_item_status_history").insert({
        work_item_id: (parentWorkItem as Record<string, string>).id,
        from_status: "draft",
        to_status: "assigned",
        changed_by: user.id,
        reason: "Auto-transition: maker assigned via template instantiation",
      } as never);
    }

    const childWorkItems: Record<string, unknown>[] = [];

    // Buat child work items dari child_blueprint
    const childBlueprint = (version.child_blueprint as ChildBlueprint[]) ?? [];
    if (Array.isArray(childBlueprint) && childBlueprint.length > 0) {
      for (const child of childBlueprint) {
        const childDueOffset = child.due_offset_days ?? 0;
        let childDueAt: string | null = null;
        if (dueAt) {
          const parentDue = new Date(dueAt);
          parentDue.setDate(parentDue.getDate() + childDueOffset);
          childDueAt = parentDue.toISOString();
        }

        const childInsertData = {
          organization_id: organizationId,
          client_id: template.client_id as string,
          entity_id: parentInsertData.entity_id,
          section_id: parentInsertData.section_id,
          type: (child.type as WorkItemType) ?? (template.type as WorkItemType) ?? "routine",
          parent_id: (parentWorkItem as Record<string, string>).id,
          template_id: template.id as string,
          template_version_id: version.id as string,
          title: `${parentInsertData.title} — ${child.title_suffix}`,
          description: child.description ?? null,
          acceptance_criteria: child.acceptance_criteria ?? null,
          status: "draft" as const,
          priority: (child.priority as WorkItemPriority) ?? (template.priority as WorkItemPriority) ?? "medium",
          risk_level: (child.risk_level as RiskLevel) ?? (template.risk_level as RiskLevel) ?? "medium",
          weight: child.weight ?? 1.0,
          is_optional: child.is_optional ?? false,
          due_at: childDueAt,
          source_type: "template" as const,
          created_by: user.id,
        };

        const childResult = await admin
          .from("work_items")
          .insert(childInsertData as never)
          .select()
          .single();

        const { data: childItem, error: childError } = childResult as unknown as {
          data: Record<string, unknown> | null;
          error: { message: string; code: string; hint: string; details: string } | null;
        };

        if (childError) {
          console.error("[POST /api/templates/[id]/instantiate] Gagal buat child:", {
            message: childError.message,
            code: childError.code,
            hint: childError.hint,
            details: childError.details,
          });
          continue; // Skip child yang gagal, jangan gagalkan seluruh instantiate
        }

        if (childItem) {
          childWorkItems.push(childItem);
        }
      }
    }

    // Audit log
    await logAudit(admin, {
      organizationId,
      actorId: user.id,
      action: "template.instantiated",
      entityType: "task_template",
      entityId: template.id as string,
      newValue: {
        parent_work_item_id: (parentWorkItem as Record<string, string>).id,
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
