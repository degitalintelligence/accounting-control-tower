import { NextResponse } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";

/**
 * GET /api/dashboard/stats
 * Returns aggregate counts for dashboard stat cards.
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createServiceRoleClient();

  // Get user's organization_id from membership
  const { data: membership } = (await admin
    .from("memberships")
    .select("organization_id")
    .eq("profile_id", user.id)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle()) as unknown as {
    data: { organization_id: string } | null;
  };

  const orgId = membership?.organization_id;

  if (!orgId) {
    return NextResponse.json({
      critical_overdue: 0,
      waiting_review: 0,
      blocked: 0,
      on_time_rate: 0,
      total_completed: 0,
      total_items: 0,
    });
  }

  const now = new Date().toISOString();
  const { count: criticalOverdue } = await admin
    .from("work_items")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", orgId)
    .is("deleted_at", null)
    .not("status", "in", "(completed,cancelled,draft)")
    .lt("due_at", now);

  const { count: waitingReview } = await admin
    .from("work_items")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", orgId)
    .eq("status", "under_review")
    .is("deleted_at", null);

  const { count: blocked } = await admin
    .from("work_items")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", orgId)
    .is("deleted_at", null)
    .eq("status", "blocked");

  const { count: totalCompleted } = await admin
    .from("work_items")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", orgId)
    .is("deleted_at", null)
    .eq("status", "completed");

  const { count: totalItems } = await admin
    .from("work_items")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", orgId)
    .is("deleted_at", null)
    .not("status", "in", "(cancelled,draft)");

  const { data: completedItems } = (await admin
    .from("work_items")
    .select("completed_at, due_at")
    .eq("organization_id", orgId)
    .is("deleted_at", null)
    .eq("status", "completed")
    .not("completed_at", "is", null)
    .not("due_at", "is", null)) as unknown as {
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
