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
  const scope = <T extends { in: (column: string, values: string[]) => T }>(query: T) => isOrgWide ? query : query.in("client_id", clientIds);

  const now = new Date().toISOString();
  const { count: criticalOverdue } = await scope(admin
    .from("work_items")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId)
    .is("deleted_at", null)
    .not("status", "in", "(completed,cancelled,draft)")
    .lt("due_at", now));

  const { count: waitingReview } = await scope(admin
    .from("work_items")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId)
    .eq("status", "under_review")
    .is("deleted_at", null));

  const { count: blocked } = await scope(admin
    .from("work_items")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId)
    .is("deleted_at", null)
    .eq("status", "blocked"));

  const { count: totalCompleted } = await scope(admin
    .from("work_items")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId)
    .is("deleted_at", null)
    .eq("status", "completed"));

  const { count: totalItems } = await scope(admin
    .from("work_items")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId)
    .is("deleted_at", null)
    .not("status", "in", "(cancelled,draft)"));

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
  });
}
