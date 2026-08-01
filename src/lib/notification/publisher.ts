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

  const eventKey = event.dedupKey ? `notification:${event.dedupKey}` : null;
  const domainResult = await supabase.from("domain_events").upsert({
    organization_id: event.organizationId,
    event_type: event.eventType,
    aggregate_type: event.aggregateType,
    aggregate_id: event.aggregateId,
    event_key: eventKey,
    payload,
  }, { onConflict: "event_key", ignoreDuplicates: false }).select("id").maybeSingle();

  const domain = domainResult as unknown as {
    data: { id: string } | null;
    error: { message: string; code: string; hint: string; details: string } | null;
  };

  if (domain.error || !domain.data) {
    throw new Error(domain.error?.message ?? "Gagal menyimpan domain event.");
  }

  const outboxResult = await supabase.from("outbox_events").upsert({
    organization_id: event.organizationId,
    domain_event_id: domain.data.id,
    event_type: event.eventType,
    payload,
  }, { onConflict: "domain_event_id", ignoreDuplicates: true });

  const outbox = outboxResult as unknown as {
    error: { message: string; code: string; hint: string; details: string } | null;
  };

  if (outbox.error) {
    throw new Error(outbox.error.message);
  }

  return domain.data.id;
}
