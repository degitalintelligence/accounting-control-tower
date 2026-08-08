import { NextResponse } from "next/server";
import { canAccessOptionalClient, getAuthContext, requirePermission } from "@/lib/authorization";

type Context = { params: Promise<{ id: string }> };

export async function GET(_: Request, context: Context) {
  const auth = await getAuthContext();
  if (auth.response) return auth.response;
  const denied = await requirePermission(auth.context, "work_items.view");
  if (denied) return denied;
  const { id } = await context.params;
  const meetingResult = await auth.context.admin.from("meetings").select("client_id").eq("id", id).eq("organization_id", auth.context.organizationId).is("deleted_at", null).maybeSingle();
  const meeting = meetingResult as unknown as { data: { client_id: string | null } | null; error: { message: string } | null };
  if (meeting.error) return NextResponse.json({ error: "Gagal memuat meeting." }, { status: 500 });
  if (!meeting.data || !canAccessOptionalClient(auth.context, meeting.data.client_id)) return NextResponse.json({ error: "Meeting tidak ditemukan." }, { status: 404 });
  const result = await auth.context.admin.from("ai_draft_items").select("id, title, description, type, client_id, maker_id, maker_name, due_at, confidence, clarification_needed, clarification_question, status, source_context, confirmed_work_item_id, created_at").eq("meeting_id", id).eq("organization_id", auth.context.organizationId).is("deleted_at", null).order("created_at", { ascending: true });
  const data = result as unknown as { data: unknown[] | null; error: { message: string } | null };
  if (data.error) return NextResponse.json({ error: "Gagal memuat action item meeting." }, { status: 500 });
  return NextResponse.json({ data: data.data ?? [] });
}
