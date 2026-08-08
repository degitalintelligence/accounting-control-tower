import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getRequiredServerEnv } from "@/lib/server-env";
import { canAccessClient, getAuthContext, requirePermission } from "@/lib/authorization";

type Context = { params: Promise<{ id: string; fileId: string }> };

export async function GET(_request: NextRequest, context: Context) {
  const authContext = await getAuthContext();
  if (authContext.response) return authContext.response;

  // Hardening: Wajib memiliki permission view
  const guard = await requirePermission(authContext.context, "work_items.view");
  if (guard) return guard;

  const { admin, organizationId } = authContext.context;
  const { id, fileId } = await context.params;
  const item = await admin.from("work_items").select("id, client_id").eq("id", id).eq("organization_id", organizationId).is("deleted_at", null).single();
  const itemData = item as unknown as { data: { id: string; client_id: string | null } | null; error: { message: string } | null };
  if (itemData.error || !itemData.data) return NextResponse.json({ error: "Work item tidak ditemukan." }, { status: 404 });
  if (!canAccessClient(authContext.context, itemData.data.client_id)) return NextResponse.json({ error: "Work item tidak ditemukan." }, { status: 404 });
  const relation = await admin.from("work_item_files").select("file_id, files(storage_path, filename, scan_status)").eq("work_item_id", id).eq("file_id", fileId).single();
  const relationData = relation as unknown as { data: { file_id: string; files: { storage_path: string; filename: string; scan_status: string } | null } | null; error: { message: string } | null };
  if (relationData.error || !relationData.data?.files) return NextResponse.json({ error: "File tidak ditemukan." }, { status: 404 });
  if (relationData.data.files.scan_status !== "clean") return NextResponse.json({ error: "File belum lolos pemeriksaan keamanan." }, { status: 423 });
  const bucket = getRequiredServerEnv("SUPABASE_STORAGE_BUCKET");
  const signed = await admin.storage.from(bucket).createSignedUrl(relationData.data.files.storage_path, 300, { download: relationData.data.files.filename });
  if (signed.error || !signed.data?.signedUrl) return NextResponse.json({ error: "Gagal membuat signed URL." }, { status: 500 });
  return NextResponse.json({ data: { url: signed.data.signedUrl, expires_in: 300 } });
}
