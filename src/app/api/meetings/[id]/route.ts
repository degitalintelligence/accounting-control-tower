import { NextResponse } from "next/server";
import { canAccessOptionalClient, getAuthContext } from "@/lib/authorization";

type Context = { params: Promise<{ id: string }> };

export async function GET(_: Request, context: Context) {
  const auth = await getAuthContext();
  if (auth.response) return auth.response;
  const { id } = await context.params;
  let meetingQuery = auth.context.admin.from("meetings").select("id, title, meeting_at, status, summary, notes, attendance, discussion, action_items, blockers, next_steps, parsed_at, decisions, client_id, project_id, created_at, updated_at").eq("id", id).eq("organization_id", auth.context.organizationId).is("deleted_at", null);
  if (!auth.context.isOrgWide) meetingQuery = meetingQuery.in("client_id", auth.context.clientIds);
  const meeting = await meetingQuery.single();
  const meetingData = meeting as unknown as { data: unknown | null; error: { message: string } | null };
  if (meetingData.error || !meetingData.data) return NextResponse.json({ error: "Meeting tidak ditemukan." }, { status: 404 });
  return NextResponse.json({ data: meetingData.data });
}

export async function PATCH(request: Request, context: Context) {
  const auth = await getAuthContext();
  if (auth.response) return auth.response;
  const { id } = await context.params;
  const body = await request.json() as { title?: string; meeting_at?: string | null; client_id?: string | null; project_id?: string | null; attendance?: string; discussion?: string; action_items?: string; blockers?: string; next_steps?: string; notes?: string };
  if (body.title !== undefined && !body.title.trim()) return NextResponse.json({ error: "Judul meeting wajib diisi." }, { status: 400 });
  if (body.client_id !== undefined && !canAccessOptionalClient(auth.context, body.client_id)) return NextResponse.json({ error: "Client tidak berada dalam scope akses user." }, { status: 403 });
  if (body.project_id && !body.client_id) return NextResponse.json({ error: "Project membutuhkan client." }, { status: 400 });
  if (body.project_id) {
    const project = await auth.context.admin.from("projects").select("id, work_items!inner(client_id, organization_id, deleted_at)").eq("id", body.project_id).eq("work_items.organization_id", auth.context.organizationId).eq("work_items.client_id", body.client_id as string).is("work_items.deleted_at", null).maybeSingle();
    if (!project.data) return NextResponse.json({ error: "Project tidak valid untuk client yang dipilih." }, { status: 400 });
  }
  let currentQuery = auth.context.admin.from("meetings").select("id, client_id").eq("id", id).eq("organization_id", auth.context.organizationId).is("deleted_at", null);
  if (!auth.context.isOrgWide) currentQuery = currentQuery.in("client_id", auth.context.clientIds);
  const current = await currentQuery.maybeSingle();
  if (!current.data) return NextResponse.json({ error: "Meeting tidak ditemukan." }, { status: 404 });
  if (!canAccessOptionalClient(auth.context, (current.data as { client_id: string | null }).client_id)) return NextResponse.json({ error: "Meeting tidak berada dalam scope akses user." }, { status: 403 });
  const update = Object.fromEntries(Object.entries({ title: body.title?.trim(), meeting_at: body.meeting_at, client_id: body.client_id, project_id: body.project_id, attendance: body.attendance, discussion: body.discussion, action_items: body.action_items, blockers: body.blockers, next_steps: body.next_steps, notes: body.notes, updated_at: new Date().toISOString() }).filter(([, value]) => value !== undefined)) as never;
  const result = await auth.context.admin.from("meetings").update(update).eq("id", id).eq("organization_id", auth.context.organizationId).is("deleted_at", null).select("id, title, meeting_at, status, summary, notes, attendance, discussion, action_items, blockers, next_steps, parsed_at, decisions, client_id, project_id, created_at, updated_at").single();
  if (result.error) return NextResponse.json({ error: "Gagal memperbarui meeting." }, { status: 500 });
  return NextResponse.json({ data: result.data });
}

export async function DELETE(_: Request, context: Context) {
  const auth = await getAuthContext();
  if (auth.response) return auth.response;
  const { id } = await context.params;
  let currentQuery = auth.context.admin.from("meetings").select("id, status, client_id").eq("id", id).eq("organization_id", auth.context.organizationId).is("deleted_at", null);
  if (!auth.context.isOrgWide) currentQuery = currentQuery.in("client_id", auth.context.clientIds);
  const current = await currentQuery.maybeSingle();
  if (!current.data) return NextResponse.json({ error: "Meeting tidak ditemukan." }, { status: 404 });
  const meeting = current.data as { id: string; status: string; client_id: string | null };
  if (!canAccessOptionalClient(auth.context, meeting.client_id)) return NextResponse.json({ error: "Meeting tidak berada dalam scope akses user." }, { status: 403 });
  if (meeting.status !== "draft") return NextResponse.json({ error: "Hanya meeting berstatus draft yang dapat dihapus." }, { status: 409 });
  const result = await auth.context.admin.from("meetings").update({ deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() } as never).eq("id", id).eq("organization_id", auth.context.organizationId).eq("status", "draft").is("deleted_at", null);
  if (result.error) return NextResponse.json({ error: "Gagal menghapus meeting." }, { status: 500 });
  return NextResponse.json({ message: "Meeting berhasil dihapus." });
}
