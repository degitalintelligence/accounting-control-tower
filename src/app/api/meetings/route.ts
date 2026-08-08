import { NextRequest, NextResponse } from "next/server";
import { getAuthContext, canAccessOptionalClient, requirePermission } from "@/lib/authorization";

export async function GET() {
  const auth = await getAuthContext();
  if (auth.response) return auth.response;
  const denied = await requirePermission(auth.context, "work_items.view");
  if (denied) return denied;
  let query = auth.context.admin.from("meetings").select("id, title, meeting_at, status, summary, notes, attendance, discussion, action_items, blockers, next_steps, parsed_at, client_id, project_id, created_at").eq("organization_id", auth.context.organizationId).is("deleted_at", null).order("meeting_at", { ascending: false }).limit(50);
  if (!auth.context.isOrgWide) query = query.in("client_id", auth.context.clientIds);
  const result = await query;
  const data = result as unknown as { data: unknown[] | null; error: { message: string } | null };
  if (data.error) return NextResponse.json({ error: "Gagal memuat meeting." }, { status: 500 });
  return NextResponse.json({ data: data.data ?? [] });
}

export async function POST(request: NextRequest) {
  const auth = await getAuthContext();
  if (auth.response) return auth.response;
  const denied = await requirePermission(auth.context, "work_items.create");
  if (denied) return denied;
  const body = await request.json() as { draft_key?: string; title?: string; notes?: string; meeting_at?: string; client_id?: string; project_id?: string; attendance?: string; discussion?: string; action_items?: string; blockers?: string; next_steps?: string };
  if (!body.title?.trim()) return NextResponse.json({ error: "Judul meeting wajib diisi." }, { status: 400 });
  if (body.draft_key) {
    const existing = await auth.context.admin.from("meetings").select("id, title, meeting_at, status, summary, notes, attendance, discussion, action_items, blockers, next_steps, project_id, client_id, created_at, updated_at").eq("organization_id", auth.context.organizationId).eq("created_by", auth.context.userId).eq("draft_key", body.draft_key).is("deleted_at", null).maybeSingle();
    if (existing.data) return NextResponse.json({ data: existing.data }, { status: 200 });
  }
  if (!canAccessOptionalClient(auth.context, body.client_id)) return NextResponse.json({ error: "Client tidak berada dalam scope akses user." }, { status: 403 });
  if (body.project_id) { const project = await auth.context.admin.from("projects").select("id, work_items!inner(client_id, organization_id, deleted_at)").eq("id", body.project_id).eq("work_items.organization_id", auth.context.organizationId).eq("work_items.client_id", body.client_id ?? "").is("work_items.deleted_at", null).maybeSingle(); if (!project.data) return NextResponse.json({ error: "Project tidak valid untuk client yang dipilih." }, { status: 400 }); }
  const result = await auth.context.admin.from("meetings").insert({ organization_id: auth.context.organizationId, created_by: auth.context.userId, draft_key: body.draft_key || null, client_id: body.client_id || null, project_id: body.project_id || null, title: body.title.trim(), notes: (body.notes ?? "").slice(0, 50000), meeting_at: body.meeting_at || null, attendance: body.attendance ?? "", discussion: body.discussion ?? "", action_items: body.action_items ?? "", blockers: body.blockers ?? "", next_steps: body.next_steps ?? "", status: "draft" } as never).select("id, title, meeting_at, status, summary, notes, attendance, discussion, action_items, blockers, next_steps, project_id, client_id, created_at, updated_at").single();
  const data = result as unknown as { data: { id: string } | null; error: { message: string } | null };
  if (data.error || !data.data) return NextResponse.json({ error: "Gagal menyimpan meeting." }, { status: 500 });
  return NextResponse.json({ data: data.data }, { status: 201 });
}
