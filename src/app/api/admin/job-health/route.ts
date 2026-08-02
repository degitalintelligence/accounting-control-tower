import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getAuthContext, requirePermission } from "@/lib/authorization";

export async function GET() {
  const auth = await getAuthContext();
  if (auth.response) return auth.response;
  const denied = await requirePermission(auth.context, "job_health.view");
  if (denied) return denied;
  const db = auth.context.admin as unknown as SupabaseClient;
  const [outbox, dead, recurrence] = await Promise.all([
    db.from("outbox_events").select("status, event_type, retry_count, created_at, processed_at, last_error").eq("organization_id", auth.context.organizationId).order("created_at", { ascending: false }).limit(500),
    db.from("dead_letter_events").select("status, created_at, replayed_at").eq("organization_id", auth.context.organizationId).order("created_at", { ascending: false }).limit(500),
    db.from("recurrence_job_runs").select("status, attempts, created_at, completed_at, last_error").eq("organization_id", auth.context.organizationId).order("created_at", { ascending: false }).limit(500),
  ]);
  if (outbox.error) return NextResponse.json({ error: outbox.error.message }, { status: 400 });
  const outboxRows = outbox.data ?? [];
  const deadRows = dead.error ? [] : dead.data ?? [];
  const recurrenceRows = recurrence.error ? [] : recurrence.data ?? [];
  const now = Date.now();
  const staleMinutes = 15;
  const processing = outboxRows.filter((row) => row.status === "processing");
  return NextResponse.json({ generated_at: new Date().toISOString(), workers: [
    { name: "Outbox dispatcher", status: processing.some((row) => now - new Date(row.created_at).getTime() > staleMinutes * 60000) ? "degraded" : "healthy", pending: outboxRows.filter((row) => row.status === "pending").length, processing: processing.length, failed: outboxRows.filter((row) => row.status === "failed").length, last_activity_at: outboxRows[0]?.created_at ?? null },
    { name: "Dead-letter queue", status: deadRows.some((row) => row.status === "pending") ? "degraded" : "healthy", pending: deadRows.filter((row) => row.status === "pending").length, processing: 0, failed: deadRows.filter((row) => row.status === "pending").length, last_activity_at: deadRows[0]?.created_at ?? null },
    { name: "Recurring jobs", status: recurrenceRows.some((row) => row.status === "failed") ? "degraded" : "healthy", pending: recurrenceRows.filter((row) => row.status === "pending").length, processing: recurrenceRows.filter((row) => row.status === "processing").length, failed: recurrenceRows.filter((row) => row.status === "failed").length, last_activity_at: recurrenceRows[0]?.created_at ?? null },
  ] });
}
