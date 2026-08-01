import type { SupabaseClient } from "@supabase/supabase-js";
import type { NotificationEvent } from "@/types/notification";

type NotificationClient = Pick<SupabaseClient, "from">;

export async function dispatchNotification(
  supabase: NotificationClient,
  event: NotificationEvent
) {
  const profileIds = [...new Set(event.profileIds)].filter(Boolean);
  if (profileIds.length === 0) return [];

  const dedupKey = event.dedupKey ?? null;
  let existingNotifications: { id: string; profile_id: string; event_type: string; title: string; body: string | null; data: Record<string, unknown> }[] = [];

  if (dedupKey) {
    const existingResult = await supabase
      .from("notifications")
      .select("id, profile_id, event_type, title, body, data")
      .eq("organization_id", event.organizationId)
      .eq("event_type", event.eventType)
      .eq("dedup_key", dedupKey)
      .in("profile_id", profileIds);

    const existing = existingResult as unknown as {
      data: { id: string; profile_id: string; event_type: string; title: string; body: string | null; data: Record<string, unknown> }[] | null;
      error: { message: string } | null;
    };

    if (existing.error) throw new Error(existing.error.message);
    existingNotifications = existing.data ?? [];
  }

  const existingIds = new Set(existingNotifications.map((row) => row.profile_id));

  const rows = profileIds
    .filter((profileId) => !existingIds.has(profileId))
    .map((profileId) => ({
      profile_id: profileId,
      organization_id: event.organizationId,
      event_type: event.eventType,
      title: event.title,
      body: event.body ?? null,
      data: event.data ?? {},
      channel: event.channel ?? "in_app",
      dedup_key: dedupKey,
    }));

  if (rows.length === 0) return existingNotifications;

  const result = await supabase.from("notifications").insert(rows).select("id, profile_id, event_type, title, body, data");
  const inserted = result as unknown as {
    data: { id: string; profile_id: string; event_type: string; title: string; body: string | null; data: Record<string, unknown> }[] | null;
    error: { message: string; code: string; hint: string; details: string } | null;
  };

  if (inserted.error) throw new Error(inserted.error.message);
  return [...existingNotifications, ...(inserted.data ?? [])];
}
