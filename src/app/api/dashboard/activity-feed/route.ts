import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/authorization";
import { createServiceRoleClient } from "@/lib/supabase/server";

export async function GET() {
  const auth = await getAuthContext();
  if (auth.response) return auth.response;
  const { admin, organizationId, isOrgWide, clientIds } = auth.context;

  const logsQuery = admin
    .from("audit_logs")
    .select("id, action, entity_type, entity_id, created_at, actor_id")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })
    .limit(100);
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

  const visibleLogs = logs ?? [];
  if (!isOrgWide && visibleLogs.length) {
    const workItemIds = visibleLogs.filter((log) => log.entity_type === "work_item").map((log) => log.entity_id);
    const projectIds = visibleLogs.filter((log) => log.entity_type === "project").map((log) => log.entity_id);
    const meetingIds = visibleLogs.filter((log) => log.entity_type === "meeting").map((log) => log.entity_id);
    const groupIds = visibleLogs.filter((log) => log.entity_type === "wa_group").map((log) => log.entity_id);
    const [workItems, projects, meetings, groups] = await Promise.all([
      workItemIds.length ? admin.from("work_items").select("id").in("id", workItemIds).in("client_id", clientIds) : Promise.resolve({ data: [] }),
      projectIds.length ? admin.from("projects").select("id, work_items!inner(client_id)").in("id", projectIds).in("work_items.client_id", clientIds) : Promise.resolve({ data: [] }),
      meetingIds.length ? admin.from("meetings").select("id").in("id", meetingIds).in("client_id", clientIds) : Promise.resolve({ data: [] }),
      groupIds.length ? admin.from("wa_groups").select("id").in("id", groupIds).in("client_id", clientIds) : Promise.resolve({ data: [] }),
    ]);
    const allowed = new Set<string>([
      ...((workItems.data ?? []) as { id: string }[]).map((item) => `work_item:${item.id}`),
      ...((projects.data ?? []) as { id: string }[]).map((item) => `project:${item.id}`),
      ...((meetings.data ?? []) as { id: string }[]).map((item) => `meeting:${item.id}`),
      ...((groups.data ?? []) as { id: string }[]).map((item) => `wa_group:${item.id}`),
    ]);
    return NextResponse.json(await formatVisibleLogs(visibleLogs.filter((log) => allowed.has(`${log.entity_type}:${log.entity_id}`)), admin));
  }

  return NextResponse.json(await formatVisibleLogs(visibleLogs, admin));
}

async function formatVisibleLogs(visibleLogs: {
  id: string;
  action: string;
  entity_type: string;
  entity_id: string;
  created_at: string;
  actor_id: string | null;
}[], admin: ReturnType<typeof createServiceRoleClient>) {
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

  return result;
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
