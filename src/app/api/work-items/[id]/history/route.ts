import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { canAccessClient, getAuthContext } from "@/lib/authorization";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * GET /api/work-items/[id]/history
 * Audit trail untuk work item — query dari audit_logs (populated oleh
 * trigger log_change() dan app-level logAudit).
 * Juga include status transitions dari work_item_status_history.
 */
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const supabase = await createClient();
    const { id } = await context.params;

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const authContext = await getAuthContext();
    if (authContext.response) return authContext.response;
    const { admin, organizationId } = authContext.context;

    // Verifikasi work item exists dan milik org yang sama
    const wiResult = await admin
      .from("work_items")
      .select("id, organization_id, client_id")
      .eq("id", id)
      .eq("organization_id", organizationId)
      .is("deleted_at", null)
      .single();

    const { data: workItem, error: wiError } = wiResult as unknown as {
      data: { id: string; organization_id: string; client_id: string | null } | null;
      error: { message: string } | null;
    };

    if (wiError || !workItem) {
      return NextResponse.json(
        { error: "Work item tidak ditemukan." },
        { status: 404 }
      );
    }
    if (!canAccessClient(authContext.context, workItem.client_id)) {
      return NextResponse.json({ error: "Work item tidak ditemukan." }, { status: 404 });
    }

    const { searchParams } = request.nextUrl;
    const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
    const limit = Math.min(
      100,
      Math.max(1, parseInt(searchParams.get("limit") ?? "50", 10))
    );
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    // 1. Ambil audit logs untuk entity_type='work_item' OR entity_type='assignment'
    //    yang berhubungan dengan work_item ini
    const auditResult = await admin
      .from("audit_logs")
      .select(
        "id, actor_id, action, entity_type, entity_id, old_value, new_value, metadata, created_at",
        { count: "exact" }
      )
      .eq("organization_id", organizationId)
      .or(`and(entity_type.eq.work_item,entity_id.eq.${id}),and(entity_type.eq.assignment,metadata->>work_item_id.eq.${id})`)
      .order("created_at", { ascending: false })
      .range(from, to);

    const { data: auditRows, error: auditError, count } = auditResult as unknown as {
      data: Array<{
        id: string;
        actor_id: string | null;
        action: string;
        entity_type: string;
        entity_id: string;
        old_value: unknown;
        new_value: unknown;
        metadata: unknown;
        created_at: string;
      }> | null;
      error: { message: string; code: string; hint: string; details: string } | null;
      count: number | null;
    };

    if (auditError) {
      console.error("[GET /history] Supabase error:", {
        message: auditError.message,
        code: auditError.code,
        hint: auditError.hint,
        details: auditError.details,
      });
      return NextResponse.json(
        { error: "Gagal mengambil audit trail." },
        { status: 500 }
      );
    }

    // 2. Batch lookup actor names dari profiles
    const rows = auditRows ?? [];
    const actorIds = [
      ...new Set(
        rows
          .map((r) => r.actor_id)
          .filter((actorId): actorId is string => Boolean(actorId))
      ),
    ];

    let actorMap: Record<string, string> = {};
    if (actorIds.length > 0) {
      const profilesResult = await admin
        .from("profiles")
        .select("id, display_name")
        .in("id", actorIds);

      const { data: profiles } = profilesResult as unknown as {
        data: Array<{ id: string; display_name: string | null }> | null;
      };

      if (profiles) {
        actorMap = Object.fromEntries(
          profiles.map((p) => [p.id, p.display_name ?? "Unknown"])
        );
      }
    }

    const enrichedHistory = rows.map((r) => ({
      ...r,
      actor_name: r.actor_id ? (actorMap[r.actor_id] ?? null) : "System",
    }));

    return NextResponse.json({
      data: enrichedHistory,
      total: count ?? 0,
      page,
      limit,
    });
  } catch (err) {
    console.error("[GET /history] Unexpected error:", err);
    return NextResponse.json(
      { error: "Terjadi kesalahan server." },
      { status: 500 }
    );
  }
}
