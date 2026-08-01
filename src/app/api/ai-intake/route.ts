import { NextRequest, NextResponse } from "next/server";
import { getAuthContext, canAccessOptionalClient } from "@/lib/authorization";
import { extractTextFromFile, isSupportedDocument, FileParserError } from "@/lib/ai/file-parser";

const MAX_TEXT = 50000;

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const auth = await getAuthContext();
  if (auth.response) return auth.response;
  const intakeId = request.nextUrl.searchParams.get("intake_id");
  if (intakeId) {
    const intakeResult = await auth.context.admin
      .from("ai_intake_items")
      .select("id, filename, mime_type, status, error_message, created_at, updated_at")
      .eq("id", intakeId)
      .eq("organization_id", auth.context.organizationId)
      .is("deleted_at", null)
      .maybeSingle();
    const intakeData = intakeResult as unknown as {
      data: { id: string; filename: string | null; mime_type: string | null; status: string; error_message: string | null; created_at: string; updated_at: string } | null;
      error: { message: string } | null;
    };
    if (intakeData.error) return NextResponse.json({ error: "Gagal memuat status intake AI." }, { status: 500 });
    if (!intakeData.data) return NextResponse.json({ error: "Intake AI tidak ditemukan." }, { status: 404 });
    const drafts = await auth.context.admin
      .from("ai_draft_items")
      .select("id, intake_id, title, description, type, client_id, maker_id, maker_name, due_at, confidence, clarification_needed, clarification_question, status, source_context, created_at")
      .eq("organization_id", auth.context.organizationId)
      .eq("intake_id", intakeId)
      .is("deleted_at", null)
      .is("meeting_id", null)
      .order("created_at", { ascending: false });
    const draftData = drafts as unknown as { data: unknown[] | null; error: { message: string } | null };
    if (draftData.error) return NextResponse.json({ error: "Gagal memuat draft AI." }, { status: 500 });
    return NextResponse.json({ data: draftData.data ?? [], intake: intakeData.data });
  }
  const result = await auth.context.admin.from("ai_draft_items").select("id, intake_id, title, description, type, client_id, maker_id, maker_name, due_at, confidence, clarification_needed, clarification_question, status, source_context, created_at").eq("organization_id", auth.context.organizationId).is("deleted_at", null).is("meeting_id", null).order("created_at", { ascending: false }).limit(100);
  const data = result as unknown as { data: unknown[] | null; error: { message: string } | null };
  if (data.error) return NextResponse.json({ error: "Gagal memuat draft AI." }, { status: 500 });
  const drafts = (data.data ?? []) as Record<string, unknown>[];
  const intakeIds = [...new Set(drafts.map((draft) => (draft as { intake_id?: string | null }).intake_id).filter((id): id is string => Boolean(id)))];
  const intakes = intakeIds.length ? await auth.context.admin.from("ai_intake_items").select("id, filename, mime_type, status, created_at").eq("organization_id", auth.context.organizationId).in("id", intakeIds) : { data: [] as { id: string; filename: string | null; mime_type: string | null; status: string; created_at: string }[] };
  const intakeRows = (intakes.data ?? []) as { id: string; filename: string | null; mime_type: string | null; status: string; created_at: string }[];
  const intakeMap = new Map(intakeRows.map((intake) => [intake.id, intake]));
  const response = NextResponse.json({ data: drafts.map((draft) => ({ ...draft, intake: intakeMap.get(typeof draft.intake_id === "string" ? draft.intake_id : "") ?? null })) });
  response.headers.set("X-AI-Draft-Count", String(drafts.length));
  return response;
}

export async function POST(request: NextRequest) {
  const auth = await getAuthContext();
  if (auth.response) return auth.response;
  const form = await request.formData();
  const file = form.get("file");
  const pastedText = form.get("text")?.toString() ?? "";
  const clientId = form.get("client_id")?.toString() || null;
  if (!canAccessOptionalClient(auth.context, clientId)) return NextResponse.json({ error: "Client tidak berada dalam scope akses user." }, { status: 403 });
  let text = pastedText;
  let filename: string | null = null;
  let mimeType: string | null = null;
  if (file instanceof File) {
    if (file.size > 10 * 1024 * 1024) return NextResponse.json({ error: "File maksimal 10 MB." }, { status: 400 });
    filename = file.name.slice(0, 180);
    mimeType = file.type || null;
    const buffer = Buffer.from(await file.arrayBuffer());
    if (!isSupportedDocument(filename, mimeType)) return NextResponse.json({ error: "Format file belum didukung. Gunakan TXT, CSV, JSON, MD, LOG, Word, PDF, Excel, atau PowerPoint." }, { status: 400 });
    try {
      text = await extractTextFromFile(buffer, filename, mimeType);
    } catch (error) {
      if (error instanceof FileParserError) return NextResponse.json({ error: error.message }, { status: 422 });
      return NextResponse.json({ error: "File gagal dibaca oleh parser." }, { status: 422 });
    }
  }
  text = text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").slice(0, MAX_TEXT);
  if (!text.trim()) return NextResponse.json({ error: "File atau teks belum diisi." }, { status: 400 });
  const intake = await auth.context.admin.from("ai_intake_items").insert({ organization_id: auth.context.organizationId, client_id: clientId, created_by: auth.context.userId, filename, mime_type: mimeType, source_text: text, status: "pending" } as never).select("id").single();
  const intakeData = intake as unknown as { data: { id: string } | null; error: { message: string } | null };
  if (intakeData.error || !intakeData.data) return NextResponse.json({ error: "Gagal menyimpan intake AI." }, { status: 500 });
  const queued = await auth.context.admin.rpc("enqueue_ai_intake" as never, { p_intake_id: intakeData.data.id, p_organization_id: auth.context.organizationId, p_created_by: auth.context.userId } as never);
  const queuedData = queued as unknown as { data: { intake_id: string; status: string } | null; error: { message: string } | null };
  if (queuedData.error || !queuedData.data) return NextResponse.json({ error: "AI intake belum dapat dimasukkan ke antrean." }, { status: 503 });
  const response = NextResponse.json({ data: queuedData.data }, { status: 202 });
  response.headers.set("X-AI-Intake-ID", intakeData.data.id);
  response.headers.set("X-AI-Intake-Status", queuedData.data.status);
  return response;
}
