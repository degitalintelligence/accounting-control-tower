import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/authorization";

type Profile = { display_name: string } | null;
type Assignment = { profile_id: string; role: string; profiles: Profile };
type WorkItem = {
  id: string;
  client_id: string;
  title: string;
  type: string;
  priority: string;
  status: string;
  risk_level: string;
  due_at: string | null;
  created_at: string;
  created_by: string | null;
  parent_id: string | null;
  progress_percent: number | null;
  health_flag: string | null;
  is_rollup_parent: boolean;
  assignments: Assignment[];
};

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return parts.length > 1
    ? `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
    : name.slice(0, 2).toUpperCase();
}

function statusLabel(status: string) {
  return status.replaceAll("_", " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function relativeTime(value: string) {
  const diff = Date.now() - new Date(value).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "Baru saja";
  if (minutes < 60) return `${minutes} menit lalu`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} jam lalu`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "Kemarin" : `${days} hari lalu`;
}

export async function GET() {
  const auth = await getAuthContext();
  if (auth.response) return auth.response;
  const { admin, organizationId, isOrgWide, clientIds } = auth.context;

  let query = admin
    .from("work_items")
    .select("id, client_id, title, type, priority, status, risk_level, due_at, created_at, created_by, parent_id, progress_percent, health_flag, is_rollup_parent, assignments:assignments(profile_id, role, profiles!assignments_profile_id_fkey(display_name))")
    .eq("organization_id", organizationId)
    .is("deleted_at", null)
    .order("due_at", { ascending: true, nullsFirst: false });
  if (!isOrgWide) query = query.in("client_id", clientIds);
  const result = await query.limit(250);
  const rows = result as unknown as { data: WorkItem[] | null; error: { message: string; code?: string; hint?: string; details?: string } | null };
  if (rows.error) {
    console.error("[GET /api/dashboard/sections] Supabase error:", {
      code: rows.error.code,
      message: rows.error.message,
      hint: rows.error.hint,
      details: rows.error.details,
      relationship: "assignments -> profiles",
    });
    return NextResponse.json({ error: "Gagal mengambil data dashboard." }, { status: 500 });
  }

  const items = (rows.data ?? []).filter((item) => isOrgWide || clientIds.includes(item.client_id));
  const now = Date.now();
  const active = items.filter((item) => !["completed", "cancelled", "draft"].includes(item.status));
  const actorIds = [...new Set(items.map((item) => item.created_by).filter((id): id is string => Boolean(id)))];
  const actorMap = new Map<string, string>();
  if (actorIds.length) {
    const profilesResult = await admin.from("profiles").select("id, display_name").in("id", actorIds);
    const profiles = profilesResult as unknown as { data: { id: string; display_name: string }[] | null };
    for (const profile of profiles.data ?? []) actorMap.set(profile.id, profile.display_name);
  }

  const exceptions = active
    .filter((item) => (item.due_at && new Date(item.due_at).getTime() < now) || ["blocked", "revision_required"].includes(item.status))
    .slice(0, 5)
    .map((item) => {
      const assignee = item.assignments.find((assignment) => assignment.role === "maker")?.profiles?.display_name ?? "Unassigned";
      const overdueDays = item.due_at ? Math.max(1, Math.ceil((now - new Date(item.due_at).getTime()) / 86400000)) : 0;
      const severity = item.status === "blocked" ? "blocked" : item.status === "revision_required" ? "warning" : "critical";
      return {
        id: item.id,
        severity,
        tag: severity === "blocked" ? "BLOCKED" : severity === "warning" ? "REVISION" : "CRITICAL",
        taskId: item.id.slice(0, 8).toUpperCase(),
        title: item.title,
        description: item.status === "blocked" ? "Menunggu pihak lain atau dependensi" : item.status === "revision_required" ? "Membutuhkan revisi dari maker" : `${overdueDays} hari overdue`,
        assignee,
        assigneeInitials: initials(assignee),
        actionLabel: severity === "blocked" ? "Follow up" : severity === "warning" ? "Inspect" : "Escalate",
      };
    });

  const reviews = items
    .filter((item) => item.status === "under_review")
    .slice(0, 5)
    .map((item) => {
      const submitter = item.created_by ? actorMap.get(item.created_by) ?? "Unknown" : "Unknown";
      const fileIcon = item.type === "report" ? "S" : item.type === "project" ? "P" : "X";
      const risk = item.risk_level === "critical" || item.risk_level === "high" ? "high" : item.risk_level === "medium" ? "medium" : "low";
      return { id: item.id, fileIcon, title: item.title, submitter, submitterInitials: initials(submitter), time: relativeTime(item.created_at), risk, riskLabel: risk === "high" ? "High Risk" : risk === "medium" ? "Needs Review" : "Low Risk" };
    });

  const childrenByParent = new Map<string, WorkItem[]>();
  for (const item of items) {
    if (!item.parent_id) continue;
    const children = childrenByParent.get(item.parent_id) ?? [];
    children.push(item);
    childrenByParent.set(item.parent_id, children);
  }
  const parents = items.filter((item) => item.is_rollup_parent || (!item.parent_id && childrenByParent.has(item.id))).slice(0, 5);
  const closing = parents.map((parent) => ({
    id: parent.id,
    name: parent.title,
    progress: Number(parent.progress_percent ?? 0),
    children: (childrenByParent.get(parent.id) ?? []).map((child) => {
      const assignee = child.assignments.find((assignment) => assignment.role === "maker")?.profiles?.display_name ?? "Unassigned";
      const checkStatus = child.status === "completed" || child.status === "approved" ? "done" : child.status === "blocked" || child.health_flag === "overdue" ? "danger" : "partial";
      return { id: child.id, name: child.title, assignee, assigneeInitials: initials(assignee), status: statusLabel(child.status), checkStatus, progress: Number(child.progress_percent ?? 0) };
    }),
  }));

  const completed = items.filter((item) => item.status === "completed").length;
  return NextResponse.json({ exceptions, reviews, closing, exceptionCount: exceptions.length, reviewCount: reviews.length, overallProgress: items.length ? Math.round((completed / items.length) * 100) : 0 });
}
