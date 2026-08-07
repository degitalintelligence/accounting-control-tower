import "server-only";
import type { WahaConfig } from "@/types/whatsapp";

export function getWahaConfig(): WahaConfig {
  const baseUrl = process.env.WAHA_BASE_URL ?? process.env.WAHA_API_URL;
  if (!baseUrl) {
    throw new Error("WAHA_BASE_URL atau WAHA_API_URL belum dikonfigurasi.");
  }
  const webhookUrl = process.env.WAHA_WEBHOOK_URL;
  const webhookToken = process.env.WAHA_WEBHOOK_TOKEN ?? process.env.WAHA_WEBHOOK_SECRET;
  const engine = (process.env.WHATSAPP_DEFAULT_ENGINE ?? "GOWS").toUpperCase();
  if (engine !== "WEBJS" && engine !== "GOWS") throw new Error("WHATSAPP_DEFAULT_ENGINE harus WEBJS atau GOWS.");
  return { baseUrl: baseUrl.replace(/\/$/, ""), session: process.env.WAHA_SESSION, apiKey: process.env.WAHA_API_KEY, webhookUrl, webhookToken, engine };
}

export function verifyWahaToken(provided: string | null): boolean {
  const expected = process.env.WAHA_WEBHOOK_TOKEN ?? process.env.WAHA_WEBHOOK_SECRET;
  return Boolean(expected && provided && provided === expected);
}
