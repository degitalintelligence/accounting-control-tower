import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { publishNotificationEvent } from "./publisher";

type SchedulingClient = Pick<SupabaseClient, "from">;

function inQuietHours(now: Date, timezone: string, start: string | null, end: string | null) {
  if (!start || !end) return false;
  const local = new Intl.DateTimeFormat("en-GB", { timeZone: timezone, hour: "2-digit", minute: "2-digit", hour12: false }).format(now);
  const current = Number(local.replace(":", ""));
  const from = Number(start.slice(0, 5).replace(":", ""));
  const to = Number(end.slice(0, 5).replace(":", ""));
  return from <= to ? current >= from && current < to : current >= from || current < to;
}

export async function runDeadlineReminderSweep(admin: SchedulingClient) {
  const now = new Date();
  const until = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
  const itemsResult = await admin.from("work_items").select("id, organization_id, title, due_at, assignments(profile_id)").gt("due_at", now.toISOString()).lte("due_at", until).not("status", "in", "(completed,cancelled)").is("deleted_at", null);
  const items = itemsResult as unknown as { data: { id: string; organization_id: string; title: string; due_at: string; assignments: { profile_id: string }[] }[] | null; error: { message: string } | null };
  if (items.error) throw new Error(items.error.message);
  let scheduled = 0;
  for (const item of items.data ?? []) {
    const profiles = [...new Set((item.assignments ?? []).map((assignment) => assignment.profile_id))];
    if (!profiles.length) continue;
    const profileResult = await admin.from("profiles").select("id, timezone, quiet_hours_start, quiet_hours_end").in("id", profiles);
    const profileData = profileResult as unknown as { data: { id: string; timezone: string; quiet_hours_start: string | null; quiet_hours_end: string | null }[] | null; error: { message: string } | null };
    if (profileData.error) throw new Error(profileData.error.message);
    const eligible = (profileData.data ?? []).filter((profile) => !inQuietHours(now, profile.timezone, profile.quiet_hours_start, profile.quiet_hours_end)).map((profile) => profile.id);
    if (!eligible.length) continue;
    await publishNotificationEvent(admin, { eventType: "deadline_approaching", organizationId: item.organization_id, aggregateType: "work_item", aggregateId: item.id, profileIds: eligible, title: "Deadline mendekat", body: item.title, data: { work_item_id: item.id, due_at: item.due_at }, dedupKey: `deadline-24h:${item.id}:${item.due_at}` });
    scheduled += eligible.length;
  }
  return { scheduled };
}
