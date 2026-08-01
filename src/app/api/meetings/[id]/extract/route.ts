import { NextResponse } from "next/server";
import { getAuthContext, canAccessOptionalClient } from "@/lib/authorization";
import { extractTasksFromMessage } from "@/lib/ai/openrouter-client";

type Context = { params: Promise<{ id: string }> };
export async function POST(_: Request, context: Context) {
  const auth = await getAuthContext();
  if (auth.response) return auth.response;
  const { id } = await context.params;
  let meetingQuery = auth.context.admin.from("meetings").select("id, notes, attendance, discussion, action_items, blockers, next_steps, client_id").eq("id", id).eq("organization_id", auth.context.organizationId).is("deleted_at", null);
  if (!auth.context.isOrgWide) meetingQuery = meetingQuery.in("client_id", auth.context.clientIds);
  const meeting = await meetingQuery.single();
  const meetingData = meeting as unknown as { data: { id: string; notes: string; attendance: string; discussion: string; action_items: string; blockers: string; next_steps: string; client_id: string | null } | null; error: { message: string } | null };
  if (meetingData.error || !meetingData.data) return NextResponse.json({ error: "Meeting tidak ditemukan." }, { status: 404 });
  if (!canAccessOptionalClient(auth.context, meetingData.data.client_id)) return NextResponse.json({ error: "Meeting tidak berada dalam scope akses user." }, { status: 403 });
  const parsedCheck = await auth.context.admin.from("meetings").select("parsed_at").eq("id", id).eq("organization_id", auth.context.organizationId).single();
  const parsedData = parsedCheck as unknown as { data: { parsed_at: string | null } | null; error: { message: string } | null };
  if (parsedData.data?.parsed_at) return NextResponse.json({ error: "Meeting ini sudah pernah diparse. Untuk mencegah double task, parsing ulang tidak tersedia." }, { status: 409 });
  try {
    await auth.context.admin.from("ai_draft_items").update({ deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() } as never).eq("meeting_id", id).eq("organization_id", auth.context.organizationId).eq("status", "draft");
    const attachments = await auth.context.admin.from("meeting_attachments").select("file_name, source_text").eq("meeting_id", id).eq("organization_id", auth.context.organizationId).is("deleted_at", null).order("created_at", { ascending: true });
    const attachmentData = attachments.data as { file_name: string; source_text: string }[] | null;
    const source = [
      `Attendance:\n${meetingData.data.attendance}`,
      `Discussion:\n${meetingData.data.discussion}`,
      `Action:\n${meetingData.data.action_items}`,
      `Blocker:\n${meetingData.data.blockers}`,
      `Next step:\n${meetingData.data.next_steps}`,
      meetingData.data.notes,
      ...(attachmentData ?? []).map((attachment) => `Lampiran ${attachment.file_name}:\n${attachment.source_text}`),
    ].filter(Boolean).join("\n\n").slice(0, 100000);
    const extraction = await extractTasksFromMessage(source);
    const rows = extraction.tasks.map((task) => ({ organization_id: auth.context.organizationId, meeting_id: id, title: task.title, description: task.source_context, type: task.type, client_id: meetingData.data!.client_id, maker_name: task.maker_name, due_at: task.due_date ? `${task.due_date}T23:59:59.000Z` : null, source_context: task.source_context, confidence: task.confidence, clarification_needed: !task.maker_name, clarification_question: task.maker_name ? null : "Siapa PIC untuk action item ini?", status: "draft", created_by: auth.context.userId }));
    const drafts = rows.length ? await auth.context.admin.from("ai_draft_items").insert(rows as never).select("id, title, type, maker_name, due_at, confidence, clarification_needed, clarification_question, status") : { data: [], error: null };
    const draftData = drafts as unknown as { data: unknown[] | null; error: { message: string } | null };
    if (draftData.error) throw new Error(draftData.error.message);
    await auth.context.admin.from("meetings").update({ status: "draft", parsed_at: new Date().toISOString(), summary: `Ditemukan ${rows.length} action item oleh AI`, updated_at: new Date().toISOString() } as never).eq("id", id).eq("organization_id", auth.context.organizationId).is("deleted_at", null);
    return NextResponse.json({ data: { drafts: draftData.data ?? [], classification: extraction.classification } });
  } catch { return NextResponse.json({ error: "AI belum dapat memproses notulen." }, { status: 503 }); }
}
