"use client";

import { useCallback, useEffect, useState } from "react";

export interface WaInboxItemData {
  id: string;
  groupName: string;
  senderName: string;
  message: string;
  receivedAt: string;
  suggestedTitle: string;
  suggestedDescription: string | null;
  makerName: string | null;
  checkerName: string | null;
  dueAt: string | null;
  suggestedClientId: string;
  confidence: number;
  type: "suggestion" | "message";
  actionType: ActionType | null;
  targetWorkItemId: string | null;
  duplicateWarning?: { code: "DUPLICATE_BUSINESS_TASK"; message: string; duplicates: Array<{ id: string; title: string; status: string; due_at: string | null; business_period: string | null }> };
}

export interface WaConversationSummary {
  groupId: string;
  groupName: string;
  clientId: string | null;
  messageCount: number;
  participantCount: number;
  participants: string[];
  latestReceivedAt: string;
  latestMessage: string;
  windowStart?: string;
  windowEnd?: string;
  deterministicSummary?: string;
  aiSummary?: string | null;
  actionSuggestions?: Array<{ title?: string; evidence?: string; confidence?: number; requires_human_review?: boolean }>;
  summaryStatus?: string;
}

export interface WaConversationMessage {
  id: string;
  groupId: string;
  groupName: string;
  senderName: string;
  content: string;
  messageType: string;
  receivedAt: string;
}

export type ActionType = "work_item" | "project" | "update_existing" | "information_only";

type SuggestionResponse = {
  id: string;
  source_reference_id: string | null;
  source_metadata?: Record<string, unknown> | null;
  suggested_title: string;
  suggested_description: string | null;
  suggested_maker_id: string | null;
  suggested_checker_id: string | null;
  suggested_due_at: string | null;
  suggested_client_id: string | null;
  confidence: number | null;
  status: string;
  decision_type?: ActionType | null;
  target_work_item_id?: string | null;
  created_at: string;
};

type SuggestionsResponse = { data?: SuggestionResponse[] };
type InboxResponse = { summaries?: WaConversationSummary[]; messages?: WaConversationMessage[] };

function metadataString(metadata: Record<string, unknown> | null | undefined, keys: string[]) {
  for (const key of keys) {
    const value = metadata?.[key];
    if (typeof value === "string" && value.trim()) return value;
  }
  return null;
}

function toInboxItem(suggestion: SuggestionResponse): WaInboxItemData {
  const metadata = suggestion.source_metadata;
  return {
    id: suggestion.id,
    groupName: metadataString(metadata, ["group_name", "groupName"]) ?? "Grup WhatsApp",
    senderName: metadataString(metadata, ["sender_name", "senderName"]) ?? "Pengirim tidak dikenal",
    message: metadataString(metadata, ["message", "content"]) ?? suggestion.suggested_description ?? suggestion.suggested_title,
    receivedAt: metadataString(metadata, ["received_at", "receivedAt"]) ?? suggestion.created_at,
    suggestedTitle: suggestion.suggested_title,
    suggestedDescription: suggestion.suggested_description,
    makerName: metadataString(metadata, ["maker_name", "makerName"]) ?? suggestion.suggested_maker_id,
    checkerName: metadataString(metadata, ["checker_name", "checkerName"]) ?? suggestion.suggested_checker_id,
    dueAt: suggestion.suggested_due_at,
    suggestedClientId: suggestion.suggested_client_id ?? "",
    confidence: Math.round((suggestion.confidence ?? 0) * 100),
    actionType: suggestion.decision_type ?? null,
    targetWorkItemId: suggestion.target_work_item_id ?? null,
    type: "suggestion",
  };
}

async function readError(response: Response, fallback: string) {
  try {
    const body = (await response.json()) as { error?: unknown };
    if (typeof body.error === "string" && body.error.trim()) return body.error;
    if (body.error && typeof body.error === "object" && "message" in body.error && typeof body.error.message === "string") return body.error.message;
  } catch {}
  return fallback;
}

export function useWaInbox() {
  const [items, setItems] = useState<WaInboxItemData[]>([]);
  const [summaries, setSummaries] = useState<WaConversationSummary[]>([]);
  const [messages, setMessages] = useState<WaConversationMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [suggestionsResponse, inboxResponse] = await Promise.all([
        fetch("/api/wa-suggestions?status=pending&limit=100", { method: "GET", cache: "no-store" }),
        fetch("/api/wa-inbox?limit=100", { method: "GET", cache: "no-store" }),
      ]);
      if (!suggestionsResponse.ok) throw new Error(await readError(suggestionsResponse, "Saran WhatsApp belum dapat dimuat."));
      if (!inboxResponse.ok) throw new Error(await readError(inboxResponse, "Percakapan WhatsApp belum dapat dimuat."));
      const [suggestionsBody, inboxBody] = await Promise.all([
        suggestionsResponse.json() as Promise<SuggestionsResponse>,
        inboxResponse.json() as Promise<InboxResponse>,
      ]);
      setItems((suggestionsBody.data ?? []).map(toInboxItem));
      setSummaries(inboxBody.summaries ?? []);
      setMessages(inboxBody.messages ?? []);
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : "Inbox WhatsApp belum dapat dimuat.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => fetchItems());
  }, [fetchItems]);

  const confirmSuggestion = useCallback(async (id: string, actionType: ActionType, clientId?: string, targetWorkItemId?: string, duplicateAction: "warn" | "allow" = "warn") => {
    const response = await fetch(`/api/wa-suggestions/${encodeURIComponent(id)}/confirm`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action_type: actionType, ...(clientId ? { client_id: clientId } : {}), ...(targetWorkItemId ? { target_work_item_id: targetWorkItemId } : {}), duplicate_action: duplicateAction }),
    });
    if (response.status === 409) {
      const body = await response.json().catch(() => null);
      if (body?.error?.code === "DUPLICATE_BUSINESS_TASK") return { duplicateWarning: body };
    }
    if (!response.ok) throw new Error(await readError(response, "Saran tugas belum dapat dikonfirmasi."));
    setItems((current) => current.filter((item) => item.id !== id));
    return { duplicateWarning: null };
  }, []);

  const rejectSuggestion = useCallback(async (id: string) => {
    const response = await fetch(`/api/wa-suggestions/${encodeURIComponent(id)}/reject`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: "Ditolak dari inbox WhatsApp." }),
    });
    if (!response.ok) throw new Error(await readError(response, "Saran tugas belum dapat ditolak."));
    setItems((current) => current.filter((item) => item.id !== id));
  }, []);

  return {
    items,
    summaries,
    messages,
    loading,
    error,
    refetch: fetchItems,
    confirmSuggestion,
    rejectSuggestion,
  };
}
