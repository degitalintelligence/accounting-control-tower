import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/authorization";

/**
 * GET /api/dashboard/activity-feed
 * Returns last 10 audit log entries for the organization.
 */
export async function GET() {
  const auth = await getAuthContext();
  if (auth.response) return auth.response;
  const { admin, organizationId, isOrgWide, clientIds } = auth.context;

  // Fetch recent audit logs
  const logsQuery = admin
    .from("audit_logs")
    .select("id, action, entity_type, entity_id, created_at, actor_id")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })
    .limit(10);
  if (!isOrgWide) {
    const scopedItems = await admin.from("work_items").select("id").eq("organization_id", organizationId).in("client_id", clientIds);
    const ids = ((scopedItems.data ?? []) as { id: string }[]).map((item) => item.id);
    if (!ids.length) return NextResponse.json([]);
  }
  const { data: logs } = (await logsQuery) as unknown as {
    data: {
      id: string;
      action: string;
      entity_type: string;
      entity_id: string;
      created_at: string;
      actor_id: string | null;
    }[];
  };

  const scopedEntityIds = [...new Set((logs ?? []).filter((log) => log.entity_type === "work_item").map((log) => log.entity_id))];
  let allowedEntityIds = scopedEntityIds;
  if (!isOrgWide && scopedEntityIds.length) {
    const scopedItems = await admin.from("work_items").select("id").in("id", scopedEntityIds).in("client_id", clientIds);
    allowedEntityIds = ((scopedItems.data ?? []) as { id: string }[]).map((item) => item.id);
  }
  const visibleLogs = (logs ?? []).filter((log) => log.entity_type !== "work_item" || allowedEntityIds.includes(log.entity_id));

  // Fetch actor names
  const actorIds = [
    ...new Set(
      visibleLogs.map((l) => l.actor_id).filter(Boolean)
    ),
  ] as string[];

  const actorMap: Record<string, string> = {};
  if (actorIds.length > 0) {
    const { data: profiles } = (await admin
      .from("profiles")
      .select("id, display_name")
      .in("id", actorIds)) as unknown as {
      data: { id: string; display_name: string }[];
    };

    for (const p of profiles ?? []) {
      actorMap[p.id] = p.display_name;
    }
  }

  const result = visibleLogs.map((log) => {
    const timeAgo = getTimeAgo(log.created_at);
    const actorName = log.actor_id
      ? actorMap[log.actor_id] ?? "System"
      : "System";

    return {
      id: log.id,
      action: log.action,
      entity_type: log.entity_type,
      entity_id: log.entity_id,
      actor_name: actorName,
      time_ago: timeAgo,
      created_at: log.created_at,
    };
  });

  return NextResponse.json(result);
}

function getTimeAgo(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMin < 1) return "Baru saja";
  if (diffMin < 60) return `${diffMin} menit lalu`;
  if (diffHours < 24) return `${diffHours} jam lalu`;
  if (diffDays === 1) return "Kemarin";
  return `${diffDays} hari lalu`;
}
