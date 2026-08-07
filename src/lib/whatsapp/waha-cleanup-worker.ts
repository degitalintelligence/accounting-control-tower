import type { SupabaseClient } from "@supabase/supabase-js";
import type { Json } from "@/lib/supabase/types";
import { structuredSupabaseError } from "@/lib/supabase/error";
import { deleteWahaSession, WahaRequestError } from "./adapter";

type CleanupClient = Pick<SupabaseClient, "from" | "rpc">;

type OutboxRow = {
  id: string;
  payload: Json;
  retry_count: number;
  max_retries: number;
  claimed_by: string | null;
  claim_token: string | null;
};

type CleanupSession = { session_id: string };

type CleanupPayload = { sessions?: Json };

const batchSize = 20;

function isRecord(value: Json | undefined): value is { [key: string]: Json | undefined } {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseSessions(payload: Json): CleanupSession[] {
  if (!isRecord(payload)) throw new Error("Payload cleanup WAHA tidak valid.");
  const sessions = (payload as CleanupPayload).sessions;
  if (!Array.isArray(sessions)) throw new Error("Daftar session cleanup WAHA tidak valid.");

  return sessions.map((session) => {
    if (!isRecord(session) || typeof session.session_id !== "string" || !session.session_id) {
      throw new Error("Session cleanup WAHA tidak lengkap.");
    }
    return { session_id: session.session_id };
  });
}

async function claimNext(admin: CleanupClient, workerId: string): Promise<OutboxRow | null> {
  const result = await admin.rpc("claim_outbox_event" as never, {
    p_worker_id: workerId,
    p_event_type: "waha_session_cleanup_requested",
    p_lease_seconds: 900,
  });
  const claimed = result as unknown as { data: OutboxRow[] | null; error: { message: string } | null };
  if (claimed.error) throw new Error(claimed.error.message);
  return claimed.data?.[0] ?? null;
}

async function markProcessed(admin: CleanupClient, row: OutboxRow, workerId: string) {
  const result = await admin
    .from("outbox_events")
    .update({ status: "processed", processed_at: new Date().toISOString(), next_retry_at: null, lease_expires_at: null, claimed_at: null, claimed_by: null, claim_token: null })
    .eq("id", row.id)
    .eq("status", "processing")
    .eq("claimed_by", workerId)
    .eq("claim_token", row.claim_token);
  const update = result as unknown as { error: { message: string } | null };
  if (update.error) throw new Error(update.error.message);
}

async function markFailed(admin: CleanupClient, row: OutboxRow, workerId: string, error: unknown) {
  const result = await admin.rpc("fail_outbox_event" as never, {
    p_outbox_event_id: row.id,
    p_error_message: error instanceof Error ? error.message.slice(0, 500) : "Cleanup WAHA gagal.",
    p_worker_id: workerId,
  });
  const update = result as unknown as { error: { message: string } | null };
  if (update.error) throw new Error(update.error.message);
}

async function processRow(row: OutboxRow) {
  for (const { session_id: sessionId } of parseSessions(row.payload)) {
    try {
      await deleteWahaSession(sessionId);
    } catch (error) {
      if (error instanceof WahaRequestError && error.status === 404) continue;
      throw error;
    }
  }
}

export async function runWahaCleanupWorker(admin: CleanupClient) {
  const workerId = `waha-cleanup-${crypto.randomUUID()}`;
  let processed = 0;
  let failed = 0;

  for (let index = 0; index < batchSize; index += 1) {
    const row = await claimNext(admin, workerId);
    if (!row) break;

    try {
      await processRow(row);
      await markProcessed(admin, row, workerId);
      processed += 1;
    } catch (error) {
      try {
        await markFailed(admin, row, workerId, error);
      } catch (failureError) {
        console.error("[waha-cleanup] Gagal mencatat kegagalan:", {
          outboxId: row.id,
          error: failureError instanceof Error ? { message: failureError.message } : structuredSupabaseError(failureError),
        });
      }
      failed += 1;
      console.error("[waha-cleanup] Pemrosesan gagal:", {
        outboxId: row.id,
        error: error instanceof Error ? { message: error.message } : structuredSupabaseError(error),
      });
    }
  }

  return { processed, failed };
}
