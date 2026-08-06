import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/authorization";

/**
 * GET /api/dashboard/stats
 * Returns aggregate counts for dashboard stat cards.
 */
export async function GET() {
  const auth = await getAuthContext();
  if (auth.response) return auth.response;
  const { admin, organizationId, isOrgWide, clientIds } = auth.context;
  if (isOrgWide) {
    const analytics = await (admin as unknown as { rpc: (name: string, params: Record<string, string>) => Promise<{ data: Array<Record<string, unknown>> | null; error: { message: string } | null }> }).rpc("dashboard_analytics", { p_organization_id: organizationId });
    if (!analytics.error && analytics.data?.[0]) return NextResponse.json(analytics.data[0]);
  }
  const scope = <T extends { in: (column: string, values: string[]) => T }>(query: T) => isOrgWide ? query : query.in("client_id", clientIds);

  const now = new Date().toISOString();
  const criticalResult = await scope(admin
    .from("work_items")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId)
    .is("deleted_at", null)
    .not("status", "in", "(completed,cancelled,draft)")
    .lt("due_at", now));
  const criticalOverdue = criticalResult.count;
  if (criticalResult.error) return NextResponse.json({ error: "Gagal mengambil statistik dashboard." }, { status: 500 });

  const waitingResult = await scope(admin
    .from("work_items")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId)
    .eq("status", "under_review")
    .is("deleted_at", null));
  const waitingReview = waitingResult.count;
  if (waitingResult.error) return NextResponse.json({ error: "Gagal mengambil statistik dashboard." }, { status: 500 });

  const blockedResult = await scope(admin
    .from("work_items")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId)
    .is("deleted_at", null)
    .eq("status", "blocked"));
  const blocked = blockedResult.count;
  if (blockedResult.error) return NextResponse.json({ error: "Gagal mengambil statistik dashboard." }, { status: 500 });

  const completedResult = await scope(admin
    .from("work_items")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId)
    .is("deleted_at", null)
    .eq("status", "completed"));
  const totalCompleted = completedResult.count;
  if (completedResult.error) return NextResponse.json({ error: "Gagal mengambil statistik dashboard." }, { status: 500 });

  const totalResult = await scope(admin
    .from("work_items")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId)
    .is("deleted_at", null)
    .not("status", "in", "(cancelled,draft)"));
  const totalItems = totalResult.count;
  if (totalResult.error) return NextResponse.json({ error: "Gagal mengambil statistik dashboard." }, { status: 500 });

  const { data: completedItems } = (await scope(admin
    .from("work_items")
    .select("completed_at, due_at")
    .eq("organization_id", organizationId)
    .is("deleted_at", null)
    .eq("status", "completed")
    .not("completed_at", "is", null)
    .not("due_at", "is", null))) as unknown as {
    data: { completed_at: string; due_at: string }[] | null;
  };

  const onTimeItems = (completedItems ?? []).filter((item) =>
    item.completed_at <= item.due_at
  ).length;

  const completedCount = totalCompleted ?? 0;
  const onTimeRate =
    completedCount > 0
      ? Math.round((onTimeItems / completedCount) * 100)
      : 0;

  return NextResponse.json({
    critical_overdue: criticalOverdue ?? 0,
    waiting_review: waitingReview ?? 0,
    blocked: blocked ?? 0,
    on_time_rate: onTimeRate,
    total_completed: completedCount,
    total_items: totalItems ?? 0,
    average_cycle_hours: null,
    revision_rate: null,
    high_risk_open: null,
    overdue_weight: null,
    audit_coverage_rate: null,
  });
}
