import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { verifyWahaToken } from "@/lib/whatsapp/config";
import type { WahaMessage, WahaWebhookPayload } from "@/types/whatsapp";

export const runtime = "nodejs";

function providerMessageId(message: WahaMessage): string | null {
  return message.id ?? message._data?.id?._serialized ?? message._data?.id?.id ?? null;
}

function value(message: WahaMessage, key: "body" | "type" | "from" | "author" | "chatId" | "timestamp") {
  const direct = message[key];
  if (direct !== undefined) return direct;
  if (key === "timestamp") return message._data?.t;
  return message._data?.[key];
}

function timestamp(message: WahaMessage): number {
  return message.timestamp ?? message._data?.t ?? Math.floor(Date.now() / 1000);
}

export async function POST(request: NextRequest) {
  if (!verifyWahaToken(request.headers.get("x-waha-token"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: WahaWebhookPayload;
  try {
    payload = (await request.json()) as WahaWebhookPayload;
  } catch {
    return NextResponse.json({ error: "Payload tidak valid." }, { status: 400 });
  }

  if (payload.event !== "message" || !payload.payload || payload.payload.fromMe) {
    return NextResponse.json({ accepted: true });
  }

  const message = payload.payload;
  const providerId = providerMessageId(message);
  const groupId = value(message, "chatId") ?? value(message, "from");
  if (!providerId || !groupId || !payload.session) {
    return NextResponse.json({ error: "Payload message tidak lengkap." }, { status: 400 });
  }

  const admin = createServiceRoleClient();
  const connectionResult = await admin
    .from("integration_connections")
    .select("id")
    .eq("provider", "waha")
    .eq("session_id", payload.session)
    .limit(1)
    .maybeSingle();
  const connection = connectionResult as unknown as { data: { id: string } | null; error: { message: string } | null };
  if (connection.error || !connection.data) return NextResponse.json({ accepted: true });

  const groupResult = await admin
    .from("wa_groups")
    .select("id, organization_id")
    .eq("connection_id", connection.data.id)
    .eq("provider_group_id", groupId)
    .eq("is_active", true)
    .maybeSingle();
  const group = groupResult as unknown as { data: { id: string; organization_id: string } | null; error: { message: string } | null };
  if (group.error || !group.data) return NextResponse.json({ accepted: true });

  const insertResult = await admin.from("wa_messages").insert({
    connection_id: connection.data.id,
    wa_group_id: group.data.id,
    provider_message_id: providerId,
    sender_participant_id: value(message, "author") ?? value(message, "from") ?? null,
    content: value(message, "body") ?? null,
    message_type: value(message, "type") ?? "text",
    media_metadata: message.media ?? {},
    raw_payload: payload,
    received_at: new Date(timestamp(message) * 1000).toISOString(),
  } as never).select("id").maybeSingle();
  const inserted = insertResult as unknown as { data: { id: string } | null; error: { code?: string; message: string } | null };
  if (inserted.error && inserted.error.code !== "23505") {
    console.error("[POST /api/wa-webhook] Gagal menyimpan pesan WhatsApp:", { message: inserted.error.message, code: inserted.error.code });
    return NextResponse.json({ error: "Gagal menyimpan pesan." }, { status: 500 });
  }
  let messageId = inserted.data?.id;
  if (!messageId) {
    const existingResult = await admin
      .from("wa_messages")
      .select("id")
      .eq("connection_id", connection.data.id)
      .eq("provider_message_id", providerId)
      .maybeSingle();
    const existing = existingResult as unknown as { data: { id: string } | null; error: { message: string } | null };
    if (existing.error || !existing.data) return NextResponse.json({ error: "Pesan tersimpan tetapi tidak dapat dijadwalkan." }, { status: 500 });
    messageId = existing.data.id;
  }

  const domainResult = await admin.from("domain_events").insert({
    organization_id: group.data.organization_id,
    event_type: "ai_extraction_requested",
    aggregate_type: "wa_message",
    aggregate_id: messageId,
    payload: { message_id: messageId, organization_id: group.data.organization_id },
  } as never).select("id").maybeSingle();
  const domain = domainResult as unknown as { data: { id: string } | null; error: { code?: string; message: string } | null };
  if (domain.error && domain.error.code !== "23505") {
    console.error("[POST /api/wa-webhook] Gagal membuat job AI extraction:", { message: domain.error.message, code: domain.error.code });
    return NextResponse.json({ error: "Pesan tersimpan tetapi job tidak dapat dibuat." }, { status: 500 });
  }
  if (domain.data) {
    const outboxResult = await admin.from("outbox_events").insert({
      domain_event_id: domain.data.id,
      event_type: "ai_extraction_requested",
      payload: { message_id: messageId, organization_id: group.data.organization_id },
      max_retries: 5,
    } as never);
    const outbox = outboxResult as unknown as { error: { message: string } | null };
    if (outbox.error) {
      console.error("[POST /api/wa-webhook] Gagal memasukkan job AI extraction:", { message: outbox.error.message });
      return NextResponse.json({ error: "Pesan tersimpan tetapi job tidak dapat dibuat." }, { status: 500 });
    }
  }
  return NextResponse.json({ accepted: true, duplicate: inserted.error?.code === "23505" });
}
