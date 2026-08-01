import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/authorization";
import { getRequiredServerEnv } from "@/lib/server-env";

type Context = { params: Promise<{ id: string; fileId: string }> };

export async function GET(_: Request, context: Context) {
  const auth = await getAuthContext();
  if (auth.response) return auth.response;
  const { id, fileId } = await context.params;
  let meetingQuery = auth.context.admin.from("meetings").select("id").eq("id", id).eq("organization_id", auth.context.organizationId).is("deleted_at", null);
  if (!auth.context.isOrgWide) meetingQuery = meetingQuery.in("client_id", auth.context.clientIds);
  if (!(await meetingQuery.maybeSingle()).data) return NextResponse.json({ error: "Meeting tidak ditemukan." }, { status: 404 });
  const result = await auth.context.admin.from("meeting_attachments").select("file_name, mime_type, storage_path, source_text").eq("id", fileId).eq("meeting_id", id).eq("organization_id", auth.context.organizationId).is("deleted_at", null).single();
  const data = result as unknown as { data: { file_name: string; mime_type: string | null; storage_path: string | null; source_text: string } | null; error: { message: string } | null };
  if (data.error || !data.data) return NextResponse.json({ error: "Lampiran tidak ditemukan." }, { status: 404 });
  if (!data.data.storage_path) {
    return new NextResponse(data.data.source_text, { status: 200, headers: { "Content-Type": data.data.mime_type || "text/plain; charset=utf-8", "Content-Disposition": `inline; filename="${data.data.file_name.replace(/[^a-zA-Z0-9._-]/g, "_")}"` } });
  }
  const signed = await auth.context.admin.storage.from(getRequiredServerEnv("SUPABASE_STORAGE_BUCKET")).createSignedUrl(data.data.storage_path, 300, { download: data.data.file_name });
  if (signed.error || !signed.data?.signedUrl) return NextResponse.json({ error: "Gagal membuka lampiran." }, { status: 500 });
  return NextResponse.redirect(signed.data.signedUrl);
}
