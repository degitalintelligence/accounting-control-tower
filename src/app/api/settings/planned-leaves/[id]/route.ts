import { NextRequest, NextResponse } from "next/server";
import { getAuthContext, hasPermission, requirePermission } from "@/lib/authorization";
import { plannedLeaveRejectSchema, plannedLeaveUpdateSchema, validationMessage } from "@/lib/validation/schemas";

type Context = { params: Promise<{ id: string }> };
export async function PATCH(request: NextRequest, context: Context) {
  const auth = await getAuthContext(); if (auth.response) return auth.response;
  const { id } = await context.params; const { admin, organizationId, userId } = auth.context;
  const parsed = plannedLeaveUpdateSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: validationMessage(parsed.error) }, { status: 400 });
  const existingResult = await admin.from("planned_leaves").select("id, profile_id, created_by, status").eq("id", id).eq("organization_id", organizationId).is("deleted_at", null).maybeSingle();
  const existing = existingResult as unknown as { data: { id: string; profile_id: string; created_by: string; status: string } | null; error: { message: string } | null };
  if (!existing.data) return NextResponse.json({ error: "Planned leave tidak ditemukan." }, { status: 404 });
  if (!["pending", "rejected"].includes(existing.data.status)) return NextResponse.json({ error: "Approved leave tidak dapat diedit langsung.", code: "INVALID_PLANNED_LEAVE_TRANSITION" }, { status: 409 });
  if (existing.data.created_by !== userId && !(await hasPermission(auth.context, "planned_leaves.manage"))) return NextResponse.json({ error: "Tidak memiliki akses." }, { status: 403 });
  const update = { ...parsed.data, status: existing.data.status === "rejected" ? "pending" : existing.data.status, rejection_reason: null, updated_at: new Date().toISOString() };
  if (update.start_date && update.end_date && update.start_date > update.end_date) return NextResponse.json({ error: "Periode planned leave tidak valid." }, { status: 400 });
  const result = await admin.from("planned_leaves").update(update as never).eq("id", id).eq("organization_id", organizationId).select("id, organization_id, profile_id, start_date, end_date, status, reason, rejection_reason, created_by, approved_by, approved_at, created_at, updated_at").single();
  if (result.error) return NextResponse.json({ error: "Planned leave gagal diperbarui." }, { status: 500 });
  return NextResponse.json({ data: result.data });
}

export async function DELETE(request: NextRequest, context: Context) {
  const auth = await getAuthContext(); if (auth.response) return auth.response;
  const { id } = await context.params; const { admin, organizationId, userId } = auth.context;
  const existingResult = await admin.from("planned_leaves").select("id, created_by, status").eq("id", id).eq("organization_id", organizationId).is("deleted_at", null).maybeSingle();
  const existing = existingResult as unknown as { data: { id: string; created_by: string; status: string } | null; error: { message: string } | null };
  if (!existing.data) return NextResponse.json({ error: "Planned leave tidak ditemukan." }, { status: 404 });
  if (existing.data.created_by !== userId && !(await hasPermission(auth.context, "planned_leaves.manage"))) return NextResponse.json({ error: "Tidak memiliki akses." }, { status: 403 });
  const body = existing.data.status === "approved" ? await request.json().catch(() => ({})) as { reason?: string } : {};
  if (existing.data.status === "approved" && !body.reason?.trim()) return NextResponse.json({ error: "Alasan pembatalan leave approved wajib diisi." }, { status: 400 });
  const result = await admin.rpc("cancel_planned_leave", { p_leave_id: id, p_actor_id: userId, p_reason: body.reason ?? null } as never);
  if (result.error) return NextResponse.json({ error: result.error.message }, { status: 409 });
  return NextResponse.json({ data: result.data });
}

export async function POST(request: NextRequest, context: Context) {
  const auth = await getAuthContext(); if (auth.response) return auth.response;
  const { id } = await context.params; const { admin, userId } = auth.context;
  const denied = await requirePermission(auth.context, "planned_leaves.approve");
  if (denied) return denied;
  const action = request.nextUrl.searchParams.get("action");
  const args = { p_leave_id: id, p_actor_id: userId };
  if (action === "approve") { const result = await admin.rpc("approve_planned_leave", args as never); if (result.error) return NextResponse.json({ error: result.error.message, code: result.error.message }, { status: 409 }); return NextResponse.json({ data: result.data }); }
  if (action === "reject") { const parsed = plannedLeaveRejectSchema.safeParse(await request.json()); if (!parsed.success) return NextResponse.json({ error: validationMessage(parsed.error) }, { status: 400 }); const result = await admin.rpc("reject_planned_leave", { ...args, p_reason: parsed.data.reason } as never); if (result.error) return NextResponse.json({ error: result.error.message }, { status: 409 }); return NextResponse.json({ data: result.data }); }
  return NextResponse.json({ error: "Action planned leave tidak valid." }, { status: 400 });
}
