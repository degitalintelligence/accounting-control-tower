import type { SupabaseClient } from "@supabase/supabase-js";
import { dispatchNotification } from "./dispatcher";
import { renderNotificationEmail } from "./email-templates";
import { sendEmail, isEmailConfigured } from "./resend-client";
import type { NotificationEvent } from "@/types/notification";
import type { Json } from "@/lib/supabase/types";
import { sendWahaText } from "@/lib/whatsapp/adapter";

type NotificationClient = Pick<SupabaseClient, "from">;

type OutboxRow = {
  id: string;
  domain_event_id: string | null;
  event_type: string;
  payload: Json;
  retry_count: number;
  max_retries: number;
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

async function claimNext(admin: NotificationClient): Promise<OutboxRow | null> {
  const now = new Date().toISOString();
  const pendingResult = await admin
    .from("outbox_events")
    .select("id, domain_event_id, event_type, payload, retry_count, max_retries")
    .eq("status", "pending")
    .or(`next_retry_at.is.null,next_retry_at.lte.${now}`)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  const pending = pendingResult as unknown as {
    data: OutboxRow | null;
    error: { message: string } | null;
  };

  if (pending.error) throw new Error(pending.error.message);
  if (!pending.data) return null;

  const claimedResult = await admin
    .from("outbox_events")
    .update({ status: "processing" })
    .eq("id", pending.data.id)
    .eq("status", "pending")
    .select("id, domain_event_id, event_type, payload, retry_count, max_retries")
    .maybeSingle();
  const claimed = claimedResult as unknown as {
    data: OutboxRow | null;
    error: { message: string } | null;
  };

  if (claimed.error) throw new Error(claimed.error.message);
  return claimed.data;
}

async function markProcessed(admin: NotificationClient, id: string) {
  const result = await admin
    .from("outbox_events")
    .update({ status: "processed", processed_at: new Date().toISOString(), next_retry_at: null })
    .eq("id", id)
    .eq("status", "processing");
  const update = result as unknown as { error: { message: string } | null };
  if (update.error) throw new Error(update.error.message);
}

async function markFailed(admin: NotificationClient, row: OutboxRow) {
  const retryCount = row.retry_count + 1;
  const exhausted = retryCount >= row.max_retries;
  const nextRetryAt = new Date(Date.now() + Math.min(8 * 60 * 60 * 1000, 30_000 * 2 ** (retryCount - 1))).toISOString();
  const result = await admin
    .from("outbox_events")
    .update({
      status: exhausted ? "failed" : "pending",
      retry_count: retryCount,
      next_retry_at: exhausted ? null : nextRetryAt,
    })
    .eq("id", row.id)
    .eq("status", "processing");
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
    return;
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
  const profilesResult = await admin.from("profiles").select("id, email").in("id", profileIds);
  const profiles = profilesResult as unknown as { data: { id: string; email: string | null }[] | null; error: { message: string } | null };
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
    if (!email || userPreference?.email_enabled === false || userPreference?.[preference] === false) continue;

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
  const mappingsResult = await admin.from("wa_participant_mappings").select("profile_id, provider_participant_id, wa_group_id").in("profile_id", notifications.map((notification) => notification.profile_id)).eq("is_verified", true);
  const mappings = mappingsResult as unknown as { data: { profile_id: string; provider_participant_id: string; wa_group_id: string }[] | null; error: { message: string } | null };
  if (mappings.error) throw new Error(mappings.error.message);
  for (const notification of notifications) {
    const mapping = (mappings.data ?? []).find((candidate) => candidate.profile_id === notification.profile_id);
    if (!mapping) continue;
    const groupResult = await admin.from("wa_groups").select("provider_group_id").eq("id", mapping.wa_group_id).eq("is_active", true).maybeSingle();
    const group = groupResult as unknown as { data: { provider_group_id: string } | null; error: { message: string } | null };
    if (group.error || !group.data) continue;
    const delivery = await admin.from("notification_deliveries").upsert({ notification_id: notification.id, channel: "whatsapp", status: "processing" }, { onConflict: "notification_id,channel", ignoreDuplicates: false }).select("id, status").maybeSingle();
    const row = delivery as unknown as { data: { id: string; status: string } | null; error: { message: string } | null };
    if (row.error) throw new Error(row.error.message);
    if (!row.data || row.data.status === "delivered") continue;
    try {
      await sendWahaText(group.data.provider_group_id, [notification.title, notification.body].filter(Boolean).join("\n"));
      await admin.from("notification_deliveries").update({ status: "delivered", delivered_at: new Date().toISOString(), provider_response: { channel: "waha" } }).eq("id", row.data.id);
    } catch (error) {
      await admin.from("notification_deliveries").update({ status: "failed", provider_response: { message: "Pengiriman WhatsApp gagal." } }).eq("id", row.data.id);
      throw error;
    }
  }
}

export async function runNotificationOutboxWorker(admin: NotificationClient) {
  let processed = 0;
  let failed = 0;

  for (let index = 0; index < batchSize; index += 1) {
    const row = await claimNext(admin);
    if (!row) break;

    try {
      await processRow(admin, row);
      await markProcessed(admin, row.id);
      processed += 1;
    } catch (error) {
      await markFailed(admin, row);
      failed += 1;
      console.error("[notification-outbox] Pemrosesan gagal:", {
        outboxId: row.id,
        message: error instanceof Error ? error.message : "Kesalahan tidak diketahui.",
      });
    }
  }

  return { processed, failed };
}
