import type { SupabaseClient } from "@supabase/supabase-js";
import type { Json } from "@/lib/supabase/types";
import type { NotificationEvent } from "@/types/notification";

type NotificationClient = Pick<SupabaseClient, "from">;

export async function publishNotificationEvent(
  supabase: NotificationClient,
  event: NotificationEvent
) {
  const payload: Json = {
    profile_ids: event.profileIds,
    title: event.title,
    body: event.body ?? null,
    data: event.data ?? {},
    channel: event.channel ?? "in_app",
    dedup_key: event.dedupKey ?? null,
  };

  const domainResult = await supabase.from("domain_events").insert({
    organization_id: event.organizationId,
    event_type: event.eventType,
    aggregate_type: event.aggregateType,
    aggregate_id: event.aggregateId,
    payload,
  });

  const domain = domainResult as unknown as {
    data: { id: string } | null;
    error: { message: string; code: string; hint: string; details: string } | null;
  };

  if (domain.error || !domain.data) {
    throw new Error(domain.error?.message ?? "Gagal menyimpan domain event.");
  }

  const outboxResult = await supabase.from("outbox_events").insert({
    domain_event_id: domain.data.id,
    event_type: event.eventType,
    payload,
  });

  const outbox = outboxResult as unknown as {
    error: { message: string; code: string; hint: string; details: string } | null;
  };

  if (outbox.error) {
    throw new Error(outbox.error.message);
  }

  return domain.data.id;
}
