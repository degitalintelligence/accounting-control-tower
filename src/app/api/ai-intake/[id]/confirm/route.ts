import { NextRequest, NextResponse } from "next/server";
import { getAuthContext, canAccessClient, requirePermission } from "@/lib/authorization";

type Context = { params: Promise<{ id: string }> };
export async function POST(request: NextRequest, context: Context) {
  const auth = await getAuthContext();
  if (auth.response) return auth.response;
  const denied = await requirePermission(auth.context, "ai_review.decide");
  if (denied) return denied;
  const { id } = await context.params;
  const body = await request.json() as { title?: string; client_id?: string; maker_id?: string | null; due_at?: string | null; type?: string; description?: string | null };
  const draftResult = await auth.context.admin.from("ai_draft_items").select("id, title, description, type, client_id, maker_id, maker_name, due_at, status, deleted_at, meeting_id").eq("id", id).eq("organization_id", auth.context.organizationId).is("deleted_at", null).single();
  const draftData = draftResult as unknown as { data: { id: string; title: string; description: string | null; type: string; client_id: string | null; maker_id: string | null; maker_name: string | null; due_at: string | null; status: string; deleted_at: string | null; meeting_id: string | null } | null; error: { message: string } | null };
  if (draftData.error || !draftData.data) return NextResponse.json({ error: "Draft AI tidak ditemukan." }, { status: 404 });
  if (draftData.data.status !== "draft") return NextResponse.json({ error: "Draft ini sudah diproses." }, { status: 409 });
  if (!body.title || !body.client_id || !canAccessClient(auth.context, body.client_id)) return NextResponse.json({ error: "Judul dan client wajib diisi." }, { status: 400 });
  if (!(["routine", "project", "ad_hoc", "report"] as string[]).includes(body.type ?? "ad_hoc")) return NextResponse.json({ error: "Jenis task tidak valid." }, { status: 400 });
  const makerId = body.maker_id ?? null;
  if (makerId) {
    const memberResult = await auth.context.admin.from("memberships").select("profile_id, client_id").eq("organization_id", auth.context.organizationId).eq("profile_id", makerId).eq("is_active", true);
    const memberData = memberResult as unknown as { data: { profile_id: string; client_id: string | null }[] | null; error: { message: string } | null };
    if (memberData.error || !memberData.data?.some((member) => member.client_id === null || member.client_id === body.client_id)) return NextResponse.json({ error: "PIC tidak memiliki akses ke client yang dipilih." }, { status: 403 });
  }
  const result = await auth.context.admin.rpc("confirm_ai_draft_item" as never, { p_draft_id: id, p_organization_id: auth.context.organizationId, p_confirmed_by: auth.context.userId, p_client_id: body.client_id, p_title: body.title, p_type: body.type ?? "ad_hoc", p_description: body.description ?? null, p_due_at: body.due_at ?? null, p_maker_id: makerId, p_project_id: null } as never);
  const data = result as unknown as { data: { draft_id: string; work_item_id: string }[] | null; error: { message?: string; code?: string } | null };
  if (data.error || !data.data?.[0]) return NextResponse.json({ error: data.error?.code === "23505" ? "Draft ini sudah diproses." : "Gagal mengonfirmasi draft AI." }, { status: data.error?.code === "23505" ? 409 : 500 });
  return NextResponse.json({ data: { work_item_id: data.data[0].work_item_id } }, { status: 201 });
}
