import { NextResponse } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";

/**
 * GET /api/dashboard/activity-feed
 * Returns last 10 audit log entries for the organization.
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

  // Get user's organization_id
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
    return NextResponse.json([]);
  }

  // Fetch recent audit logs
  const { data: logs } = (await admin
    .from("audit_logs")
    .select("id, action, entity_type, entity_id, created_at, actor_id")
    .eq("organization_id", orgId)
    .order("created_at", { ascending: false })
    .limit(10)) as unknown as {
    data: {
      id: string;
      action: string;
      entity_type: string;
      entity_id: string;
      created_at: string;
      actor_id: string | null;
    }[];
  };

  // Fetch actor names
  const actorIds = [
    ...new Set(
      (logs ?? []).map((l) => l.actor_id).filter(Boolean)
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

  const result = (logs ?? []).map((log) => {
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
