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

export async function sendWahaText(chatId: string, text: string) {
  const config = getWahaConfig();
  return wahaRequest<{ id?: string }>("/api/sendText", {
    method: "POST",
    body: JSON.stringify({ session: config.session, chatId, text }),
  });
}
