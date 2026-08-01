import { NextResponse } from "next/server";
import { generateDashboardInsights, type DashboardInsights } from "@/lib/ai/openrouter-client";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";

type ErrorShape = { message: string; code?: string; hint?: string; details?: string };
type WorkItemMetric = { status: string; type: string; due_at: string | null; completed_at: string | null; created_at: string };
type Membership = { organization_id: string };

const ACTIVE_STATUSES = ["draft", "assigned", "in_progress", "submitted", "under_review", "revision_required", "resubmitted", "awaiting_approval", "blocked"];

function startOfUtcDay(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function fallbackInsights(metrics: Metrics): DashboardInsights {
  const priorities: string[] = [];
  const signals: string[] = [];
  if (metrics.current.overdue > 0) priorities.push(`Tindak lanjuti ${metrics.current.overdue} pekerjaan yang melewati tenggat.`);
  if (metrics.current.blocked > 0) priorities.push(`Buka hambatan pada ${metrics.current.blocked} pekerjaan yang masih blocked.`);
  if (metrics.current.waitingReview > 0) priorities.push(`Selesaikan review untuk ${metrics.current.waitingReview} pekerjaan yang menunggu pemeriksaan.`);
  if (priorities.length === 0) priorities.push("Pertahankan ritme penyelesaian dan pantau tenggat tujuh hari ke depan.");
  if (metrics.current.completed > metrics.previous.completed) signals.push("Penyelesaian minggu ini meningkat dibanding minggu sebelumnya.");
  if (metrics.current.completed < metrics.previous.completed) signals.push("Penyelesaian minggu ini menurun dibanding minggu sebelumnya.");
  if (metrics.current.onTimeRate >= 80) signals.push(`Ketepatan waktu berada di ${metrics.current.onTimeRate}%.`);
  if (metrics.current.onTimeRate < 80 && metrics.current.completed > 0) signals.push(`Ketepatan waktu masih ${metrics.current.onTimeRate}%, perlu perhatian pada perencanaan tenggat.`);
  if (signals.length === 0) signals.push("Belum ada sinyal perubahan besar dari metrik minggu berjalan.");
  return { summary: `Minggu ini terdapat ${metrics.current.completed} pekerjaan selesai dari ${metrics.current.created} pekerjaan baru.`, priorities, signals };
}

type PeriodMetrics = { created: number; completed: number; overdue: number; blocked: number; waitingReview: number; onTimeRate: number; byType: Record<string, number> };
type Metrics = { current: PeriodMetrics; previous: PeriodMetrics };

function aggregate(items: WorkItemMetric[], start: Date, end: Date, now: Date): PeriodMetrics {
  const period = items.filter((item) => item.created_at >= start.toISOString() && item.created_at < end.toISOString());
  const completed = items.filter((item) => item.completed_at && item.completed_at >= start.toISOString() && item.completed_at < end.toISOString());
  const completedOnTime = completed.filter((item) => item.due_at && item.completed_at && item.completed_at <= item.due_at).length;
  const active = items.filter((item) => ACTIVE_STATUSES.includes(item.status));
  const byType: Record<string, number> = {};
  for (const item of period) byType[item.type] = (byType[item.type] ?? 0) + 1;
  return {
    created: period.length,
    completed: completed.length,
    overdue: active.filter((item) => item.due_at && item.due_at < now.toISOString()).length,
    blocked: active.filter((item) => item.status === "blocked").length,
    waitingReview: active.filter((item) => item.status === "under_review").length,
    onTimeRate: completed.length ? Math.round((completedOnTime / completed.length) * 100) : 0,
    byType,
  };
}

function metricsContext(metrics: Metrics) {
  return JSON.stringify({ periode: "14 hari terakhir, dibagi minggu berjalan dan minggu sebelumnya", minggu_berjalan: metrics.current, minggu_sebelumnya: metrics.previous });
}

export async function GET() {
  const client = await createClient();
  const { data: { user } } = await client.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createServiceRoleClient();
  const membershipResult = await admin.from("memberships").select("organization_id").eq("profile_id", user.id).eq("is_active", true).limit(1).maybeSingle();
  const membership = membershipResult as unknown as { data: Membership | null; error: ErrorShape | null };
  if (membership.error || !membership.data) return NextResponse.json({ error: "Organisasi tidak ditemukan." }, { status: 403 });

  const now = new Date();
  const today = startOfUtcDay(now);
  const currentStart = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
  const previousStart = new Date(today.getTime() - 14 * 24 * 60 * 60 * 1000);
  const result = await admin.from("work_items").select("status, type, due_at, completed_at, created_at").eq("organization_id", membership.data.organization_id).is("deleted_at", null);
  const rows = result as unknown as { data: WorkItemMetric[] | null; error: ErrorShape | null };
  if (rows.error) return NextResponse.json({ error: "Gagal mengambil metrik dashboard." }, { status: 500 });

  const metrics = { current: aggregate(rows.data ?? [], currentStart, today, now), previous: aggregate(rows.data ?? [], previousStart, currentStart, now) };
  let insights: DashboardInsights;
  let source: "ai" | "fallback" = "ai";
  try {
    insights = await generateDashboardInsights(metricsContext(metrics));
  } catch {
    insights = fallbackInsights(metrics);
    source = "fallback";
  }
  return NextResponse.json({ period_start: currentStart.toISOString(), period_end: today.toISOString(), metrics, insights, source });
}
