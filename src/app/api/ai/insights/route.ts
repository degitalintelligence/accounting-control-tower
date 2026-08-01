import { NextResponse } from "next/server";
import { generateDashboardInsights, OpenRouterError, type DashboardInsights } from "@/lib/ai/openrouter-client";
import { getAuthContext } from "@/lib/authorization";

type ErrorShape = { message: string; code?: string; hint?: string; details?: string };
type WorkItemMetric = { status: string; type: string; due_at: string | null; completed_at: string | null; created_at: string };

const ACTIVE_STATUSES = ["draft", "assigned", "in_progress", "submitted", "under_review", "revision_required", "resubmitted", "awaiting_approval", "blocked"];

function startOfUtcDay(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
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
  const auth = await getAuthContext();
  if (auth.response) return auth.response;
  const { admin, organizationId, isOrgWide, clientIds } = auth.context;

  const now = new Date();
  const today = startOfUtcDay(now);
  const currentStart = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
  const previousStart = new Date(today.getTime() - 14 * 24 * 60 * 60 * 1000);
  let query = admin.from("work_items").select("status, type, due_at, completed_at, created_at").eq("organization_id", organizationId).is("deleted_at", null);
  if (!isOrgWide) query = query.in("client_id", clientIds);
  const result = await query;
  const rows = result as unknown as { data: WorkItemMetric[] | null; error: ErrorShape | null };
  if (rows.error) return NextResponse.json({ error: "Gagal mengambil metrik dashboard." }, { status: 500 });

  const metrics = { current: aggregate(rows.data ?? [], currentStart, today, now), previous: aggregate(rows.data ?? [], previousStart, currentStart, now) };
  let insights: DashboardInsights;
  try {
    insights = await generateDashboardInsights(metricsContext(metrics));
  } catch (error) {
    const aiError = error instanceof OpenRouterError ? error : null;
    console.error("[ai-insights] provider failure", {
      code: aiError?.code ?? "UNKNOWN",
      status: aiError?.status ?? null,
    });
    return NextResponse.json({ error: "Insight tidak tersedia saat ini." }, { status: 503 });
  }
  return NextResponse.json({ period_start: currentStart.toISOString(), period_end: today.toISOString(), metrics, insights, source: "ai" });
}
