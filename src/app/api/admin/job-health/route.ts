import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getAuthContext, requirePermission } from "@/lib/authorization";

type QueueRow = {
  status: string;
  created_at: string;
  claimed_at?: string | null;
  lease_expires_at?: string | null;
  locked_at?: string | null;
  event_type?: string;
  retry_count?: number;
  attempts?: number;
};

type QueryError = { code?: string | null } | null;

function safeError(error: QueryError) {
  const code = typeof error?.code === "string" && /^[A-Z0-9_]+$/.test(error.code) ? error.code : "QUERY_FAILED";
  return { code, message: "Data source query failed" };
}

function isStale(row: QueueRow, now: number) {
  if (row.lease_expires_at) return new Date(row.lease_expires_at).getTime() <= now;
  const claimedAt = row.claimed_at ?? row.locked_at;
  if (claimedAt) return now - new Date(claimedAt).getTime() > 15 * 60000;
  return now - new Date(row.created_at).getTime() > 15 * 60000;
}

function workerError(error: QueryError) {
  return { data_source: "database", error: safeError(error), status: "unknown" };
}

export async function GET() {
  const auth = await getAuthContext();
  if (auth.response) return auth.response;
  const denied = await requirePermission(auth.context, "job_health.view");
  if (denied) return denied;
  const db = auth.context.admin as unknown as SupabaseClient;
  const [outbox, dead, recurrence] = await Promise.all([
    db.from("outbox_events").select("status, event_type, retry_count, created_at, processed_at, last_error, claimed_at, lease_expires_at").eq("organization_id", auth.context.organizationId).order("created_at", { ascending: false }).limit(500),
    db.from("dead_letter_events").select("status, created_at, replayed_at").eq("organization_id", auth.context.organizationId).order("created_at", { ascending: false }).limit(500),
    db.from("recurrence_job_runs").select("status, attempts, created_at, completed_at, last_error").eq("organization_id", auth.context.organizationId).order("created_at", { ascending: false }).limit(500),
  ]);
  const outboxRows = (outbox.data ?? []) as QueueRow[];
  const deadRows = (dead.data ?? []) as QueueRow[];
  const recurrenceRows = (recurrence.data ?? []) as QueueRow[];
  const now = Date.now();
  const processing = outboxRows.filter((row) => row.status === "processing");
  const outboxWorker = outbox.error
    ? { name: "Outbox dispatcher", ...workerError(outbox.error) }
    : { name: "Outbox dispatcher", data_source: "database", error: null, status: processing.some((row) => isStale(row, now)) ? "degraded" : "healthy", pending: outboxRows.filter((row) => row.status === "pending").length, processing: processing.length, failed: outboxRows.filter((row) => row.status === "failed").length, last_activity_at: outboxRows[0]?.created_at ?? null };
  const deadWorker = dead.error
    ? { name: "Dead-letter queue", ...workerError(dead.error) }
    : { name: "Dead-letter queue", data_source: "database", error: null, status: deadRows.some((row) => row.status === "pending") ? "degraded" : "healthy", pending: deadRows.filter((row) => row.status === "pending").length, processing: 0, failed: deadRows.filter((row) => row.status === "pending").length, last_activity_at: deadRows[0]?.created_at ?? null };
  const recurrenceWorker = recurrence.error
    ? { name: "Recurring jobs", ...workerError(recurrence.error) }
    : { name: "Recurring jobs", data_source: "database", error: null, status: recurrenceRows.some((row) => row.status === "failed") ? "degraded" : "healthy", pending: recurrenceRows.filter((row) => row.status === "pending").length, processing: recurrenceRows.filter((row) => row.status === "processing").length, failed: recurrenceRows.filter((row) => row.status === "failed").length, last_activity_at: recurrenceRows[0]?.created_at ?? null };
  return NextResponse.json({ generated_at: new Date().toISOString(), workers: [
    outboxWorker,
    deadWorker,
    recurrenceWorker,
  ] });
}
