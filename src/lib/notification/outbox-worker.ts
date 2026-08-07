import type { SupabaseClient } from "@supabase/supabase-js";
import { dispatchNotification } from "./dispatcher";
import { renderNotificationEmail } from "./email-templates";
import { sendEmail, isEmailConfigured } from "./resend-client";
import type { NotificationEvent } from "@/types/notification";
import type { Json } from "@/lib/supabase/types";
import { sendWahaText } from "@/lib/whatsapp/adapter";
import { structuredSupabaseError } from "@/lib/supabase/error";
import { inQuietHours } from "./scheduling";

type NotificationClient = Pick<SupabaseClient, "from" | "rpc">;

type OutboxRow = {
  id: string;
  domain_event_id: string | null;
  event_type: string;
  payload: Json;
  retry_count: number;
  max_retries: number;
  organization_id: string;
  claimed_by: string | null;
  claim_token: string | null;
};

type DomainEventRow = {
  organization_id: string;
  aggregate_type: string;
  aggregate_id: string;
  event_type: string;
};

type Payload = {
  profile_ids?: Json;
  title?: Json;
  body?: Json;
  data?: Json;
  channel?: Json;
  dedup_key?: Json;
};

type ReminderWorkItem = { status: string; due_at: string | null; deleted_at: string | null };

const batchSize = 20;

function isRecord(value: Json | undefined): value is { [key: string]: Json | undefined } {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toJsonRecord(value: Json | undefined): Record<string, Json> {
  if (!isRecord(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, Json] => entry[1] !== undefined)
  );
}

function toNotificationEvent(
  outbox: OutboxRow,
  domainEvent: DomainEventRow
): NotificationEvent {
  if (!isRecord(outbox.payload)) throw new Error("Payload outbox tidak valid.");

  const payload = outbox.payload as Payload;
  const profileIds = Array.isArray(payload.profile_ids)
    ? payload.profile_ids.filter((value): value is string => typeof value === "string")
    : [];

  if (typeof payload.title !== "string" || profileIds.length === 0) {
    throw new Error("Payload notifikasi tidak lengkap.");
  }

  const data = toJsonRecord(payload.data);

  return {
    eventType: outbox.event_type as NotificationEvent["eventType"],
    organizationId: domainEvent.organization_id,
    aggregateType: domainEvent.aggregate_type,
    aggregateId: domainEvent.aggregate_id,
    profileIds,
    title: payload.title,
    body: typeof payload.body === "string" ? payload.body : null,
    data,
    channel: typeof payload.channel === "string" ? payload.channel : "in_app",
    dedupKey: typeof payload.dedup_key === "string" ? payload.dedup_key : null,
  };
}

async function claimNext(admin: NotificationClient, workerId: string): Promise<OutboxRow | null> {
  const result = await admin.rpc("claim_outbox_event" as never, {
    p_worker_id: workerId,
    p_event_type: "notification",
    p_lease_seconds: 900,
  });
  const claimed = result as unknown as { data: OutboxRow[] | null; error: { message: string } | null };
  if (claimed.error) throw new Error(claimed.error.message);
  return claimed.data?.[0] ?? null;
}

async function markProcessed(admin: NotificationClient, id: string, workerId: string, claimToken: string | null) {
  const result = await admin
    .from("outbox_events")
    .update({ status: "processed", processed_at: new Date().toISOString(), next_retry_at: null, lease_expires_at: null, claimed_at: null, claimed_by: null, claim_token: null })
    .eq("id", id)
    .eq("status", "processing")
    .eq("claimed_by", workerId)
    .eq("claim_token", claimToken);
  const update = result as unknown as { error: { message: string } | null };
  if (update.error) throw new Error(update.error.message);
}

async function safelyMarkFailed(admin: NotificationClient, row: OutboxRow, workerId: string, error: unknown) {
  try {
    await markFailed(admin, row, workerId, error);
  } catch (failureError) {
    console.error("[notification-outbox] Gagal mencatat kegagalan:", {
      outboxId: row.id,
      error: failureError instanceof Error ? { message: failureError.message } : structuredSupabaseError(failureError),
    });
  }
}

