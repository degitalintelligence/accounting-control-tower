import type { WahaMessage } from "@/types/whatsapp";

export function providerMessageId(message: WahaMessage): string | null {
  return message.id ?? message._data?.id?._serialized ?? message._data?.id?.id ?? null;
}

export function messageString(message: WahaMessage, key: "body" | "type" | "from" | "author" | "chatId" | "lid"): string | null {
  const direct = message[key];
  if (typeof direct === "string") return direct;
  const nested = message._data?.[key];
  return typeof nested === "string" ? nested : null;
}

export function messageSenderId(message: WahaMessage): string | null {
  return messageString(message, "author") ?? messageString(message, "lid");
}

export function isOperationalMessage(message: WahaMessage): boolean {
  const type = messageString(message, "type")?.toLowerCase();
  if (type === "e2e_notification" || type === "notification") return false;
  // Abaikan pesan outbound/echo dari akun operasional sendiri
  if (message.fromMe === true || message._data?.id?.fromMe === true) return false;
  const body = messageString(message, "body")?.trim();
  return Boolean(body || message.hasMedia || message.media);
}

export function messageTimestamp(message: WahaMessage): number {
  return message.timestamp ?? message._data?.t ?? Math.floor(Date.now() / 1000);
}
