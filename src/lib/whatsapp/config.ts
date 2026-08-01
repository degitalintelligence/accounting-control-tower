import "server-only";
import type { WahaConfig } from "@/types/whatsapp";

export function getWahaConfig(): WahaConfig {
  const baseUrl = process.env.WAHA_BASE_URL ?? process.env.WAHA_API_URL;
  if (!baseUrl) {
    throw new Error("WAHA_BASE_URL atau WAHA_API_URL belum dikonfigurasi.");
  }
  return { baseUrl: baseUrl.replace(/\/$/, ""), session: process.env.WAHA_SESSION, apiKey: process.env.WAHA_API_KEY };
}

export function verifyWahaToken(provided: string | null): boolean {
  const expected = process.env.WAHA_WEBHOOK_TOKEN ?? process.env.WAHA_WEBHOOK_SECRET;
  return Boolean(expected && provided && provided === expected);
}