async function markFailed(admin: NotificationClient, row: OutboxRow, workerId: string, error: unknown) {
  const result = await admin.rpc("fail_outbox_event" as never, {
    p_outbox_event_id: row.id,
    p_error_message: error instanceof Error ? error.message.slice(0, 500) : "Kesalahan tidak diketahui.",
    p_worker_id: workerId,
  });
  const update = result as unknown as { error: { message: string } | null };
  if (update.error) throw new Error(update.error.message);
}

async function processRow(admin: NotificationClient, row: OutboxRow) {
  if (!row.domain_event_id) throw new Error("Outbox event tidak memiliki domain event.");

  const domainResult = await admin
    .from("domain_events")
    .select("organization_id, aggregate_type, aggregate_id, event_type")
    .eq("id", row.domain_event_id)
    .maybeSingle();
  const domain = domainResult as unknown as {
    data: DomainEventRow | null;
    error: { message: string } | null;
  };

  if (domain.error) throw new Error(domain.error.message);
  if (!domain.data) throw new Error("Domain event tidak ditemukan.");

  if (!isRecord(row.payload) || !Array.isArray(row.payload.profile_ids) || typeof row.payload.title !== "string") {
    throw new Error("Payload notification tidak valid.");
  }

  if (domain.data.event_type === "deadline_approaching" && domain.data.aggregate_type === "work_item") {
    const payload = row.payload as Payload;
    const data = toJsonRecord(payload.data);
    const expectedDueAt = typeof data.due_at === "string" ? data.due_at : null;
    const itemResult = await admin.from("work_items").select("status, due_at, deleted_at").eq("id", domain.data.aggregate_id).eq("organization_id", domain.data.organization_id).maybeSingle();
    const item = itemResult as unknown as { data: ReminderWorkItem | null; error: { message: string } | null };
    if (item.error) throw new Error(item.error.message);
    if (!item.data || item.data.deleted_at || ["completed", "cancelled"].includes(item.data.status) || (expectedDueAt && item.data.due_at !== expectedDueAt)) return;
  }

  const event = toNotificationEvent(row, domain.data);
  const notifications = await dispatchNotification(admin, event);
  if (isEmailConfigured()) await deliverEmailNotifications(admin, event, notifications);
  await deliverWhatsAppNotifications(admin, event, notifications);
}

function preferenceColumn(eventType: NotificationEvent["eventType"]) {
  if (eventType === "item_assigned") return "email_on_assignment";
  if (eventType === "status_changed") return "email_on_status_change";
  if (eventType === "deadline_approaching") return "email_on_deadline";
  if (eventType === "item_overdue") return "email_on_overdue";
  if (eventType === "review_requested" || eventType === "review_approved") return "email_on_review";
  if (eventType === "digest") return null;
  return null;
}

