import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/authorization";

type ReportRow = {
  type: string;
  status: string;
  priority: string;
  due_at: string | null;
  completed_at: string | null;
  created_at: string;
};

export async function GET() {
  const auth = await getAuthContext();
  if (auth.response) return auth.response;

  const { admin, organizationId, isOrgWide, clientIds } = auth.context;
  let query = admin
    .from("work_items")
    .select("type, status, priority, due_at, completed_at, created_at")
    .eq("organization_id", organizationId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(1000);

  if (!isOrgWide) query = query.in("client_id", clientIds);

  const result = (await query) as unknown as {
    data: ReportRow[] | null;
    error: { message: string; code?: string; hint?: string; details?: string } | null;
  };

  if (result.error) {
    console.error("[GET /api/reports] Supabase error:", {
      message: result.error.message,
      code: result.error.code,
      hint: result.error.hint,
      details: result.error.details,
    });
    return NextResponse.json({ error: "Gagal mengambil data laporan." }, { status: 500 });
  }

  const rows = result.data ?? [];
  const now = Date.now();
  const activeRows = rows.filter((row) => !["completed", "cancelled", "draft"].includes(row.status));
  const completedRows = rows.filter((row) => row.status === "completed");
  const overdueRows = activeRows.filter((row) => row.due_at && new Date(row.due_at).getTime() < now);
  const onTimeRows = completedRows.filter(
    (row) => row.completed_at && row.due_at && new Date(row.completed_at) <= new Date(row.due_at)
  );

  const byType = ["routine", "project", "ad_hoc", "report"].map((type) => ({
    type,
    total: rows.filter((row) => row.type === type).length,
    completed: completedRows.filter((row) => row.type === type).length,
  }));

  const byStatus = [
    "draft", "assigned", "in_progress", "blocked", "submitted", "under_review",
    "revision_required", "awaiting_approval", "approved", "completed", "cancelled",
  ].map((status) => ({ status, total: rows.filter((row) => row.status === status).length }));

  const monthly = Array.from({ length: 6 }, (_, index) => {
    const date = new Date();
    date.setDate(1);
    date.setMonth(date.getMonth() - (5 - index));
    const month = date.toISOString().slice(0, 7);
    return {
      month,
      created: rows.filter((row) => row.created_at.startsWith(month)).length,
      completed: completedRows.filter((row) => row.completed_at?.startsWith(month)).length,
    };
  });

  return NextResponse.json({
    summary: {
      total: rows.length,
      active: activeRows.length,
      completed: completedRows.length,
      overdue: overdueRows.length,
      on_time_rate: completedRows.length ? Math.round((onTimeRows.length / completedRows.length) * 100) : 0,
    },
    byType,
    byStatus,
    monthly,
  });
}
