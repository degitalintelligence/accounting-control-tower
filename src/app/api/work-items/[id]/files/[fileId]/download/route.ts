import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { getUserOrganizationId } from "@/lib/checklists";

type Context = { params: Promise<{ id: string; fileId: string }> };

export async function GET(_request: NextRequest, context: Context) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const admin = createServiceRoleClient();
  const organizationId = await getUserOrganizationId(admin, user.id);
  if (!organizationId) return NextResponse.json({ error: "Organisasi tidak ditemukan." }, { status: 403 });
  const { id, fileId } = await context.params;
  const item = await admin.from("work_items").select("id, client_id").eq("id", id).eq("organization_id", organizationId).is("deleted_at", null).single();
  const itemData = item as unknown as { data: { id: string; client_id: string | null } | null; error: { message: string } | null };
  if (itemData.error || !itemData.data) return NextResponse.json({ error: "Work item tidak ditemukan." }, { status: 404 });
  const membership = await admin.from("memberships").select("client_id").eq("profile_id", user.id).eq("organization_id", organizationId).eq("is_active", true);
  const memberships = membership as unknown as { data: { client_id: string | null }[] | null };
  if (!memberships.data?.some((entry) => entry.client_id === null || entry.client_id === itemData.data!.client_id)) return NextResponse.json({ error: "Work item tidak ditemukan." }, { status: 404 });
  const relation = await admin.from("work_item_files").select("file_id, files(storage_path, filename)").eq("work_item_id", id).eq("file_id", fileId).single();
  const relationData = relation as unknown as { data: { file_id: string; files: { storage_path: string; filename: string } | null } | null; error: { message: string } | null };
  if (relationData.error || !relationData.data?.files) return NextResponse.json({ error: "File tidak ditemukan." }, { status: 404 });
  const bucket = process.env.SUPABASE_STORAGE_BUCKET ?? "evidence";
  const signed = await admin.storage.from(bucket).createSignedUrl(relationData.data.files.storage_path, 300, { download: relationData.data.files.filename });
  if (signed.error || !signed.data?.signedUrl) return NextResponse.json({ error: "Gagal membuat signed URL." }, { status: 500 });
  return NextResponse.json({ data: { url: signed.data.signedUrl, expires_in: 300 } });
}
