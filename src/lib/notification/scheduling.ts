import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { publishNotificationEvent } from "./publisher";

type SchedulingClient = Pick<SupabaseClient, "from">;

export function inQuietHours(now: Date, timezone: string, start: string | null, end: string | null) {
  if (!start || !end) return false;
  const local = new Intl.DateTimeFormat("en-GB", { timeZone: timezone, hour: "2-digit", minute: "2-digit", hour12: false }).format(now);
  const current = Number(local.replace(":", ""));
  const from = Number(start.slice(0, 5).replace(":", ""));
  const to = Number(end.slice(0, 5).replace(":", ""));
  return from <= to ? current >= from && current < to : current >= from || current < to;
}

export async function runDeadlineReminderSweep(admin: SchedulingClient) {
  const now = new Date();
  const rangeStart = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const rangeEnd = new Date(now.getTime() + 4 * 24 * 60 * 60 * 1000).toISOString();
  const itemsResult = await admin.from("work_items").select("id, organization_id, title, due_at, assignments(profile_id)").gt("due_at", rangeStart).lte("due_at", rangeEnd).not("status", "in", "(completed,cancelled)").is("deleted_at", null);
  const items = itemsResult as unknown as { data: { id: string; organization_id: string; title: string; due_at: string; assignments: { profile_id: string }[] }[] | null; error: { message: string } | null };
  if (items.error) throw new Error(items.error.message);
  let scheduled = 0;
  for (const item of items.data ?? []) {
    const profiles = [...new Set((item.assignments ?? []).map((assignment) => assignment.profile_id))];
    if (!profiles.length) continue;
    const profileResult = await admin.from("profiles").select("id, timezone, quiet_hours_start, quiet_hours_end").in("id", profiles);
    const profileData = profileResult as unknown as { data: { id: string; timezone: string; quiet_hours_start: string | null; quiet_hours_end: string | null }[] | null; error: { message: string } | null };
    if (profileData.error) throw new Error(profileData.error.message);
    const profilesById = new Map((profileData.data ?? []).map((profile) => [profile.id, profile]));
    const due = new Date(item.due_at).getTime();
    const days = Math.round((due - now.getTime()) / (24 * 60 * 60 * 1000));
    const offset = days <= -1 ? "h+1" : days === 0 ? "today" : days <= 1 ? "h-1" : "h-3";
    const eligible = [...profilesById.values()].filter((profile) => !inQuietHours(now, profile.timezone, profile.quiet_hours_start, profile.quiet_hours_end)).map((profile) => profile.id);
    if (!eligible.length) continue;
    await publishNotificationEvent(admin, { eventType: "deadline_approaching", organizationId: item.organization_id, aggregateType: "work_item", aggregateId: item.id, profileIds: eligible, title: offset === "today" ? "Deadline hari ini" : offset === "h+1" ? "Deadline terlewat" : `Reminder deadline ${offset.toUpperCase()}`, body: item.title, data: { work_item_id: item.id, due_at: item.due_at, reminder_offset: offset }, dedupKey: `deadline:${offset}:${item.id}:${item.due_at.slice(0, 10)}` });
    scheduled += eligible.length;
  }
  return { scheduled };
}

export async function runBasicDigestSweep(admin: SchedulingClient) {
  const now = new Date();
  const profilesResult = await admin.from("profiles").select("id, timezone, quiet_hours_start, quiet_hours_end");
  const profiles = profilesResult as unknown as { data: { id: string; timezone: string; quiet_hours_start: string | null; quiet_hours_end: string | null }[] | null; error: { message: string } | null };
  if (profiles.error) throw new Error(profiles.error.message);
  let scheduled = 0;
  for (const profile of profiles.data ?? []) {
    if (inQuietHours(now, profile.timezone, profile.quiet_hours_start, profile.quiet_hours_end)) continue;
    const preferenceResult = await admin.from("notification_preferences").select("digest_enabled, digest_hour").eq("profile_id", profile.id).maybeSingle();
    const preference = preferenceResult as unknown as { data: { digest_enabled: boolean; digest_hour: number } | null; error: { message: string } | null };
    if (preference.error) throw new Error(preference.error.message);
    if (preference.data?.digest_enabled === false) continue;
    const localHour = Number(new Intl.DateTimeFormat("en-US", { timeZone: profile.timezone, hour: "2-digit", hour12: false }).format(now));
    if (localHour !== (preference.data?.digest_hour ?? 8)) continue;
    const assignmentsResult = await admin.from("assignments").select("work_item_id, work_items!inner(id, organization_id, title, due_at, status)").eq("profile_id", profile.id).is("unassigned_at", null).not("work_items.status", "in", "(completed,cancelled)");
    const assignments = assignmentsResult as unknown as { data: { work_items: { id: string; organization_id: string; title: string; due_at: string | null; status: string } }[] | null; error: { message: string } | null };
    if (assignments.error || !assignments.data?.length) continue;
    const byOrganization = new Map<string, typeof assignments.data>();
    for (const assignment of assignments.data) {
      const organizationId = assignment.work_items.organization_id;
      const current = byOrganization.get(organizationId) ?? [];
      current.push(assignment);
      byOrganization.set(organizationId, current);
    }
    for (const [organizationId, scopedAssignments] of byOrganization) {
      const body = `${scopedAssignments.length} work item aktif menunggu perhatian.`;
      await publishNotificationEvent(admin, { eventType: "digest", organizationId, aggregateType: "profile", aggregateId: profile.id, profileIds: [profile.id], title: "Ringkasan pekerjaan", body, data: { work_item_ids: scopedAssignments.map((row) => row.work_items.id) }, dedupKey: `digest:${organizationId}:${profile.id}:${now.toISOString().slice(0, 10)}` });
      scheduled += 1;
    }
  }
  return { scheduled };
}
