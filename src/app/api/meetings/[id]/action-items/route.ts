import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/authorization";

type Context = { params: Promise<{ id: string }> };

export async function GET(_: Request, context: Context) {
  const auth = await getAuthContext();
  if (auth.response) return auth.response;
  const { id } = await context.params;
  const result = await auth.context.admin.from("ai_draft_items").select("id, title, description, type, client_id, maker_id, maker_name, due_at, confidence, clarification_needed, clarification_question, status, source_context, confirmed_work_item_id, created_at").eq("meeting_id", id).eq("organization_id", auth.context.organizationId).is("deleted_at", null).order("created_at", { ascending: true });
  const data = result as unknown as { data: unknown[] | null; error: { message: string } | null };
  if (data.error) return NextResponse.json({ error: "Gagal memuat action item meeting." }, { status: 500 });
  return NextResponse.json({ data: data.data ?? [] });
}
