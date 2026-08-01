import type { SupabaseClient } from "@supabase/supabase-js";
import { previewOccurrences, selectTemplateVersion } from "@/lib/recurrence/rules";

type Client = Pick<SupabaseClient, "from" | "rpc">;
type Rule = { id: string; template_id: string; rrule: string; timezone: string; generation_lead_days: number; holiday_handling: "allow" | "skip" | "next_working_day"; skip_weekends: boolean };
type Job = { id: string; attempts: number; max_attempts: number; template_id: string; instance_key: string; occurrence_date: string };

async function enqueue(admin: Client, rule: Rule, organizationId: string, date: string) {
  const result = await admin.from("recurrence_job_runs").upsert({ organization_id: organizationId, recurrence_rule_id: rule.id, template_id: rule.template_id, instance_key: `${rule.id}:${date}`, occurrence_date: date, status: "pending" }, { onConflict: "recurrence_rule_id,instance_key", ignoreDuplicates: true });
  const error = (result as unknown as { error: { message: string } | null }).error;
  if (error) throw new Error(error.message);
}

async function processJob(admin: Client, job: Job, createdBy: string | null) {
  const claimed = await admin.from("recurrence_job_runs").update({ status: "processing", locked_at: new Date().toISOString(), attempts: job.attempts + 1 }).eq("id", job.id).eq("status", "pending").select("id").maybeSingle();
  const claim = claimed as unknown as { data: { id: string } | null; error: { message: string } | null };
  if (claim.error) throw new Error(claim.error.message);
  if (!claim.data) return false;
  try {
    const result = await admin.from("template_versions").select("id, version_number, effective_from").eq("template_id", job.template_id);
    const versions = result as unknown as { data: { id: string; version_number: number; effective_from: string | null }[] | null; error: { message: string } | null };
    if (versions.error) throw new Error(versions.error.message);
    const version = selectTemplateVersion(versions.data ?? [], job.occurrence_date);
    if (!version) throw new Error("Versi template tidak ditemukan");
    const rpc = await admin.rpc("instantiate_template_instance", { p_template_id: job.template_id, p_template_version_id: version.id, p_instance_key: job.instance_key, p_occurrence_date: job.occurrence_date, p_due_at: `${job.occurrence_date}T23:59:59.000Z`, p_start_at: `${job.occurrence_date}T00:00:00.000Z`, p_created_by: createdBy });
    const rpcResult = rpc as unknown as { data: { parent: { id: string } } | null; error: { message: string } | null };
    if (rpcResult.error) throw new Error(rpcResult.error.message);
    await admin.from("recurrence_job_runs").update({ status: "completed", completed_at: new Date().toISOString(), locked_at: null, work_item_id: rpcResult.data?.parent.id ?? null, last_error: null }).eq("id", job.id);
    return true;
  } catch (error) {
    const attempts = job.attempts + 1;
    await admin.from("recurrence_job_runs").update({ status: attempts >= job.max_attempts ? "failed" : "pending", next_retry_at: attempts >= job.max_attempts ? null : new Date(Date.now() + Math.min(8 * 3600000, 30000 * 2 ** Math.max(0, attempts - 1))).toISOString(), locked_at: null, last_error: error instanceof Error ? error.message : "Kesalahan worker" }).eq("id", job.id);
    return false;
  }
}

export async function runRecurrenceWorker(admin: Client) {
  const rulesResult = await admin.from("recurrence_rules").select("id, template_id, rrule, timezone, generation_lead_days, holiday_handling, skip_weekends, task_templates!inner(organization_id, is_active, deleted_at)").is("deleted_at", null).eq("task_templates.is_active", true).is("task_templates.deleted_at", null);
  const rules = rulesResult as unknown as { data: (Rule & { task_templates: { organization_id: string } })[] | null; error: { message: string } | null };
  if (rules.error) throw new Error(rules.error.message);
  const now = new Date();
  for (const rule of rules.data ?? []) for (const occurrence of previewOccurrences(rule.rrule, rule.timezone, now, 200, { skipWeekends: rule.skip_weekends, holidayHandling: rule.holiday_handling })) if (occurrence.date <= new Intl.DateTimeFormat("en-CA", { timeZone: rule.timezone }).format(new Date(now.getTime() + rule.generation_lead_days * 86400000))) await enqueue(admin, rule, rule.task_templates.organization_id, occurrence.date);
  const jobsResult = await admin.from("recurrence_job_runs").select("id, attempts, max_attempts, template_id, instance_key, occurrence_date").eq("status", "pending").or(`next_retry_at.is.null,next_retry_at.lte.${now.toISOString()}`).order("occurrence_date", { ascending: true }).limit(50);
  const jobs = jobsResult as unknown as { data: Job[] | null; error: { message: string } | null };
  if (jobs.error) throw new Error(jobs.error.message);
  let processed = 0; let failed = 0;
  for (const job of jobs.data ?? []) { if (await processJob(admin, job, null)) processed++; else failed++; }
  return { enqueued: (rules.data ?? []).length, processed, failed };
}
