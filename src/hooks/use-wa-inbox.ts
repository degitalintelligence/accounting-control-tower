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
}

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
  created_at: string;
};

type SuggestionsResponse = { data?: SuggestionResponse[] };

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
    type: "suggestion",
  };
}

async function readError(response: Response, fallback: string) {
  try {
    const body = (await response.json()) as { error?: unknown };
    if (typeof body.error === "string" && body.error.trim()) return body.error;
  } catch {}
  return fallback;
}

export function useWaInbox() {
  const [items, setItems] = useState<WaInboxItemData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/wa-suggestions?status=pending&limit=100", { method: "GET", cache: "no-store" });
      if (!response.ok) throw new Error(await readError(response, "Inbox WhatsApp belum dapat dimuat."));
      const body = (await response.json()) as SuggestionsResponse;
      setItems((body.data ?? []).map(toInboxItem));
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : "Inbox WhatsApp belum dapat dimuat.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => fetchItems());
  }, [fetchItems]);

  const confirmSuggestion = useCallback(async (id: string, clientId?: string) => {
    const response = await fetch(`/api/wa-suggestions/${encodeURIComponent(id)}/confirm`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(clientId ? { client_id: clientId } : {}),
    });
    if (!response.ok) throw new Error(await readError(response, "Saran tugas belum dapat dikonfirmasi."));
    setItems((current) => current.filter((item) => item.id !== id));
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
    loading,
    error,
    refetch: fetchItems,
    confirmSuggestion,
    rejectSuggestion,
  };
}
