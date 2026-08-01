import "server-only";
import type { WahaConfig } from "@/types/whatsapp";

export function getWahaConfig(): WahaConfig {
  const baseUrl = process.env.WAHA_BASE_URL;
  const session = process.env.WAHA_SESSION;
  if (!baseUrl || !session) {
    throw new Error("WAHA belum dikonfigurasi.");
  }
  return { baseUrl: baseUrl.replace(/\/$/, ""), session, apiKey: process.env.WAHA_API_KEY };
}

export function verifyWahaToken(provided: string | null): boolean {
  const expected = process.env.WAHA_WEBHOOK_TOKEN;
  return Boolean(expected && provided && provided === expected);
}
