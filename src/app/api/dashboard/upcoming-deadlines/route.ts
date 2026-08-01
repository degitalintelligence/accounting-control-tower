import { NextResponse } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";

/**
 * GET /api/dashboard/upcoming-deadlines
 * Returns top 5 work items with nearest due dates.
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

  // Fetch top 5 deadlines for all active workflow statuses.
  const { data: items } = (await admin
    .from("work_items")
    .select("id, title, type, priority, status, due_at, risk_level")
    .eq("organization_id", orgId)
    .is("deleted_at", null)
    .not("status", "in", "(completed,cancelled)")
    .not("due_at", "is", null)
    .order("due_at", { ascending: true })
    .limit(5)) as unknown as {
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
      .select("work_item_id, profile_id, profiles(display_name)")
      .in("work_item_id", itemIds)
      .eq("role", "assignee")
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
