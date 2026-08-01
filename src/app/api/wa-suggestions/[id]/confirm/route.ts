import { NextResponse } from "next/server";
import { logAudit } from "@/lib/audit/logger";
import { publishNotificationEvent } from "@/lib/notification/publisher";
import { getSuggestionContext, suggestionError } from "@/lib/whatsapp/suggestions";
import { canManageOrganization } from "@/lib/authorization";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  const { user, organizationId, role, admin } = await getSuggestionContext();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!organizationId || !admin) return NextResponse.json({ error: "Organisasi tidak ditemukan." }, { status: 403 });
  if (!canManageOrganization(role)) return NextResponse.json({ error: "Hanya manager yang dapat mengonfirmasi suggestion." }, { status: 403 });

  const suggestionResult = await admin
    .from("action_suggestions")
    .select("id, source_type, source_reference_id, source_metadata, suggested_title, suggested_description, suggested_maker_id, suggested_checker_id, suggested_due_at, suggested_client_id, suggested_section_id, status")
    .eq("id", id)
    .eq("organization_id", organizationId)
    .eq("status", "pending")
    .maybeSingle();
  const suggestionQuery = suggestionResult as unknown as {
    data: {
      id: string;
      source_type: string;
      source_reference_id: string | null;
      source_metadata: Record<string, unknown>;
      suggested_title: string;
      suggested_description: string | null;
      suggested_maker_id: string | null;
      suggested_checker_id: string | null;
      suggested_due_at: string | null;
      suggested_client_id: string | null;
      suggested_section_id: string | null;
    } | null;
    error: unknown;
  };
  if (suggestionQuery.error) {
    console.error("[POST /api/wa-suggestions/:id/confirm] Supabase error:", suggestionError(suggestionQuery.error));
    return NextResponse.json({ error: "Gagal mengambil suggestion." }, { status: 500 });
  }
  const suggestion = suggestionQuery.data;
  if (!suggestion) return NextResponse.json({ error: "Suggestion tidak ditemukan atau sudah diproses." }, { status: 404 });
  if (!suggestion.suggested_client_id) return NextResponse.json({ error: "Suggestion belum memiliki client yang valid." }, { status: 400 });

  const clientResult = await admin
    .from("clients")
    .select("id")
    .eq("id", suggestion.suggested_client_id)
    .eq("organization_id", organizationId)
    .is("deleted_at", null)
    .maybeSingle();
  const client = clientResult as unknown as { data: { id: string } | null; error: unknown };
  if (client.error) {
    console.error("[POST /api/wa-suggestions/:id/confirm] Supabase error:", suggestionError(client.error));
    return NextResponse.json({ error: "Gagal memvalidasi client." }, { status: 500 });
  }
  if (!client.data) return NextResponse.json({ error: "Client suggestion tidak ditemukan dalam organisasi." }, { status: 400 });

  if (suggestion.suggested_section_id) {
    const sectionResult = await admin
      .from("sections")
      .select("id")
      .eq("id", suggestion.suggested_section_id)
      .eq("organization_id", organizationId)
      .or(`client_id.is.null,client_id.eq.${suggestion.suggested_client_id}`)
      .is("deleted_at", null)
      .maybeSingle();
    const section = sectionResult as unknown as { data: { id: string } | null; error: unknown };
    if (section.error) {
      console.error("[POST /api/wa-suggestions/:id/confirm] Supabase error:", suggestionError(section.error));
      return NextResponse.json({ error: "Gagal memvalidasi section." }, { status: 500 });
    }
    if (!section.data) return NextResponse.json({ error: "Section suggestion tidak ditemukan dalam organisasi." }, { status: 400 });
  }

  const candidateProfileIds = [suggestion.suggested_maker_id, suggestion.suggested_checker_id].filter(
    (profileId): profileId is string => Boolean(profileId)
  );
  const validProfileIds = new Set<string>();
  if (candidateProfileIds.length) {
    const membershipResult = await admin
      .from("memberships")
      .select("profile_id")
      .eq("organization_id", organizationId)
      .eq("is_active", true)
      .in("profile_id", candidateProfileIds);
    const memberships = membershipResult as unknown as { data: { profile_id: string }[] | null; error: unknown };
    if (memberships.error) {
      console.error("[POST /api/wa-suggestions/:id/confirm] Supabase error:", suggestionError(memberships.error));
      return NextResponse.json({ error: "Gagal memvalidasi assignment." }, { status: 500 });
    }
    for (const membership of memberships.data ?? []) validProfileIds.add(membership.profile_id);
  }

  const workItemResult = await admin.from("work_items").insert({
    organization_id: organizationId,
    client_id: suggestion.suggested_client_id,
    section_id: suggestion.suggested_section_id,
    type: "ad_hoc",
    title: suggestion.suggested_title,
    description: suggestion.suggested_description,
    due_at: suggestion.suggested_due_at,
    source_type: suggestion.source_type,
    source_reference_id: suggestion.source_reference_id,
    source_metadata: suggestion.source_metadata ?? {},
    status: "draft",
    created_by: user.id,
  } as never).select("id, title, status, organization_id, client_id, section_id, type, description, due_at, source_type, source_reference_id, created_by, created_at").single();
  const workItem = workItemResult as unknown as { data: { id: string; title: string; status: string } | null; error: unknown };
  if (workItem.error || !workItem.data) {
    console.error("[POST /api/wa-suggestions/:id/confirm] Supabase error:", suggestionError(workItem.error));
    return NextResponse.json({ error: "Gagal membuat draft work item." }, { status: 500 });
  }

  const assignments = [
    { profile_id: suggestion.suggested_maker_id, role: "maker" },
    { profile_id: suggestion.suggested_checker_id, role: "checker" },
  ].filter((assignment) => Boolean(assignment.profile_id) && validProfileIds.has(assignment.profile_id as string))
    .filter((assignment) => assignment.profile_id !== suggestion.suggested_maker_id || assignment.role === "maker");
  if (assignments.length) {
    const assignmentResult = await admin.from("assignments").insert(assignments.map((assignment) => ({
      work_item_id: workItem.data!.id,
      profile_id: assignment.profile_id,
      role: assignment.role,
      assigned_by: user.id,
    })) as never);
    const assignmentError = assignmentResult as unknown as { error: unknown };
    if (assignmentError.error) console.error("[POST /api/wa-suggestions/:id/confirm] Assignment gagal:", suggestionError(assignmentError.error));
  }

  const now = new Date().toISOString();
  const result = await admin
    .from("action_suggestions")
    .update({ status: "confirmed", confirmed_by: user.id, confirmed_at: now, created_work_item_id: workItem.data.id, updated_at: now } as never)
    .eq("id", id)
    .eq("organization_id", organizationId)
    .eq("status", "pending")
    .select("id, status, confirmed_by, confirmed_at, created_work_item_id")
    .maybeSingle();
  const updated = result as unknown as { data: unknown; error: unknown };
  if (updated.error) {
    console.error("[POST /api/wa-suggestions/:id/confirm] Supabase error:", suggestionError(updated.error));
    return NextResponse.json({ error: "Gagal mengonfirmasi suggestion." }, { status: 500 });
  }
  if (!updated.data) return NextResponse.json({ error: "Suggestion tidak ditemukan atau sudah diproses." }, { status: 404 });

  await logAudit(admin, {
    organizationId,
    actorId: user.id,
    action: "wa_suggestion.confirmed",
    entityType: "action_suggestion",
    entityId: id,
    newValue: { status: "confirmed", created_work_item_id: workItem.data.id },
  });
  await logAudit(admin, {
    organizationId,
    actorId: user.id,
    action: "work_item.created",
    entityType: "work_item",
    entityId: workItem.data.id,
    newValue: workItem.data,
    metadata: { source: "wa_suggestion", suggestion_id: id },
  });

  const recipients = assignments.map((assignment) => assignment.profile_id).filter((profileId): profileId is string => Boolean(profileId));
  if (recipients.length) {
    try {
      await publishNotificationEvent(admin, {
        eventType: "item_assigned",
        organizationId,
        aggregateType: "work_item",
        aggregateId: workItem.data.id,
        profileIds: recipients,
        title: "Tugas baru dari WhatsApp",
        body: workItem.data.title,
        data: { work_item_id: workItem.data.id, suggestion_id: id },
        dedupKey: `wa-suggestion:${id}`,
      });
    } catch (error) {
      console.error("[POST /api/wa-suggestions/:id/confirm] Notifikasi gagal:", suggestionError(error));
    }
  }

  return NextResponse.json({ data: updated.data, work_item: workItem.data });
}
