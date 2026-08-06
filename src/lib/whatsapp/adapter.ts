import "server-only";
import { getWahaConfig } from "./config";
import type { WahaGroup, WahaParticipant } from "@/types/whatsapp";

export type WhatsAppSession = {
  connectionId: string;
  sessionId: string;
  provider: string;
};

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
  const response = await fetch(`${config.baseUrl}${path}`, { ...init, headers });
  if (!response.ok) {
    const detail = await readWahaError(response);
    // #region debug-point A:waha-response
    fetch("http://127.0.0.1:7777/event", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessionId: "whatsapp-session-502", runId: "pre-fix", hypothesisId: "A", location: "whatsapp/adapter.ts:wahaRequest", msg: "[DEBUG] WAHA request failed", data: { path, status: response.status, detailPresent: Boolean(detail) } }) }).catch(() => {});
    // #endregion
    throw new WahaRequestError(response.status, detail || `WAHA request gagal: ${response.status}`);
  }
  return (await response.json()) as T;
}

export async function wahaBinaryRequest(path: string, init?: RequestInit) {
  const config = getWahaConfig();
  const headers = new Headers(init?.headers);
  if (config.apiKey) headers.set("x-api-key", config.apiKey);
  const response = await fetch(`${config.baseUrl}${path}`, { ...init, headers });
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
    body: JSON.stringify({ name: session }),
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
  return wahaRequest<WahaGroup[]>(`/api/${encodeURIComponent(session)}/groups`);
}

export async function getWahaGroupParticipants(session: string, groupId: string) {
  return wahaRequest<WahaParticipant[]>(`/api/${encodeURIComponent(session)}/groups/${encodeURIComponent(groupId)}/participants/v2`);
}

export async function sendWahaText(session: string, chatId: string, text: string) {
  return wahaRequest<{ id?: string; _data?: { id?: { _serialized?: string } }; [key: string]: unknown }>("/api/sendText", {
    method: "POST",
    body: JSON.stringify({ session, chatId, text }),
  });
}

export function createWhatsAppSessionAdapter(session: WhatsAppSession): WhatsAppSessionAdapter {
  if (session.provider !== "waha") throw new Error(`Provider WhatsApp tidak didukung: ${session.provider}`);
  if (!session.connectionId || !session.sessionId) throw new Error("Koneksi WhatsApp tidak lengkap.");
  return { sendText: (chatId, text) => sendWahaText(session.sessionId, chatId, text) };
}
