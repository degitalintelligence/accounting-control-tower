import { NextResponse } from "next/server";
import { getAuthContext, requirePermission } from "@/lib/authorization";

export async function GET() {
  const auth = await getAuthContext();
  if (auth.response) return auth.response;
  const denied = await requirePermission(auth.context, "reports.view");
  if (denied) return denied;

  const { admin, organizationId, isOrgWide, clientIds } = auth.context;
  const result = await (admin as unknown as { rpc: (name: string, params: Record<string, unknown>) => Promise<unknown> }).rpc(
    "report_analytics",
    { p_organization_id: organizationId, p_client_ids: isOrgWide ? null : clientIds }
  ) as {
    data: Record<string, unknown>[] | null;
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

  const analytics = result.data?.[0] ?? {};
  const lifecycle = (analytics.lifecycle ?? {}) as Record<string, number>;
  const versions = (analytics.versions ?? {}) as Record<string, { total: number; completed: number }>;

  return NextResponse.json({
    summary: {
      total: Number(analytics.total ?? 0),
      active: Number(analytics.active ?? 0),
      completed: Number(analytics.completed ?? 0),
      overdue: Number(analytics.overdue ?? 0),
      delivered: Number(analytics.delivered ?? 0),
      pending_delivery: Number(analytics.pending_delivery ?? 0),
      on_time_rate: Number(analytics.on_time_rate ?? 0),
    },
    lifecycle: Object.entries(lifecycle).map(([stage, total]) => ({ stage, total })),
    versions: Object.entries(versions).map(([version, value]) => ({ version, ...value })),
  });
}
