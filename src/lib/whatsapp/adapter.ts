import "server-only";
import { getWahaConfig } from "./config";

export async function wahaRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const config = getWahaConfig();
  const headers = new Headers(init?.headers);
  headers.set("content-type", "application/json");
  if (config.apiKey) headers.set("x-api-key", config.apiKey);
  const response = await fetch(`${config.baseUrl}${path}`, { ...init, headers });
  if (!response.ok) throw new Error(`WAHA request gagal: ${response.status}`);
  return (await response.json()) as T;
}

export async function wahaBinaryRequest(path: string, init?: RequestInit) {
  const config = getWahaConfig();
  const headers = new Headers(init?.headers);
  if (config.apiKey) headers.set("x-api-key", config.apiKey);
  const response = await fetch(`${config.baseUrl}${path}`, { ...init, headers });
  if (!response.ok) throw new Error(`WAHA request gagal: ${response.status}`);
  return { body: await response.arrayBuffer(), contentType: response.headers.get("content-type") ?? "image/png" };
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

export async function sendWahaText(chatId: string, text: string) {
  const config = getWahaConfig();
  if (!config.session) throw new Error("WAHA_SESSION belum dikonfigurasi.");
  return wahaRequest<{ id?: string }>("/api/sendText", {
    method: "POST",
    body: JSON.stringify({ session: config.session, chatId, text }),
  });
}
