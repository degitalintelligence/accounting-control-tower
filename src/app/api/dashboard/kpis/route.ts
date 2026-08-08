import { NextRequest, NextResponse } from "next/server";
import { getAuthContext, requirePermission } from "@/lib/authorization";
import type { DashboardKpis } from "@/types/dashboard";

function errorDetails(error: { message?: string; code?: string; hint?: string; details?: string } | null) {
  return error ? { message: error.message, code: error.code, hint: error.hint, details: error.details } : null;
}

export async function GET(request: NextRequest) {
  const auth = await getAuthContext();
  if (auth.response) return auth.response;
  const denied = await requirePermission(auth.context, "workspace.view");
  if (denied) return denied;
  const { admin, organizationId, isOrgWide, clientIds } = auth.context;
  const params = request.nextUrl.searchParams;
  const from = params.get("from");
  const to = params.get("to");
  const includeRollups = params.get("include_rollups") === "true";
  const result = await (admin as unknown as { rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: DashboardKpis[] | null; error: { message?: string; code?: string; hint?: string; details?: string } | null }> }).rpc("dashboard_kpi_analytics", {
    p_organization_id: organizationId,
    p_client_ids: isOrgWide ? null : clientIds,
    p_from: from || null,
    p_to: to || null,
    p_include_rollups: includeRollups,
  });
  if (result.error) {
    console.error("[GET /api/dashboard/kpis] Supabase error:", errorDetails(result.error));
    return NextResponse.json({ error: "Gagal mengambil KPI dashboard." }, { status: 500 });
  }
  return NextResponse.json(result.data?.[0] ?? null);
}
