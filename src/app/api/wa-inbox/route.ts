import { NextResponse } from "next/server";
import { getSuggestionContext, suggestionError } from "@/lib/whatsapp/suggestions";
import { getAuthContext, requirePermission } from "@/lib/authorization";

export const runtime = "nodejs";

const MAX_MESSAGES = 100;
const MAX_SUMMARY_MESSAGES = 1000;
const MAX_GROUPS = 50;
const MAX_OPERATIONAL_ERRORS = 10;
const MAX_ERROR_LENGTH = 240;

function truncateError(value: string | null) {
  const normalized = value?.trim();
  return normalized ? normalized.slice(0, MAX_ERROR_LENGTH) : null;
}

type GroupRow = {
  id: string;
  connection_id: string;
  client_id: string | null;
  group_name: string | null;
  provider_group_id: string;
  is_active: boolean;
};

type ConnectionHealthRow = {
  id: string;
  provider: string;
  status: string;
  last_health_check_at: string | null;
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
  is_verified: boolean;
};

type DeliveryAttemptRow = {
  connection_id: string;
  outcome: string;
  error_code: string | null;
  error_message: string | null;
  created_at: string;
};

type DeadLetterRow = {
  id: string;
  event_type: string;
  status: string;
  retry_count: number;
  last_retry_at: string | null;
  created_at: string;
  error_message: string | null;
  last_error: string | null;
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
      .select("id, connection_id, client_id, group_name, provider_group_id, is_active")
      .eq("organization_id", organizationId)
      .eq("is_active", true)
      .order("group_name", { ascending: true })
      .limit(MAX_GROUPS);
    const groups = groupsResult as unknown as { data: GroupRow[] | null; error: unknown };
    if (groups.error) throw groups.error;

    const groupRows = (groups.data ?? []).filter((group) => (auth.context.isOrgWide || group.client_id === null || auth.context.clientIds.includes(group.client_id)) && (!requestedGroupId || group.id === requestedGroupId));
    const connectionIds = [...new Set(groupRows.map((group) => group.connection_id))];
    const connectionsResult = await admin.from("integration_connections").select("id, provider, status, last_health_check_at").eq("organization_id", organizationId).is("deleted_at", null);
    const connections = connectionsResult as unknown as { data: ConnectionHealthRow[] | null; error: unknown };
    if (connections.error) throw connections.error;
    const connectionById = new Map((connections.data ?? []).map((connection) => [connection.id, connection]));
    const groupIds = groupRows.filter((group) => connectionById.has(group.connection_id)).map((group) => group.id);
    const rows: MessageRow[] = [];
    let persistedRows: PersistedSummaryRow[] = [];
    let mappingRows: MappingRow[] = [];
    let latestInboundAt: string | null = null;
    let deliveryRows: DeliveryAttemptRow[] = [];
    let deadLetterRows: DeadLetterRow[] = [];

    if (groupIds.length) {
      const messagesResult = await admin
        .from("wa_messages")
        .select("id, wa_group_id, sender_participant_id, content, message_type, received_at")
        .in("wa_group_id", groupIds)
        .gte("received_at", since)
        .order("received_at", { ascending: false })
        .limit(MAX_SUMMARY_MESSAGES);
      const messages = messagesResult as unknown as { data: MessageRow[] | null; error: unknown };
      if (messages.error) throw messages.error;
      rows.push(...(messages.data ?? []));

      const latestResult = await admin.from("wa_messages").select("received_at").in("wa_group_id", groupIds).order("received_at", { ascending: false }).limit(1);
      const latest = latestResult as unknown as { data: Array<{ received_at: string }> | null; error: unknown };
      if (latest.error) throw latest.error;
      latestInboundAt = latest.data?.[0]?.received_at ?? null;

      const persistedResult = await admin.from("whatsapp_conversation_summaries").select("wa_group_id, window_start, window_end, message_count, participant_count, participants, latest_message_at, deterministic_summary, ai_summary, ai_action_suggestions, status").in("wa_group_id", groupIds).lte("window_start", new Date().toISOString()).gt("window_end", since).is("deleted_at", null).order("latest_message_at", { ascending: false });
      const persisted = persistedResult as unknown as { data: PersistedSummaryRow[] | null; error: unknown };
      if (persisted.error) throw persisted.error;
      persistedRows = persisted.data ?? [];

      const mappingsResult = await admin.from("wa_participant_mappings").select("wa_group_id, provider_participant_id, display_name, is_verified").in("wa_group_id", groupIds);
      const mappings = mappingsResult as unknown as { data: MappingRow[] | null; error: unknown };
      if (mappings.error) throw mappings.error;
      mappingRows = mappings.data ?? [];
    }

    if (connectionIds.length) {
      const deliveryResult = await admin.from("whatsapp_delivery_attempts").select("connection_id, outcome, error_code, error_message, created_at").eq("organization_id", organizationId).in("connection_id", connectionIds).gte("created_at", since).order("created_at", { ascending: false }).limit(MAX_SUMMARY_MESSAGES);
      const deliveries = deliveryResult as unknown as { data: DeliveryAttemptRow[] | null; error: unknown };
      if (deliveries.error) throw deliveries.error;
      deliveryRows = deliveries.data ?? [];
    }

    const deadLettersResult = await admin.from("dead_letter_events").select("id, event_type, status, retry_count, last_retry_at, created_at, error_message, last_error").eq("organization_id", organizationId).ilike("event_type", "%whatsapp%").order("created_at", { ascending: false }).limit(MAX_OPERATIONAL_ERRORS);
    const deadLetters = deadLettersResult as unknown as { data: DeadLetterRow[] | null; error: unknown };
    if (deadLetters.error) throw deadLetters.error;
    deadLetterRows = deadLetters.data ?? [];

    const groupById = new Map(groupRows.map((group) => [group.id, group]));
    const senderByKey = new Map(mappingRows.map((mapping) => [`${mapping.wa_group_id}:${mapping.provider_participant_id}`, mapping.display_name]));
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
    const persistedByGroup = new Map(persistedRows.map((row) => [row.wa_group_id, row]));
    const responseSummaries = summaries.map((summary) => {
      const row = persistedByGroup.get(summary.groupId);
      return row ? { ...summary, windowStart: row.window_start, windowEnd: row.window_end, messageCount: row.message_count, participantCount: row.participant_count, participants: row.participants, latestReceivedAt: row.latest_message_at ?? summary.latestReceivedAt, deterministicSummary: row.deterministic_summary, aiSummary: row.ai_summary, actionSuggestions: row.ai_action_suggestions, summaryStatus: row.status } : summary;
    });
    const operationalGroups = groupRows.map((group) => {
      const connection = connectionById.get(group.connection_id);
      return {
        id: group.id,
        groupName: group.group_name?.trim() || group.provider_group_id,
        clientId: group.client_id,
        isActive: group.is_active,
        connection: connection ? { id: connection.id, provider: connection.provider, status: connection.status, lastHealthCheckAt: connection.last_health_check_at } : null,
      };
    });
    const operationalConnections = (connections.data ?? []).map((connection) => ({ id: connection.id, provider: connection.provider, status: connection.status, lastHealthCheckAt: connection.last_health_check_at }));
    const verifiedMappings = mappingRows.filter((mapping) => mapping.is_verified).length;
    const deliveryByOutcome = deliveryRows.reduce<Record<string, number>>((counts, row) => {
      counts[row.outcome] = (counts[row.outcome] ?? 0) + 1;
      return counts;
    }, {});
    const deliveryErrors = deliveryRows.filter((row) => row.outcome === "failed" && (row.error_code || row.error_message)).slice(0, MAX_OPERATIONAL_ERRORS).map((row) => ({ connectionId: row.connection_id, status: row.outcome, errorCode: truncateError(row.error_code), error: truncateError(row.error_message), createdAt: row.created_at }));
    const operationalDeadLetters = deadLetterRows.map((row) => ({ id: row.id, eventType: row.event_type, status: row.status, retryCount: row.retry_count, lastRetryAt: row.last_retry_at, createdAt: row.created_at, error: truncateError(row.error_message ?? row.last_error) }));
    return NextResponse.json({
      since,
      summaries: responseSummaries,
      messages: responseMessages.slice(0, limit),
      operational: {
        connections: operationalConnections,
        groups: operationalGroups,
        participantMappings: { total: mappingRows.length, verified: verifiedMappings, unverified: mappingRows.length - verifiedMappings },
        lastInboundActivityAt: latestInboundAt,
        ingestion: { messagesInPeriod: rows.length, latestInboundAt, periodStart: since },
        delivery: { attemptsInPeriod: deliveryRows.length, byOutcome: deliveryByOutcome, errors: deliveryErrors },
        deadLetters: operationalDeadLetters,
      },
    });
  } catch (error) {
    console.error("[GET /api/wa-inbox] Supabase error:", suggestionError(error));
    return NextResponse.json({ error: "Gagal mengambil inbox WhatsApp." }, { status: 500 });
  }
}
