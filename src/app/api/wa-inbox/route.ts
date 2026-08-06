import { NextResponse } from "next/server";
import { getSuggestionContext, suggestionError } from "@/lib/whatsapp/suggestions";
import { getAuthContext, requirePermission } from "@/lib/authorization";

export const runtime = "nodejs";

const MAX_MESSAGES = 100;
const MAX_SUMMARY_MESSAGES = 1000;
const MAX_GROUPS = 50;

type GroupRow = {
  id: string;
  client_id: string | null;
  group_name: string | null;
  provider_group_id: string;
};

type MessageRow = {
  id: string;
  wa_group_id: string | null;
  sender_participant_id: string | null;
  content: string | null;
  message_type: string;
  received_at: string;
};

type MappingRow = {
  wa_group_id: string;
  provider_participant_id: string;
  display_name: string | null;
};

type PersistedSummaryRow = {
  wa_group_id: string;
  window_start: string;
  window_end: string;
  message_count: number;
  participant_count: number;
  participants: string[];
  latest_message_at: string | null;
  deterministic_summary: string;
  ai_summary: string | null;
  ai_action_suggestions: Array<{ title?: string; evidence?: string; confidence?: number; requires_human_review?: boolean }>;
  status: string;
};

function messageText(message: MessageRow) {
  if (message.content?.trim()) return message.content.trim();
  return message.message_type === "text" ? "Pesan kosong" : `[${message.message_type}]`;
}

export async function GET(request: Request) {
  const { user, organizationId, admin } = await getSuggestionContext();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!organizationId || !admin) return NextResponse.json({ error: "Organisasi tidak ditemukan." }, { status: 403 });
  const auth = await getAuthContext();
  if (auth.response) return auth.response;
  const denied = await requirePermission(auth.context, "integrations.manage");
  if (denied) return denied;

  try {
    const searchParams = new URL(request.url).searchParams;
    const requestedLimit = Number(searchParams.get("limit") ?? "50");
    const limit = Math.min(MAX_MESSAGES, Math.max(1, Number.isFinite(requestedLimit) ? requestedLimit : 50));
    const period = searchParams.get("period") ?? "7d";
    const periodDays = period === "24h" ? 1 / 24 : period === "3d" ? 3 : period === "14d" ? 14 : period === "30d" ? 30 : 7;
    const since = new Date(Date.now() - periodDays * 24 * 60 * 60 * 1000).toISOString();
    const requestedGroupId = searchParams.get("group_id");

    const groupsResult = await admin
      .from("wa_groups")
      .select("id, client_id, group_name, provider_group_id")
      .eq("organization_id", organizationId)
      .eq("is_active", true)
      .order("group_name", { ascending: true })
      .limit(MAX_GROUPS);
    const groups = groupsResult as unknown as { data: GroupRow[] | null; error: unknown };
    if (groups.error) throw groups.error;

    const groupRows = (groups.data ?? []).filter((group) => (auth.context.isOrgWide || group.client_id === null || auth.context.clientIds.includes(group.client_id)) && (!requestedGroupId || group.id === requestedGroupId));
    const groupIds = groupRows.map((group) => group.id);
    if (!groupIds.length) return NextResponse.json({ since, summaries: [], messages: [] });

    const messagesResult = await admin
      .from("wa_messages")
      .select("id, wa_group_id, sender_participant_id, content, message_type, received_at")
      .in("wa_group_id", groupIds)
      .gte("received_at", since)
      .order("received_at", { ascending: false })
      .limit(MAX_SUMMARY_MESSAGES);
    const messages = messagesResult as unknown as { data: MessageRow[] | null; error: unknown };
    if (messages.error) throw messages.error;

    const rows = messages.data ?? [];
    const persistedResult = await admin.from("whatsapp_conversation_summaries").select("wa_group_id, window_start, window_end, message_count, participant_count, participants, latest_message_at, deterministic_summary, ai_summary, ai_action_suggestions, status").in("wa_group_id", groupIds).lte("window_start", new Date().toISOString()).gt("window_end", since).is("deleted_at", null).order("latest_message_at", { ascending: false });
    const persisted = persistedResult as unknown as { data: PersistedSummaryRow[] | null; error: unknown };
    if (persisted.error) throw persisted.error;
    const mappingsResult = await admin
      .from("wa_participant_mappings")
      .select("wa_group_id, provider_participant_id, display_name")
      .in("wa_group_id", groupIds);
    const mappings = mappingsResult as unknown as { data: MappingRow[] | null; error: unknown };
    if (mappings.error) throw mappings.error;

    const groupById = new Map(groupRows.map((group) => [group.id, group]));
    const senderByKey = new Map((mappings.data ?? []).map((mapping) => [`${mapping.wa_group_id}:${mapping.provider_participant_id}`, mapping.display_name]));
    const summaryByGroup = new Map<string, { groupId: string; groupName: string; clientId: string | null; messageCount: number; participantCount: number; participants: string[]; latestReceivedAt: string; latestMessage: string }>();
    const participantSets = new Map<string, Set<string>>();

    const responseMessages = rows.map((message) => {
      const group = message.wa_group_id ? groupById.get(message.wa_group_id) : undefined;
      const groupId = message.wa_group_id ?? "unknown";
      const sender = message.sender_participant_id ? senderByKey.get(`${groupId}:${message.sender_participant_id}`) : null;
      const senderName = sender?.trim() || message.sender_participant_id || "Pengirim tidak dikenal";
      const participants = participantSets.get(groupId) ?? new Set<string>();
      participants.add(senderName);
      participantSets.set(groupId, participants);
      const current = summaryByGroup.get(groupId);
      if (current) {
        current.messageCount += 1;
        current.participantCount = participants.size;
        current.participants = [...participants].sort((a, b) => a.localeCompare(b, "id"));
      } else {
        summaryByGroup.set(groupId, {
          groupId,
          groupName: group?.group_name?.trim() || group?.provider_group_id || "Grup WhatsApp",
          clientId: group?.client_id ?? null,
          messageCount: 1,
          participantCount: participants.size,
          participants: [...participants],
          latestReceivedAt: message.received_at,
          latestMessage: messageText(message),
        });
      }
      return {
        id: message.id,
        groupId,
        groupName: group?.group_name?.trim() || group?.provider_group_id || "Grup WhatsApp",
        senderName,
        content: messageText(message),
        messageType: message.message_type,
        receivedAt: message.received_at,
      };
    });

    const summaries = [...summaryByGroup.values()].sort((a, b) => b.latestReceivedAt.localeCompare(a.latestReceivedAt));
    const persistedByGroup = new Map((persisted.data ?? []).map((row) => [row.wa_group_id, row]));
    const responseSummaries = summaries.map((summary) => {
      const row = persistedByGroup.get(summary.groupId);
      return row ? { ...summary, windowStart: row.window_start, windowEnd: row.window_end, messageCount: row.message_count, participantCount: row.participant_count, participants: row.participants, latestReceivedAt: row.latest_message_at ?? summary.latestReceivedAt, deterministicSummary: row.deterministic_summary, aiSummary: row.ai_summary, actionSuggestions: row.ai_action_suggestions, summaryStatus: row.status } : summary;
    });
    return NextResponse.json({ since, summaries: responseSummaries, messages: responseMessages.slice(0, limit) });
  } catch (error) {
    console.error("[GET /api/wa-inbox] Supabase error:", suggestionError(error));
    return NextResponse.json({ error: "Gagal mengambil inbox WhatsApp." }, { status: 500 });
  }
}
