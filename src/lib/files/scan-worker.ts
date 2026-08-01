import type { SupabaseClient } from "@supabase/supabase-js";
import { getRequiredServerEnv } from "@/lib/server-env";
import { scanFile } from "./malware-scanner";

type WorkerClient = Pick<SupabaseClient, "from" | "rpc" | "storage">;
type Job = { id: string; claim_token: string; payload: Record<string, unknown>; organization_id: string };

async function claim(admin: WorkerClient, workerId: string): Promise<Job | null> {
  const result = await admin.rpc("claim_outbox_event" as never, { p_worker_id: workerId, p_event_type: "file_scan_requested", p_lease_seconds: 600 });
  const data = result as unknown as { data: Job[] | null; error: { message: string } | null };
  if (data.error) throw new Error(data.error.message);
  return data.data?.[0] ?? null;
}

async function finish(admin: WorkerClient, id: string, workerId: string, claimToken: string) {
  const result = await admin.from("outbox_events").update({ status: "processed", processed_at: new Date().toISOString(), next_retry_at: null, lease_expires_at: null, claimed_at: null, claimed_by: null, claim_token: null }).eq("id", id).eq("status", "processing").eq("claimed_by", workerId).eq("claim_token", claimToken);
  const data = result as unknown as { error: { message: string } | null };
  if (data.error) throw new Error(data.error.message);
}

async function fail(admin: WorkerClient, id: string, workerId: string, message: string) {
  const result = await admin.rpc("fail_outbox_event" as never, { p_outbox_event_id: id, p_error_message: message.slice(0, 500), p_worker_id: workerId });
  const data = result as unknown as { error: { message: string } | null };
  if (data.error) throw new Error(data.error.message);
}

async function processJob(admin: WorkerClient, job: Job) {
  const fileId = typeof job.payload.file_id === "string" ? job.payload.file_id : null;
  if (!fileId) throw new Error("Payload scan file tidak lengkap.");
  const fileResult = await admin.from("files").select("id, storage_path, filename, mime_type, scan_status").eq("id", fileId).eq("organization_id", job.organization_id).maybeSingle();
  const file = fileResult as unknown as { data: { id: string; storage_path: string; filename: string; mime_type: string | null; scan_status: string } | null; error: { message: string } | null };
  if (file.error) throw new Error(file.error.message);
  if (!file.data || file.data.scan_status === "clean" || file.data.scan_status === "infected") return;
  const bucket = getRequiredServerEnv("SUPABASE_STORAGE_BUCKET");
  const download = await admin.storage.from(bucket).download(file.data.storage_path);
  if (download.error) throw new Error(download.error.message);
  const result = await scanFile({ content: new Uint8Array(await download.data.arrayBuffer()), filename: file.data.filename, mimeType: file.data.mime_type });
  await admin.from("files").update({ scan_status: result.status, scanned_at: new Date().toISOString(), scanner_name: result.scannerName, scan_error: null }).eq("id", fileId).eq("organization_id", job.organization_id);
}

export async function runFileScanWorker(admin: WorkerClient) {
  const workerId = `file-scan-${crypto.randomUUID()}`;
  let processed = 0;
  let failed = 0;
  for (let index = 0; index < 10; index += 1) {
    const job = await claim(admin, workerId);
    if (!job) break;
    try { await processJob(admin, job); await finish(admin, job.id, workerId, job.claim_token); processed += 1; }
    catch (error) { await fail(admin, job.id, workerId, error instanceof Error ? error.message : "Pemeriksaan file gagal."); failed += 1; }
  }
  return { processed, failed };
}
