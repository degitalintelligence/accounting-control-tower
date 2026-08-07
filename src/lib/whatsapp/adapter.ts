import "server-only";
import { getWahaConfig } from "./config";
import { createServiceRoleClient } from "@/lib/supabase/server";
import type { WahaGroup, WahaGroupCollection, WahaParticipant } from "@/types/whatsapp";

export type WhatsAppSession = {
  organizationId: string;
  connectionId: string;
  sessionId: string;
  provider: string;
};

type ActiveConnectionRow = {
  id: string;
  organization_id: string;
  provider: string;
  session_id: string | null;
  status: string;
  retired_at: string | null;
};

async function requireActiveWhatsAppSession(session: WhatsAppSession): Promise<WhatsAppSession> {
  if (session.provider !== "waha") throw new Error(`Provider WhatsApp tidak didukung: ${session.provider}`);
  if (!session.organizationId || !session.connectionId || !session.sessionId) throw new Error("Koneksi WhatsApp tidak lengkap.");

  const admin = createServiceRoleClient();
  const result = await admin
    .from("integration_connections")
    .select("id, organization_id, provider, session_id, status, retired_at, organizations!inner(deleted_at)")
    .eq("id", session.connectionId)
    .eq("organization_id", session.organizationId)
    .eq("provider", "waha")
    .is("deleted_at", null)
    .is("retired_at", null)
    .neq("status", "retired")
    .is("organizations.deleted_at", null)
    .maybeSingle();

  const checked = result as unknown as { data: ActiveConnectionRow | null; error: { message: string } | null };
  if (checked.error) throw new Error(checked.error.message);
  if (!checked.data || checked.data.session_id !== session.sessionId || checked.data.provider !== session.provider) {
    throw new Error("Koneksi WhatsApp sudah tidak aktif.");
  }

  return session;
}

export type WhatsAppSessionAdapter = {
  sendText: (chatId: string, text: string) => Promise<{ id?: string; _data?: { id?: { _serialized?: string } }; [key: string]: unknown }>;
};

export class WahaRequestError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = "WahaRequestError";
  }
}

export async function wahaRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const config = getWahaConfig();
  const headers = new Headers(init?.headers);
  headers.set("content-type", "application/json");
  if (config.apiKey) headers.set("x-api-key", config.apiKey);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  let response: Response;
  try {
    response = await fetch(`${config.baseUrl}${path}`, { ...init, headers, signal: controller.signal });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw new WahaRequestError(504, "WAHA tidak merespons dalam 15 detik.");
    throw error;
  } finally {
    clearTimeout(timeout);
  }
  if (!response.ok) {
    const detail = await readWahaError(response);
    throw new WahaRequestError(response.status, detail || `WAHA request gagal: ${response.status}`);
  }
  return (await response.json()) as T;
}

export async function wahaBinaryRequest(path: string, init?: RequestInit) {
  const config = getWahaConfig();
  const headers = new Headers(init?.headers);
  if (config.apiKey) headers.set("x-api-key", config.apiKey);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  let response: Response;
  try {
    response = await fetch(`${config.baseUrl}${path}`, { ...init, headers, signal: controller.signal });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw new WahaRequestError(504, "WAHA tidak merespons dalam 15 detik.");
    throw error;
  } finally {
    clearTimeout(timeout);
  }
  if (!response.ok) {
    const detail = await readWahaError(response);
    throw new WahaRequestError(response.status, detail || `WAHA request gagal: ${response.status}`);
  }
  return { body: await response.arrayBuffer(), contentType: response.headers.get("content-type") ?? "image/png" };
}

async function readWahaError(response: Response) {
  const text = await response.text().catch(() => "");
  if (!text) return "";
  try {
    const body = JSON.parse(text) as { message?: string; error?: string; detail?: string };
    return String(body.message ?? body.error ?? body.detail ?? "").slice(0, 240);
  } catch {
    return text.replace(/\s+/g, " ").slice(0, 240);
  }
}

export async function startWahaSession(session: string) {
  return wahaRequest<unknown>(`/api/sessions/${encodeURIComponent(session)}/start`, { method: "POST" });
}

export async function stopWahaSession(session: string) {
  return wahaRequest<unknown>(`/api/sessions/${encodeURIComponent(session)}/stop`, { method: "POST" });
}

export async function createWahaSession(session: string) {
  return wahaRequest<unknown>("/api/sessions", {
    method: "POST",
    body: JSON.stringify({ name: session, config: { engine: "GOWS" } }),
  });
}

export async function deleteWahaSession(session: string) {
  return wahaRequest<unknown>(`/api/sessions/${encodeURIComponent(session)}`, { method: "DELETE" });
}

export async function getWahaSessionStatus(session: string) {
  return wahaRequest<unknown>(`/api/sessions/${encodeURIComponent(session)}`);
}

export async function getWahaQr(session: string) {
  return wahaBinaryRequest(`/api/${encodeURIComponent(session)}/auth/qr`);
}

export async function getWahaGroups(session: string) {
  const result = await wahaRequest<WahaGroupCollection>(`/api/${encodeURIComponent(session)}/groups`);
  if (Array.isArray(result)) return result;
  if ("groups" in result && Array.isArray(result.groups)) return result.groups;
  return Object.entries(result).map(([id, group]) => ({ ...group, id: group.id || id }));
}

export async function getWahaGroupParticipants(session: string, groupId: string) {
  return wahaRequest<WahaParticipant[]>(`/api/${encodeURIComponent(session)}/groups/${encodeURIComponent(groupId)}/participants/v2`);
}

export async function sendWahaText(session: WhatsAppSession, chatId: string, text: string) {
  const activeSession = await requireActiveWhatsAppSession(session);
  return wahaRequest<{ id?: string; _data?: { id?: { _serialized?: string } }; [key: string]: unknown }>("/api/sendText", {
    method: "POST",
    body: JSON.stringify({ session: activeSession.sessionId, chatId, text }),
  });
}

export function createWhatsAppSessionAdapter(session: WhatsAppSession): WhatsAppSessionAdapter {
  if (session.provider !== "waha") throw new Error(`Provider WhatsApp tidak didukung: ${session.provider}`);
  if (!session.organizationId || !session.connectionId || !session.sessionId) throw new Error("Koneksi WhatsApp tidak lengkap.");
  return { sendText: (chatId, text) => sendWahaText(session, chatId, text) };
}