async function deliverEmailNotifications(
  admin: NotificationClient,
  event: NotificationEvent,
  notifications: { id: string; profile_id: string; event_type: string; title: string; body: string | null; data: Record<string, unknown> }[],
) {
  const preference = preferenceColumn(event.eventType);
  if (!preference || notifications.length === 0) return;

  const profileIds = notifications.map((notification) => notification.profile_id);
  const profilesResult = await admin.from("profiles").select("id, email, timezone, quiet_hours_start, quiet_hours_end").in("id", profileIds);
  const profiles = profilesResult as unknown as { data: { id: string; email: string | null; timezone: string; quiet_hours_start: string | null; quiet_hours_end: string | null }[] | null; error: { message: string } | null };
  if (profiles.error) throw new Error(profiles.error.message);

  const preferencesResult = await admin
    .from("notification_preferences")
    .select(`profile_id, email_enabled, ${preference}`)
    .in("profile_id", profileIds);
  const preferences = preferencesResult as unknown as {
    data: ({ profile_id: string; email_enabled: boolean } & Record<string, boolean | string>)[] | null;
    error: { message: string } | null;
  };
  if (preferences.error) throw new Error(preferences.error.message);

  const emailByProfile = new Map((profiles.data ?? []).map((profile) => [profile.id, profile.email]));
  const preferenceByProfile = new Map((preferences.data ?? []).map((row) => [row.profile_id, row]));
  const actionUrl = typeof event.data?.action_url === "string" ? event.data.action_url : undefined;

  for (const notification of notifications) {
    const email = emailByProfile.get(notification.profile_id);
    const userPreference = preferenceByProfile.get(notification.profile_id);
    const profile = (profiles.data ?? []).find((candidate) => candidate.id === notification.profile_id);
    if (!email || !profile || inQuietHours(new Date(), profile.timezone, profile.quiet_hours_start, profile.quiet_hours_end) || userPreference?.email_enabled === false || userPreference?.[preference] === false) continue;

    const deliveryResult = await admin.from("notification_deliveries").upsert(
      { notification_id: notification.id, channel: "email", status: "processing" },
      { onConflict: "notification_id,channel", ignoreDuplicates: false },
    ).select("id, status").maybeSingle();
    const delivery = deliveryResult as unknown as { data: { id: string; status: string } | null; error: { message: string } | null };
    if (delivery.error) throw new Error(delivery.error.message);
    if (!delivery.data || delivery.data.status === "delivered") continue;

    const emailContent = renderNotificationEmail({
      eventType: event.eventType,
      title: notification.title,
      body: notification.body,
      actionUrl,
    });

    try {
      const providerId = await sendEmail({ to: email, ...emailContent });
      await admin.from("notification_deliveries").update({
        status: "delivered",
        provider_response: providerId ? { id: providerId } : {},
        delivered_at: new Date().toISOString(),
      }).eq("id", delivery.data.id);
    } catch (error) {
      await admin.from("notification_deliveries").update({
        status: "failed",
        provider_response: { message: "Pengiriman email gagal." },
      }).eq("id", delivery.data.id);
      throw error;
    }
  }
}

