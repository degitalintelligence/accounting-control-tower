import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { verifyWahaToken } from "@/lib/whatsapp/config";
import type { WahaMessage, WahaWebhookPayload } from "@/types/whatsapp";

export const runtime = "nodejs";

function providerMessageId(message: WahaMessage): string | null {
  return message.id ?? message._data?.id?._serialized ?? message._data?.id?.id ?? null;
}

function stringValue(message: WahaMessage, key: "body" | "type" | "from" | "author" | "chatId"): string | null {
  const direct = message[key];
  if (typeof direct === "string") return direct;
  const nested = message._data?.[key];
  return typeof nested === "string" ? nested : null;
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

  if (!payload.event || !["message", "message.any"].includes(payload.event) || !payload.payload) {
    return NextResponse.json({ accepted: true });
  }

  const message = payload.payload;
  const providerId = providerMessageId(message);
  const groupId = stringValue(message, "chatId") ?? stringValue(message, "from");
  if (!providerId || !groupId || !payload.session) {
    return NextResponse.json({ error: "Payload message tidak lengkap." }, { status: 400 });
  }

  const admin = createServiceRoleClient();
  const connectionResult = await admin.from("integration_connections").select("id, organization_id, status").eq("provider", "waha").eq("session_id", payload.session).neq("status", "retired").order("created_at", { ascending: false }).limit(1).maybeSingle();
  const connection = connectionResult as unknown as { data: { id: string; organization_id: string; status: string } | null; error: { message: string } | null };
  if (connection.error || !connection.data) return NextResponse.json({ accepted: true });
  if (connection.data.status === "retired") return NextResponse.json({ accepted: true });

  const groupResult = await admin.from("wa_groups").select("id, organization_id, connection_id").eq("connection_id", connection.data.id).eq("organization_id", connection.data.organization_id).eq("provider_group_id", groupId).eq("is_active", true).maybeSingle();
  const group = groupResult as unknown as { data: { id: string; organization_id: string } | null; error: { message: string } | null };
  if (group.error || !group.data || group.data.organization_id !== connection.data.organization_id) return NextResponse.json({ accepted: true });

  const enqueueResult = await admin.rpc("enqueue_whatsapp_message" as never, {
    p_connection_id: connection.data.id,
    p_wa_group_id: group.data.id,
    p_organization_id: group.data.organization_id,
    p_provider_message_id: providerId,
    p_sender_participant_id: stringValue(message, "author") ?? stringValue(message, "from"),
    p_content: stringValue(message, "body"),
    p_message_type: stringValue(message, "type") ?? "text",
    p_media_metadata: message.media ?? {},
    p_raw_payload: payload,
    p_received_at: new Date(timestamp(message) * 1000).toISOString(),
    p_event_type: "whatsapp_message_received",
    p_event_payload: { provider: "waha", session_id: payload.session, group_id: groupId, provider_message_id: providerId },
  } as never);
  const enqueued = enqueueResult as unknown as { data: { message_id: string; duplicate: boolean }[] | null; error: { message: string; code?: string; hint?: string; details?: string } | null };
  if (enqueued.error) {
    console.error("[POST /api/wa-webhook] Gagal enqueue pesan WhatsApp:", { message: enqueued.error.message, code: enqueued.error.code, hint: enqueued.error.hint, details: enqueued.error.details });
    return NextResponse.json({ error: "Gagal menerima pesan." }, { status: 500 });
  }

  return NextResponse.json({ accepted: true, duplicate: enqueued.data?.[0]?.duplicate ?? false });
}
