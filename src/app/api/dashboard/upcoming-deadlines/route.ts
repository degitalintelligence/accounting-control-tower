import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/authorization";

/**
 * GET /api/dashboard/upcoming-deadlines
 * Returns top 5 work items with nearest due dates.
 */
export async function GET() {
  const auth = await getAuthContext();
  if (auth.response) return auth.response;
  const { admin, organizationId, isOrgWide, clientIds } = auth.context;

  // Fetch top 5 deadlines for all active workflow statuses.
  let itemsQuery = admin
    .from("work_items")
    .select("id, title, type, priority, status, due_at, risk_level")
    .eq("organization_id", organizationId)
    .is("deleted_at", null)
    .not("status", "in", "(completed,cancelled)")
    .not("due_at", "is", null)
    .order("due_at", { ascending: true })
    .limit(5);
  if (!isOrgWide) itemsQuery = itemsQuery.in("client_id", clientIds);
  const { data: items } = (await itemsQuery) as unknown as {
    data: {
      id: string;
      title: string;
      type: string;
      priority: string;
      status: string;
      due_at: string;
      risk_level: string;
    }[];
  };

  // Fetch assignees for these items
  const itemIds = (items ?? []).map((i) => i.id);
  const assigneeMap: Record<string, { name: string; initials: string }> = {};

  if (itemIds.length > 0) {
    const { data: assignments } = (await admin
      .from("assignments")
      .select("work_item_id, profile_id, profiles!assignments_profile_id_fkey(display_name)")
      .in("work_item_id", itemIds)
      .eq("role", "maker")
      .is("unassigned_at", null)) as unknown as {
      data: {
        work_item_id: string;
        profile_id: string;
        profiles: { display_name: string } | null;
      }[];
    };

    for (const a of assignments ?? []) {
      if (!assigneeMap[a.work_item_id]) {
        const name = a.profiles?.display_name ?? "Unknown";
        const parts = name.split(" ");
        const initials =
          parts.length >= 2
            ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
            : name.slice(0, 2).toUpperCase();
        assigneeMap[a.work_item_id] = { name, initials };
      }
    }
  }

  const result = (items ?? []).map((item) => {
    const now = new Date();
    const due = new Date(item.due_at);
    const isOverdue = due < now;
    const diffMs = due.getTime() - now.getTime();
    const diffDays = Math.ceil(Math.abs(diffMs) / (1000 * 60 * 60 * 24));

    let dueLabel: string;
    if (isOverdue) {
      dueLabel = `${diffDays} hari overdue`;
    } else if (diffDays === 0) {
      dueLabel = "Hari ini";
    } else if (diffDays === 1) {
      dueLabel = "Besok";
    } else {
      dueLabel = `${diffDays} hari lagi`;
    }

    const assignee = assigneeMap[item.id];

    return {
      id: item.id,
      title: item.title,
      type: item.type,
      priority: item.priority,
      status: item.status,
      due_at: item.due_at,
      due_label: dueLabel,
      is_overdue: isOverdue,
      risk_level: item.risk_level,
      assignee_name: assignee?.name ?? "Unassigned",
      assignee_initials: assignee?.initials ?? "?",
    };
  });

  return NextResponse.json(result);
}
