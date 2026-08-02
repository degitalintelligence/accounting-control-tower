import "server-only";
import { getWahaConfig } from "./config";
import type { WahaGroup, WahaParticipant } from "@/types/whatsapp";

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

export async function sendWahaText(chatId: string, text: string) {
  const config = getWahaConfig();
  if (!config.session) throw new Error("WAHA_SESSION belum dikonfigurasi.");
  return wahaRequest<{ id?: string }>("/api/sendText", {
    method: "POST",
    body: JSON.stringify({ session: config.session, chatId, text }),
  });
}
