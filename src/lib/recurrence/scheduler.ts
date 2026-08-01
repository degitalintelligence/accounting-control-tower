import type { SupabaseClient } from "@supabase/supabase-js";

type Client = Pick<SupabaseClient, "from" | "rpc">;
type Rule = { id: string; template_id: string; rrule: string; timezone: string; generation_lead_days: number; skip_weekends: boolean };
type Job = { id: string; status: string; attempts: number; max_attempts: number; recurrence_rule_id: string; template_id: string; instance_key: string; occurrence_date: string };

function parseRule(rrule: string) {
  return Object.fromEntries(rrule.replace(/^RRULE:/i, "").split(";").map((part) => part.split("=")).filter(([key, value]) => key && value));
}

function dateKey(date: Date) { return date.toISOString().slice(0, 10); }

function localDateKey(date: Date, timezone: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

function parseDate(value: string | undefined) {
  if (!value) return null;
  const normalized = value.replace(/^(\d{4})(\d{2})(\d{2})$/, "$1-$2-$3").slice(0, 10);
  const date = new Date(`${normalized}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function matches(date: Date, rule: Record<string, string>, skipWeekends: boolean) {
  const day = date.getUTCDay();
  if (skipWeekends && (day === 0 || day === 6)) return false;
  if (rule.FREQ === "WEEKLY" && rule.BYDAY) {
    const days = rule.BYDAY.split(",").map((value) => ({ SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 }[value.replace(/[-+]?\d+$/, "")]));
    if (!days.includes(day)) return false;
  }
  if (rule.FREQ === "MONTHLY" && rule.BYMONTHDAY && Number(rule.BYMONTHDAY) !== date.getUTCDate()) return false;
  if (rule.FREQ === "YEARLY" && rule.BYMONTH && Number(rule.BYMONTH) !== date.getUTCMonth() + 1) return false;
  if (rule.FREQ === "YEARLY" && rule.BYMONTHDAY && Number(rule.BYMONTHDAY) !== date.getUTCDate()) return false;
  return true;
}

function occurrences(rrule: string, timezone: string, skipWeekends: boolean, from: Date, until: Date) {
  const rule = parseRule(rrule);
  const result: string[] = [];
  const cursor = new Date(`${localDateKey(from, timezone)}T00:00:00.000Z`);
  const interval = Math.max(1, Number(rule.INTERVAL ?? 1));
  const count = Number.isFinite(Number(rule.COUNT)) ? Math.max(0, Number(rule.COUNT)) : null;
  const ruleUntil = parseDate(rule.UNTIL);
  const anchor = new Date(cursor);
  while (cursor <= until && result.length < 200) {
    const elapsedDays = Math.floor((cursor.getTime() - anchor.getTime()) / 86400000);
    const validFrequency = rule.FREQ === "DAILY" || rule.FREQ === "WEEKDAY" || rule.FREQ === "WEEKLY" || rule.FREQ === "MONTHLY" || rule.FREQ === "YEARLY";
    const frequencyInterval = rule.FREQ === "DAILY" ? elapsedDays % interval === 0 : rule.FREQ === "WEEKLY" ? Math.floor(elapsedDays / 7) % interval === 0 : rule.FREQ === "MONTHLY" ? (cursor.getUTCMonth() - anchor.getUTCMonth() + 12 * (cursor.getUTCFullYear() - anchor.getUTCFullYear())) % interval === 0 : rule.FREQ === "YEARLY" ? (cursor.getUTCFullYear() - anchor.getUTCFullYear()) % interval === 0 : true;
    const beforeRuleUntil = !ruleUntil || cursor <= ruleUntil;
    if (validFrequency && beforeRuleUntil && frequencyInterval && matches(cursor, rule, rule.FREQ === "WEEKDAY" || skipWeekends)) result.push(dateKey(cursor));
    if (count !== null && result.length >= count) break;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return result;
}

async function enqueue(admin: Client, rule: Rule, templateOrg: string, date: string) {
  const instanceKey = `${rule.id}:${date}`;
  const result = await admin.from("recurrence_job_runs").upsert({ organization_id: templateOrg, recurrence_rule_id: rule.id, template_id: rule.template_id, instance_key: instanceKey, occurrence_date: date, status: "pending" }, { onConflict: "recurrence_rule_id,instance_key", ignoreDuplicates: true });
  const error = (result as unknown as { error: { message: string } | null }).error;
  if (error) throw new Error(error.message);
}

async function recover(admin: Client) {
  const result = await admin.from("recurrence_job_runs").update({ status: "pending", locked_at: null, next_retry_at: new Date().toISOString() }).eq("status", "processing").lt("locked_at", new Date(Date.now() - 15 * 60 * 1000).toISOString());
  const error = (result as unknown as { error: { message: string } | null }).error;
  if (error) throw new Error(error.message);
}

async function processJob(admin: Client, job: Job, createdBy: string | null) {
  const claimed = await admin.from("recurrence_job_runs").update({ status: "processing", locked_at: new Date().toISOString(), attempts: job.attempts + 1 }).eq("id", job.id).eq("status", "pending").select("id").maybeSingle();
  const claim = claimed as unknown as { data: { id: string } | null; error: { message: string } | null };
  if (claim.error) throw new Error(claim.error.message);
  if (!claim.data) return false;
  try {
    const versionResult = await admin.from("template_versions").select("id").eq("template_id", job.template_id).order("version_number", { ascending: false }).limit(1).single();
    const version = versionResult as unknown as { data: { id: string } | null; error: { message: string } | null };
    if (version.error || !version.data) throw new Error(version.error?.message ?? "Versi template tidak ditemukan");
    const rpc = await admin.rpc("instantiate_template_instance", { p_template_id: job.template_id, p_template_version_id: version.data.id, p_instance_key: job.instance_key, p_occurrence_date: job.occurrence_date, p_due_at: `${job.occurrence_date}T23:59:59.000Z`, p_start_at: `${job.occurrence_date}T00:00:00.000Z`, p_created_by: createdBy });
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
  await recover(admin);
  const rulesResult = await admin.from("recurrence_rules").select("id, template_id, rrule, timezone, generation_lead_days, skip_weekends, task_templates!inner(organization_id, is_active, deleted_at)").is("deleted_at", null).eq("task_templates.is_active", true);
  const rules = rulesResult as unknown as { data: (Rule & { task_templates: { organization_id: string } })[] | null; error: { message: string } | null };
  if (rules.error) throw new Error(rules.error.message);
  const now = new Date();
  const from = new Date(now); from.setUTCDate(from.getUTCDate() - 90);
  for (const rule of rules.data ?? []) for (const date of occurrences(rule.rrule, rule.timezone, rule.skip_weekends, from, new Date(now.getTime() + (rule.generation_lead_days || 0) * 86400000))) await enqueue(admin, rule, rule.task_templates.organization_id, date);
  const jobsResult = await admin.from("recurrence_job_runs").select("id, status, attempts, max_attempts, recurrence_rule_id, template_id, instance_key, occurrence_date").eq("status", "pending").or(`next_retry_at.is.null,next_retry_at.lte.${now.toISOString()}`).order("occurrence_date", { ascending: true }).limit(50);
  const jobs = jobsResult as unknown as { data: Job[] | null; error: { message: string } | null };
  if (jobs.error) throw new Error(jobs.error.message);
  let processed = 0; let failed = 0;
  for (const job of jobs.data ?? []) { if (await processJob(admin, job, null)) processed++; else failed++; }
  return { enqueued: (rules.data ?? []).length, processed, failed };
}
