import { NextResponse } from "next/server";
import { logAudit } from "@/lib/audit/logger";
import { publishNotificationEvent } from "@/lib/notification/publisher";
import { getSuggestionContext, suggestionError } from "@/lib/whatsapp/suggestions";
import { getAuthContext, requirePermission } from "@/lib/authorization";
import { z } from "zod";
import { canAccessClient } from "@/lib/authorization";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  const requestBody = await _request.json().catch(() => ({}));
  const requestedClientId = typeof requestBody.client_id === "string" ? requestBody.client_id : null;
  const actionType = requestBody.action_type === "project" || requestBody.action_type === "update_existing" || requestBody.action_type === "information_only" ? requestBody.action_type : "work_item";
  const targetWorkItemId = typeof requestBody.target_work_item_id === "string" ? requestBody.target_work_item_id : null;
  const duplicateAction = requestBody.duplicate_action === "allow" ? "allow" : "warn";
  const { user, organizationId, admin } = await getSuggestionContext();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!organizationId || !admin) return NextResponse.json({ error: "Organisasi tidak ditemukan." }, { status: 403 });
  const auth = await getAuthContext();
  if (auth.response) return auth.response;
  const denied = await requirePermission(auth.context, "integrations.manage");
  if (denied) return denied;

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
  const clientId = requestedClientId ?? suggestion.suggested_client_id;
  if (actionType !== "information_only" && !canAccessClient(auth.context, clientId)) return NextResponse.json({ error: "Client tidak berada dalam scope akses user." }, { status: 403 });
  if (actionType !== "information_only" && (!clientId || !z.string().uuid().safeParse(clientId).success)) return NextResponse.json({ error: "Client wajib dipilih dan harus valid." }, { status: 400 });

  const clientResult = clientId
    ? await admin
      .from("clients")
      .select("id")
      .eq("id", clientId)
      .eq("organization_id", organizationId)
      .is("deleted_at", null)
      .maybeSingle()
    : { data: null, error: null };
  const client = clientResult as unknown as { data: { id: string } | null; error: unknown };
  if (client.error) {
    console.error("[POST /api/wa-suggestions/:id/confirm] Supabase error:", suggestionError(client.error));
    return NextResponse.json({ error: "Gagal memvalidasi client." }, { status: 500 });
  }
  if (actionType !== "information_only" && !client.data) return NextResponse.json({ error: "Client suggestion tidak ditemukan dalam organisasi." }, { status: 400 });

  if (suggestion.suggested_section_id) {
    const sectionResult = await admin
      .from("sections")
      .select("id")
      .eq("id", suggestion.suggested_section_id)
      .eq("organization_id", organizationId)
      .or(`client_id.is.null,client_id.eq.${clientId}`)
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

  if (suggestion.suggested_maker_id && !validProfileIds.has(suggestion.suggested_maker_id)) {
    return NextResponse.json({ error: "Maker suggestion tidak valid dalam organisasi." }, { status: 400 });
  }
  if (suggestion.suggested_checker_id && !validProfileIds.has(suggestion.suggested_checker_id)) {
    return NextResponse.json({ error: "Checker suggestion tidak valid dalam organisasi." }, { status: 400 });
  }
  if (suggestion.suggested_maker_id && suggestion.suggested_maker_id === suggestion.suggested_checker_id) {
    return NextResponse.json({ error: "Maker dan checker harus berbeda." }, { status: 400 });
  }

  const result = await admin.rpc("confirm_action_suggestion_choice", {
    p_suggestion_id: id,
    p_organization_id: organizationId,
    p_confirmed_by: user.id,
    p_client_id: clientId,
    p_action_type: actionType,
    p_target_work_item_id: targetWorkItemId,
    p_duplicate_action: duplicateAction,
  } as never);
  const confirmed = result as unknown as { data: { suggestion_id: string; work_item_id: string | null; project_id: string | null }[] | null; error: unknown };
  if (confirmed.error || !confirmed.data?.[0]) {
    const error = confirmed.error as { message?: string; details?: string } | null;
    if (error?.message === "DUPLICATE_BUSINESS_TASK") {
      let duplicates: unknown[] = [];
      try { duplicates = JSON.parse(error.details ?? "[]") as unknown[]; } catch { duplicates = []; }
      return NextResponse.json({ error: { code: "DUPLICATE_BUSINESS_TASK", message: "Ditemukan pekerjaan aktif dengan identitas bisnis yang sama." }, duplicates, next_action: "Kirim ulang dengan duplicate_action=allow setelah manager meninjau daftar." }, { status: 409 });
    }
    console.error("[POST /api/wa-suggestions/:id/confirm] Supabase error:", suggestionError(confirmed.error));
    return NextResponse.json({ error: "Gagal mengonfirmasi suggestion." }, { status: 500 });
  }
  const workItemId = confirmed.data[0].work_item_id;
  if (actionType === "information_only") return NextResponse.json({ data: { id, status: "confirmed", action_type: actionType } });
  if (!workItemId) return NextResponse.json({ error: "Work item hasil konfirmasi tidak ditemukan." }, { status: 500 });
  const workItem = { id: workItemId, title: suggestion.suggested_title, status: "draft" };

  await logAudit(admin, {
    organizationId,
    actorId: user.id,
    action: "wa_suggestion.confirmed",
    entityType: "action_suggestion",
    entityId: id,
    newValue: { status: "confirmed", created_work_item_id: workItem.id },
  });
  await logAudit(admin, {
    organizationId,
    actorId: user.id,
    action: actionType === "update_existing" ? "work_item.updated" : "work_item.created",
    entityType: "work_item",
    entityId: workItem.id,
    newValue: workItem,
    metadata: { source: "wa_suggestion", suggestion_id: id, action_type: actionType },
  });

  const recipients = [suggestion.suggested_maker_id, suggestion.suggested_checker_id].filter((profileId): profileId is string => Boolean(profileId));
  if (recipients.length) {
    try {
      await publishNotificationEvent(admin, {
        eventType: "item_assigned",
        organizationId,
        aggregateType: "work_item",
        aggregateId: workItem.id,
        profileIds: recipients,
        title: "Tugas baru dari WhatsApp",
        body: workItem.title,
        data: { work_item_id: workItem.id, suggestion_id: id },
        dedupKey: `wa-suggestion:${id}`,
      });
    } catch (error) {
      console.error("[POST /api/wa-suggestions/:id/confirm] Notifikasi gagal:", suggestionError(error));
    }
  }

  return NextResponse.json({ data: { id, status: "confirmed", action_type: actionType, created_work_item_id: workItemId, project_id: confirmed.data[0].project_id }, work_item: workItem });
}
