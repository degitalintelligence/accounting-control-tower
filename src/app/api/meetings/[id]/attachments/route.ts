import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/authorization";
import { getRequiredServerEnv } from "@/lib/server-env";
import { createHash } from "crypto";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context) {
  const auth = await getAuthContext();
  if (auth.response) return auth.response;
  const { id } = await context.params;
  let meetingQuery = auth.context.admin.from("meetings").select("id, client_id").eq("id", id).eq("organization_id", auth.context.organizationId).is("deleted_at", null);
  if (!auth.context.isOrgWide) meetingQuery = meetingQuery.in("client_id", auth.context.clientIds);
  const meeting = await meetingQuery.maybeSingle();
  if (!meeting.data) return NextResponse.json({ error: "Meeting tidak ditemukan." }, { status: 404 });
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "File notulen wajib dipilih." }, { status: 400 });
  if (file.size > 10 * 1024 * 1024) return NextResponse.json({ error: "Ukuran file maksimal 10 MB." }, { status: 400 });
  const allowed = ["text/plain", "text/markdown", "text/csv", "application/json"];
  if (!allowed.includes(file.type) && !/\.(txt|md|csv|json|log)$/i.test(file.name)) return NextResponse.json({ error: "Format MVP yang didukung: TXT, MD, CSV, JSON, LOG." }, { status: 400 });
  const buffer = Buffer.from(await file.arrayBuffer());
  const sourceText = buffer.toString("utf8").slice(0, 50000);
  const storagePath = `${auth.context.organizationId}/meetings/${id}/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 180)}`;
  const bucket = getRequiredServerEnv("SUPABASE_STORAGE_BUCKET");
  const upload = await auth.context.admin.storage.from(bucket).upload(storagePath, buffer, { contentType: file.type || undefined, upsert: false });
  if (upload.error) return NextResponse.json({ error: "Gagal mengunggah lampiran." }, { status: 500 });
  const result = await auth.context.admin.from("meeting_attachments").insert({ organization_id: auth.context.organizationId, meeting_id: id, file_name: file.name.slice(0, 255), mime_type: file.type || null, source_text: sourceText, storage_path: storagePath, size_bytes: file.size, checksum: createHash("sha256").update(buffer).digest("hex"), created_by: auth.context.userId } as never).select("id, file_name, mime_type, size_bytes, created_at").single();
  if (result.error) return NextResponse.json({ error: "Gagal menyimpan lampiran." }, { status: 500 });
  return NextResponse.json({ data: result.data }, { status: 201 });
}

export async function GET(_: Request, context: Context) {
  const auth = await getAuthContext();
  if (auth.response) return auth.response;
  const { id } = await context.params;
  let meetingQuery = auth.context.admin.from("meetings").select("id").eq("id", id).eq("organization_id", auth.context.organizationId).is("deleted_at", null);
  if (!auth.context.isOrgWide) meetingQuery = meetingQuery.in("client_id", auth.context.clientIds);
  if (!(await meetingQuery.maybeSingle()).data) return NextResponse.json({ error: "Meeting tidak ditemukan." }, { status: 404 });
  const result = await auth.context.admin.from("meeting_attachments").select("id, file_name, mime_type, size_bytes, created_at").eq("meeting_id", id).eq("organization_id", auth.context.organizationId).is("deleted_at", null).order("created_at", { ascending: true });
  if (result.error) return NextResponse.json({ error: "Gagal memuat lampiran." }, { status: 500 });
  return NextResponse.json({ data: result.data ?? [] });
}
