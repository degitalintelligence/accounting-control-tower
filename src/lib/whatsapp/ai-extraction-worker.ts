import type { SupabaseClient } from "@supabase/supabase-js";
import { extractTasksFromMessage } from "@/lib/ai/openrouter-client";

type WorkerClient = Pick<SupabaseClient, "from">;

type JobRow = {
  id: string;
  domain_event_id: string | null;
  event_type: string;
  payload: Record<string, unknown>;
  retry_count: number;
  max_retries: number;
};

type MessageContext = {
  id: string;
  content: string | null;
  organization_id: string;
};

const batchSize = 10;
const promptVersion = "task-extraction-v1";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message.slice(0, 500) : "Kesalahan tidak diketahui.";
}

async function claimNext(admin: WorkerClient): Promise<JobRow | null> {
  const now = new Date().toISOString();
  const pendingResult = await admin
    .from("outbox_events")
    .select("id, domain_event_id, event_type, payload, retry_count, max_retries")
    .eq("event_type", "ai_extraction_requested")
    .eq("status", "pending")
    .or(`next_retry_at.is.null,next_retry_at.lte.${now}`)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  const pending = pendingResult as unknown as { data: JobRow | null; error: { message: string } | null };
  if (pending.error) throw new Error(pending.error.message);
  if (!pending.data) return null;

  const claimedResult = await admin
    .from("outbox_events")
    .update({ status: "processing" })
    .eq("id", pending.data.id)
    .eq("status", "pending")
    .select("id, domain_event_id, event_type, payload, retry_count, max_retries")
    .maybeSingle();
  const claimed = claimedResult as unknown as { data: JobRow | null; error: { message: string } | null };
  if (claimed.error) throw new Error(claimed.error.message);
  return claimed.data;
}

async function markCompleted(admin: WorkerClient, id: string) {
  const result = await admin
    .from("outbox_events")
    .update({ status: "processed", processed_at: new Date().toISOString(), next_retry_at: null })
    .eq("id", id)
    .eq("status", "processing");
  const update = result as unknown as { error: { message: string } | null };
  if (update.error) throw new Error(update.error.message);
}

async function markFailed(admin: WorkerClient, row: JobRow) {
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

async function loadMessage(admin: WorkerClient, messageId: string, organizationId: string): Promise<MessageContext> {
  const result = await admin
    .from("wa_messages")
    .select("id, content, wa_group_id, wa_groups!inner(organization_id)")
    .eq("id", messageId)
    .eq("wa_groups.organization_id", organizationId)
    .maybeSingle();
  const loaded = result as unknown as {
    data: { id: string; content: string | null; wa_groups: { organization_id: string } | null } | null;
    error: { message: string } | null;
  };
  if (loaded.error) throw new Error(loaded.error.message);
  if (!loaded.data || loaded.data.wa_groups?.organization_id !== organizationId) {
    throw new Error("Pesan WhatsApp tidak ditemukan dalam tenant yang sesuai.");
  }
  return { id: loaded.data.id, content: loaded.data.content, organization_id: organizationId };
}

async function processJob(admin: WorkerClient, row: JobRow) {
  if (row.event_type !== "ai_extraction_requested") return;
  const messageId = typeof row.payload.message_id === "string" ? row.payload.message_id : null;
  const organizationId = typeof row.payload.organization_id === "string" ? row.payload.organization_id : null;
  if (!messageId || !organizationId) throw new Error("Payload job AI extraction tidak lengkap.");

  const message = await loadMessage(admin, messageId, organizationId);
  const existingResult = await admin.from("ai_extraction_runs").select("id, status").eq("wa_message_id", message.id).maybeSingle();
  const existing = existingResult as unknown as { data: { id: string; status: string } | null; error: { message: string } | null };
  if (existing.error) throw new Error(existing.error.message);
  if (existing.data?.status === "completed") return;

  let runId = existing.data?.id;
  if (!runId) {
    const runResult = await admin.from("ai_extraction_runs").insert({
      wa_message_id: message.id,
      model: process.env.OPENROUTER_MODEL ?? null,
      prompt_version: promptVersion,
      status: "processing",
    }).select("id").single();
    const run = runResult as unknown as { data: { id: string } | null; error: { code?: string; message: string } | null };
    if (run.error && run.error.code !== "23505") throw new Error(run.error.message);
    if (run.error) {
      const retryResult = await admin.from("ai_extraction_runs").select("id, status").eq("wa_message_id", message.id).single();
      const retry = retryResult as unknown as { data: { id: string; status: string } | null; error: { message: string } | null };
      if (retry.error || !retry.data) throw new Error(retry.error?.message ?? "Extraction run tidak ditemukan.");
      if (retry.data.status === "completed") return;
      runId = retry.data.id;
    } else {
      runId = run.data?.id;
    }
  }
  if (!runId) throw new Error("Extraction run tidak dapat dibuat.");

  try {
    const extraction = await extractTasksFromMessage(message.content ?? "");
    const extractionRunResult = await admin.from("ai_extraction_runs").update({
      model: process.env.OPENROUTER_MODEL ?? null,
      prompt_version: promptVersion,
      extracted_fields: extraction,
      classification: extraction.classification,
      confidence: extraction.tasks.length ? Math.max(...extraction.tasks.map((task) => task.confidence)) : null,
      processing_time_ms: null,
      status: "completed",
      error_message: null,
    }).eq("id", runId);
    const extractionRun = extractionRunResult as unknown as { error: { message: string } | null };
    if (extractionRun.error) throw new Error(extractionRun.error.message);

    for (const task of extraction.tasks) {
      const suggestionResult = await admin.from("action_suggestions").upsert({
        organization_id: message.organization_id,
        extraction_run_id: runId,
        source_type: "whatsapp_ai",
        source_reference_id: message.id,
        source_metadata: { classification: extraction.classification, source_context: task.source_context, reasons: task.reasons },
        suggested_title: task.title,
        suggested_description: task.source_context || null,
        suggested_due_at: task.due_date ? `${task.due_date}T00:00:00.000Z` : null,
        confidence: task.confidence,
        status: "pending",
      }, { onConflict: "extraction_run_id,suggested_title", ignoreDuplicates: true });
      const suggestion = suggestionResult as unknown as { error: { code?: string; message: string } | null };
      if (suggestion.error) throw new Error(suggestion.error.message);
    }
  } catch (error) {
    await admin.from("ai_extraction_runs").update({ status: "failed", error_message: errorMessage(error) }).eq("id", runId);
    throw error;
  }
}

export async function runAiExtractionWorker(admin: WorkerClient) {
  let processed = 0;
  let failed = 0;
  for (let index = 0; index < batchSize; index += 1) {
    const row = await claimNext(admin);
    if (!row) break;
    try {
      await processJob(admin, row);
      await markCompleted(admin, row.id);
      processed += 1;
    } catch (error) {
      await markFailed(admin, row);
      failed += 1;
      console.error("[ai-extraction-worker] Pemrosesan gagal:", { outboxId: row.id, message: errorMessage(error) });
    }
  }
  return { processed, failed };
}
