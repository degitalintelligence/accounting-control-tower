import { NextResponse } from "next/server";
import { getAuthContext, requirePermission } from "@/lib/authorization";
import { structuredSupabaseError } from "@/lib/supabase/error";

type DashboardAnalyticsResult = {
  data: Array<Record<string, unknown>> | null;
  error: unknown;
};

type DashboardAnalyticsClient = {
  rpc: (
    name: string,
    params: Record<string, string | string[]>
  ) => Promise<DashboardAnalyticsResult>;
};

function statusForAnalyticsError(error: ReturnType<typeof structuredSupabaseError>) {
  if (error.code === "PGRST205" || error.code === "PGRST106") return 503;
  return 500;
}

/**
 * GET /api/dashboard/stats
 * Returns aggregate counts for dashboard stat cards.
 */
export async function GET() {
  const auth = await getAuthContext();
  if (auth.response) return auth.response;
  const denied = await requirePermission(auth.context, "workspace.view");
  if (denied) return denied;

  const { admin, organizationId, isOrgWide, clientIds } = auth.context;
  const rpcParams: Record<string, string | string[]> = {
    p_organization_id: organizationId,
    ...(isOrgWide ? {} : { p_client_ids: clientIds }),
  };

  try {
    const analytics = await (admin as unknown as DashboardAnalyticsClient).rpc(
      "dashboard_analytics",
      rpcParams
    );

    if (analytics.error) {
      const error = structuredSupabaseError(analytics.error);
      console.error("Dashboard analytics RPC failed", {
        message: error.message,
        code: error.code,
        hint: error.hint,
        details: error.details,
      });

      return NextResponse.json(
        { error: "Statistik dashboard sedang tidak tersedia." },
        { status: statusForAnalyticsError(error) }
      );
    }

    if (!analytics.data?.[0]) {
      console.error("Dashboard analytics RPC returned no row", {
        organizationScope: "authenticated-organization",
      });
      return NextResponse.json(
        { error: "Statistik dashboard sedang tidak tersedia." },
        { status: 503 }
      );
    }

    return NextResponse.json(analytics.data[0]);
  } catch (error) {
    const structuredError = structuredSupabaseError(error);
    console.error("Dashboard analytics RPC threw an exception", {
      message: structuredError.message,
      code: structuredError.code,
      hint: structuredError.hint,
      details: structuredError.details,
    });

    return NextResponse.json(
      { error: "Statistik dashboard sedang tidak tersedia." },
      { status: 500 }
    );
  }
}
