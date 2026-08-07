import { NextRequest, NextResponse } from "next/server";
import { getAuthContext, requirePermission } from "@/lib/authorization";
import { organizationUpdateSchema, validationMessage } from "@/lib/validation/schemas";
import { isAppLocale } from "@/lib/i18n";
import { createClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";
import { z } from "zod";

const archiveSchema = z.object({ confirmation: z.string().trim().min(1).max(120) });
const ACTIVE_ORGANIZATION_COOKIE = "acct_ctrl_active_organization";

export async function GET() {
  const auth = await getAuthContext();
  if (auth.response) return auth.response;
  const { data, error } = await auth.context.admin.from("organizations").select("id, name, slug, settings, updated_at").eq("id", auth.context.organizationId).maybeSingle();
  if (error || !data) return NextResponse.json({ error: "Pengaturan organisasi gagal dimuat." }, { status: 500 });
  return NextResponse.json({ data });
}

export async function DELETE(request: NextRequest) {
  let auth;
  try {
    auth = await getAuthContext();
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const invalidSession = message.toLowerCase().includes("invalid refresh token") || message.toLowerCase().includes("refresh token not found");
    return NextResponse.json({ error: invalidSession ? "Sesi login sudah tidak valid. Silakan login ulang." : "Sesi autentikasi tidak dapat diproses." }, { status: invalidSession ? 401 : 500 });
  }
  if (auth.response) return auth.response;
  const owner = auth.context.memberships.some((membership) => membership.organization_id === auth.context.organizationId && membership.role === "owner");
  if (!owner) return NextResponse.json({ error: "Hanya owner organisasi yang dapat mengarsipkan organisasi." }, { status: 403 });
  const { data: organization, error: organizationError } = await auth.context.admin.from("organizations").select("id, name, deleted_at").eq("id", auth.context.organizationId).maybeSingle() as unknown as { data: { id: string; name: string; deleted_at: string | null } | null; error: { code?: string; message?: string } | null };
  if (organizationError) return NextResponse.json({ error: "Organisasi gagal dimuat." }, { status: 500 });
  if (!organization) return NextResponse.json({ error: "Organisasi tidak ditemukan." }, { status: 404 });
  const parsed = archiveSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || parsed.data.confirmation !== organization.name) return NextResponse.json({ error: "Ketik nama organisasi persis untuk mengonfirmasi pengarsipan." }, { status: 400 });
  let result: { data: unknown; error: { code?: string; message?: string; hint?: string; details?: string } | null };
  try {
    const userClient = await createClient();
    result = await userClient.rpc("archive_organization" as never, { p_organization_id: organization.id } as never) as unknown as { data: unknown; error: { code?: string; message?: string; hint?: string; details?: string } | null };
  } catch (error) {
    return NextResponse.json({ error: "Organisasi gagal diarsipkan. Periksa konfigurasi koneksi database." }, { status: 500 });
  }
  if (result.error) {
    const status = result.error.code === "P0002" ? 409 : result.error.code === "42501" ? 403 : 500;
    const error = result.error.message === "SOLE_OWNER_REQUIRED" ? "Organisasi hanya dapat diarsipkan jika Anda adalah satu-satunya owner aktif." : result.error.message === "ORGANIZATION_ALREADY_ARCHIVED" ? "Organisasi sudah diarsipkan." : result.error.code === "PGRST202" ? "Fungsi arsip organisasi belum tersedia di database. Jalankan migration terbaru." : result.error.code === "23505" ? "Permintaan arsip organisasi sudah pernah dibuat. Muat ulang halaman lalu coba lagi." : "Organisasi gagal diarsipkan.";
    return NextResponse.json({ error, ...(process.env.NODE_ENV !== "production" ? { errorCode: result.error.code ?? null } : {}) }, { status });
  }
  const cookieStore = await cookies();
  cookieStore.delete(ACTIVE_ORGANIZATION_COOKIE);
  return NextResponse.json({ archived: true });
}

export async function PATCH(request: NextRequest) {
  const auth = await getAuthContext();
  if (auth.response) return auth.response;
  const denied = await requirePermission(auth.context, "organization.manage");
  if (denied) return denied;
  const parsed = organizationUpdateSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: validationMessage(parsed.error) }, { status: 400 });
  const { timezone, currency, locale, ...fields } = parsed.data;
  if (!isAppLocale(locale)) return NextResponse.json({ error: "Bahasa tidak didukung." }, { status: 400 });
  const { data: current } = await auth.context.admin.from("organizations").select("settings").eq("id", auth.context.organizationId).single();
  const settings = { ...((current as { settings?: Record<string, unknown> } | null)?.settings ?? {}), timezone, currency, locale };
  const { data, error } = await auth.context.admin.from("organizations").update({ ...fields, settings, updated_at: new Date().toISOString() } as never).eq("id", auth.context.organizationId).select("id, name, slug, settings, updated_at").single();
  if (error) return NextResponse.json({ error: "Pengaturan organisasi gagal disimpan." }, { status: 500 });
  return NextResponse.json({ data });
}