async function deliverWhatsAppNotifications(admin: NotificationClient, event: NotificationEvent, notifications: { id: string; profile_id: string; title: string; body: string | null }[]) {
  if (event.channel !== "whatsapp" || !notifications.length) return;
  const profileResult = await admin.from("profiles").select("id, timezone, quiet_hours_start, quiet_hours_end").in("id", notifications.map((notification) => notification.profile_id));
  const profiles = profileResult as unknown as { data: { id: string; timezone: string; quiet_hours_start: string | null; quiet_hours_end: string | null }[] | null; error: { message: string } | null };
  if (profiles.error) throw new Error(profiles.error.message);
  const mappingsResult = await admin.from("wa_participant_mappings").select("profile_id, provider_participant_id, wa_group_id, wa_groups!inner(connection_id, organization_id, integration_connections!inner(provider, session_id, status), organizations!inner(deleted_at))").is("wa_groups.organizations.deleted_at", null).in("profile_id", notifications.map((notification) => notification.profile_id)).eq("is_verified", true);
  const mappings = mappingsResult as unknown as { data: { profile_id: string; provider_participant_id: string; wa_group_id: string; wa_groups: { connection_id: string; organization_id: string; integration_connections: { provider: string; session_id: string | null; status: string } } }[] | null; error: { message: string } | null };
  if (mappings.error) throw new Error(mappings.error.message);
  for (const notification of notifications) {
    const profile = (profiles.data ?? []).find((candidate) => candidate.id === notification.profile_id);
    if (!profile || inQuietHours(new Date(), profile.timezone, profile.quiet_hours_start, profile.quiet_hours_end)) continue;
    const mapping = (mappings.data ?? []).find((candidate) => candidate.profile_id === notification.profile_id);
    if (!mapping) continue;
    const groupResult = await admin.from("wa_groups").select("provider_group_id, connection_id, organization_id, integration_connections!inner(provider, session_id, status), organizations!inner(deleted_at)")
      .is("organizations.deleted_at", null).eq("id", mapping.wa_group_id).eq("organization_id", event.organizationId).eq("is_active", true).maybeSingle();
    const group = groupResult as unknown as { data: { provider_group_id: string; connection_id: string; organization_id: string; integration_connections: { provider: string; session_id: string | null; status: string } } | null; error: { message: string } | null };
    if (group.error || !group.data) continue;
    const connection = group.data.integration_connections;
    const sessionId = connection.session_id;
    if (connection.provider !== "waha" || !sessionId || !["connected", "ready"].includes(connection.status)) continue;
    const delivery = await admin.from("notification_deliveries").upsert({ notification_id: notification.id, channel: "whatsapp", status: "processing" }, { onConflict: "notification_id,channel", ignoreDuplicates: false }).select("id, status").maybeSingle();
    const row = delivery as unknown as { data: { id: string; status: string } | null; error: { message: string } | null };
    if (row.error) throw new Error(row.error.message);
    if (!row.data || row.data.status === "delivered") continue;
    const attemptsResult = await admin.from("whatsapp_delivery_attempts").select("attempt_number").eq("notification_id", notification.id).order("attempt_number", { ascending: false }).limit(1).maybeSingle();
    const attempts = attemptsResult as unknown as { data: { attempt_number: number } | null; error: { message: string } | null };
    if (attempts.error) throw new Error(attempts.error.message);
    const attemptNumber = (attempts.data?.attempt_number ?? 0) + 1;
    const attempt = { organization_id: event.organizationId, notification_id: notification.id, connection_id: group.data.connection_id, session_id: sessionId, provider: connection.provider, chat_id: group.data.provider_group_id, attempt_number: attemptNumber };
    const started = await admin.from("whatsapp_delivery_attempts").insert({ ...attempt, outcome: "started" });
    if (started.error) throw new Error(started.error.message);
    try {
      const providerResponse = await sendWahaText({ organizationId: event.organizationId, connectionId: group.data.connection_id, sessionId, provider: connection.provider }, group.data.provider_group_id, [notification.title, notification.body].filter(Boolean).join("\n"));
      const providerMessageId = typeof providerResponse.id === "string" ? providerResponse.id : providerResponse._data?.id?._serialized;
      const succeeded = await admin.from("whatsapp_delivery_attempts").insert({ ...attempt, outcome: "succeeded", provider_message_id: providerMessageId ?? null, provider_response: providerResponse });
      if (succeeded.error) throw new Error(succeeded.error.message);
      const delivered = await admin.from("notification_deliveries").update({ status: "delivered", delivered_at: new Date().toISOString(), provider_response: { channel: "waha", provider_message_id: providerMessageId ?? null, connection_id: group.data.connection_id, session_id: sessionId } }).eq("id", row.data.id);
      if (delivered.error) throw new Error(delivered.error.message);
    } catch (error) {
      await admin.from("whatsapp_delivery_attempts").insert({ ...attempt, outcome: "failed", error_message: error instanceof Error ? error.message.slice(0, 500) : "Pengiriman WhatsApp gagal." });
      await admin.from("notification_deliveries").update({ status: "failed", provider_response: { message: "Pengiriman WhatsApp gagal." } }).eq("id", row.data.id);
      throw error;
    }
  }
}

export async function runNotificationOutboxWorker(admin: NotificationClient) {
  const workerId = `notification-${crypto.randomUUID()}`;
  let processed = 0;
  let failed = 0;

  for (let index = 0; index < batchSize; index += 1) {
    const row = await claimNext(admin, workerId);
    if (!row) break;

    try {
      await processRow(admin, row);
      await markProcessed(admin, row.id, workerId, row.claim_token);
      processed += 1;
    } catch (error) {
      await safelyMarkFailed(admin, row, workerId, error);
      failed += 1;
      console.error("[notification-outbox] Pemrosesan gagal:", {
        outboxId: row.id,
        error: error instanceof Error ? { message: error.message } : structuredSupabaseError(error),
      });
    }
  }

  return { processed, failed };
}
