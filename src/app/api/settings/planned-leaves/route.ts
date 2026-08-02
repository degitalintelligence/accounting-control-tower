import { NextRequest, NextResponse } from "next/server";
import { getAuthContext, hasPermission } from "@/lib/authorization";
import type { AuthContext } from "@/lib/authorization";
import { plannedLeaveCreateSchema, validationMessage } from "@/lib/validation/schemas";

async function canAccessProfile(admin: AuthContext["admin"], organizationId: string, profileId: string, isOrgWide: boolean, clientIds: string[]) {
  const membership = await admin.from("memberships").select("profile_id, client_id").eq("organization_id", organizationId).eq("profile_id", profileId).eq("is_active", true);
  const rows = (membership.data ?? []) as Array<{ profile_id: string; client_id: string | null }>;
  return rows.length > 0 && (isOrgWide || rows.some((row) => row.client_id === null || clientIds.includes(row.client_id)));
}

export async function GET(request: NextRequest) {
  const auth = await getAuthContext();
  if (auth.response) return auth.response;
  const { admin, organizationId, userId, isOrgWide, clientIds } = auth.context;
  const canManage = await hasPermission(auth.context, "planned_leaves.manage");
  const profileId = request.nextUrl.searchParams.get("profile_id");
  const status = request.nextUrl.searchParams.get("status");
  let query = admin.from("planned_leaves").select("id, organization_id, profile_id, start_date, end_date, status, reason, rejection_reason, created_by, approved_by, approved_at, created_at, updated_at").eq("organization_id", organizationId).is("deleted_at", null).order("start_date", { ascending: true });
  if (profileId) query = query.eq("profile_id", profileId);
  if (status) { if (!["pending", "approved", "rejected", "cancelled"].includes(status)) return NextResponse.json({ error: "Parameter status tidak valid." }, { status: 400 }); query = query.eq("status", status); }
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: "Planned leave gagal dimuat." }, { status: 500 });
  const rows = (data ?? []) as Array<{ profile_id: string; created_by: string } & Record<string, unknown>>;
  const visible = [];
  for (const row of rows) {
    if (row.profile_id !== userId && !(await canAccessProfile(admin, organizationId, row.profile_id, isOrgWide, clientIds))) continue;
    visible.push({ ...row, can_edit: row.created_by === userId || canManage, can_approve: canManage, can_cancel: row.created_by === userId || canManage });
  }
  return NextResponse.json({ data: visible });
}

export async function POST(request: NextRequest) {
  const auth = await getAuthContext();
  if (auth.response) return auth.response;
  const { admin, organizationId, userId, isOrgWide, clientIds } = auth.context;
  const parsed = plannedLeaveCreateSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: validationMessage(parsed.error) }, { status: 400 });
  const { profile_id, start_date, end_date, reason } = parsed.data;
  if (profile_id !== userId && !(await hasPermission(auth.context, "planned_leaves.manage"))) return NextResponse.json({ error: "Tidak dapat membuat leave untuk user lain." }, { status: 403 });
  if (start_date > end_date || !(await canAccessProfile(admin, organizationId, profile_id, isOrgWide, clientIds))) return NextResponse.json({ error: "Profile atau periode planned leave tidak valid." }, { status: 400 });
  const conflicts = await admin.from("planned_leaves").select("id, start_date, end_date, status").eq("organization_id", organizationId).eq("profile_id", profile_id).in("status", ["pending", "approved"]).is("deleted_at", null).lte("start_date", end_date).gte("end_date", start_date);
  if (conflicts.error) return NextResponse.json({ error: "Validasi planned leave gagal." }, { status: 500 });
  if (conflicts.data?.length) return NextResponse.json({ error: "Planned leave bertabrakan dengan leave yang sudah ada.", code: "PLANNED_LEAVE_OVERLAP", conflicts: conflicts.data }, { status: 409 });
  const created = await admin.from("planned_leaves").insert({ organization_id: organizationId, profile_id, start_date, end_date, reason: reason ?? null, created_by: userId } as never).select("id, organization_id, profile_id, start_date, end_date, status, reason, rejection_reason, created_by, approved_by, approved_at, created_at, updated_at").single();
  if (created.error) return NextResponse.json({ error: "Planned leave gagal dibuat." }, { status: 500 });
  return NextResponse.json({ data: created.data }, { status: 201 });
}
