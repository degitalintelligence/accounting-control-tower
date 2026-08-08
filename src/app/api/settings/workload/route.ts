import { NextRequest, NextResponse } from "next/server";
import { getAuthContext, requirePermission } from "@/lib/authorization";

export async function GET(request: NextRequest) {
  const auth = await getAuthContext();
  if (auth.response) return auth.response;
  const denied = await requirePermission(auth.context, "planned_leaves.view");
  if (denied) return denied;
  const { admin, organizationId, isOrgWide, clientIds } = auth.context;
  const clientId = request.nextUrl.searchParams.get("client_id");
  if (clientId && !isOrgWide && !clientIds.includes(clientId)) return NextResponse.json({ error: "Client tidak berada dalam scope akses user." }, { status: 403 });
  let query = admin.from("work_items").select("id, title, status, priority, due_at, client_id, assignments(profile_id, role)").eq("organization_id", organizationId).is("deleted_at", null);
  if (clientId) query = query.eq("client_id", clientId);
  else if (!isOrgWide) query = query.in("client_id", clientIds);
  const { data: items, error } = await query;
  if (error) return NextResponse.json({ error: "Beban kerja gagal dimuat." }, { status: 500 });
  const grouped = new Map<string, { profile_id: string; total: number; active: number; overdue: number; items: typeof items }>();
  for (const item of (items ?? []) as Array<{ assignments?: Array<{ profile_id: string }> ; due_at: string | null; status: string }>) {
    for (const assignment of item.assignments ?? []) {
      const current = grouped.get(assignment.profile_id) ?? { profile_id: assignment.profile_id, total: 0, active: 0, overdue: 0, items: [] };
      current.total += 1;
      if (!["completed", "cancelled"].includes(item.status)) current.active += 1;
      if (item.due_at && new Date(item.due_at) < new Date() && !["completed", "cancelled"].includes(item.status)) current.overdue += 1;
      current.items.push(item as never);
      grouped.set(assignment.profile_id, current);
    }
  }
  const ids = [...grouped.keys()];
  const profileResult = ids.length ? await admin.from("profiles").select("id, display_name, email, capacity_hours_per_week, max_active_work_items, workload_timezone").in("id", ids) : { data: [] };
  const profiles = (profileResult.data ?? []) as unknown as Array<{ id: string; display_name: string; email: string | null; capacity_hours_per_week: number; max_active_work_items: number; workload_timezone: string }>;
  const leaveResult = ids.length ? await admin.from("planned_leaves").select("id, profile_id, start_date, end_date, status").eq("organization_id", organizationId).in("profile_id", ids).in("status", ["pending", "approved"]).is("deleted_at", null).gte("end_date", new Date().toISOString().slice(0, 10)) : { data: [] };
  const leaves = (leaveResult.data ?? []) as unknown as Array<{ id: string; profile_id: string; start_date: string; end_date: string; status: string }>;
  return NextResponse.json({ data: [...grouped.values()].map((entry) => {
    const profile = profiles.find((item) => item.id === entry.profile_id) ?? null;
    const capacity = profile?.max_active_work_items ?? 0;
    const profileLeaves = leaves.filter((leave) => leave.profile_id === entry.profile_id).sort((a, b) => a.start_date.localeCompare(b.start_date));
    const today = new Date().toISOString().slice(0, 10);
    return { ...entry, profile, capacity_utilization: capacity ? Math.round((entry.active / capacity) * 100) : null, over_capacity: capacity > 0 && entry.active > capacity, availability: { is_on_leave_now: profileLeaves.some((leave) => leave.status === "approved" && leave.start_date <= today && leave.end_date >= today), next_leave_start: profileLeaves[0]?.start_date ?? null, next_leave_end: profileLeaves[0]?.end_date ?? null } };
  }) });
}
