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
  // #region debug-point E:route-entry
  void 0; // { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessionId: "organization-archive-500", runId: "pre-fix", hypothesisId: "E", location: "organization/route.ts:DELETE", msg: "[DEBUG] DELETE route entered", data: {}, ts: Date.now() }) }).catch(() => {});
  // #endregion
  const auth = await getAuthContext();
  if (auth.response) {
    // #region debug-point E:auth-response
    void fetch("http://127.0.0.1:7777/event", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessionId: "organization-archive-500", runId: "pre-fix", hypothesisId: "E", location: "organization/route.ts:DELETE", msg: "[DEBUG] Auth context returned response", data: { status: auth.response.status }, ts: Date.now() }) }).catch(() => {});
    // #endregion
    return auth.response;
  }
  const owner = auth.context.memberships.some((membership) => membership.organization_id === auth.context.organizationId && membership.role === "owner");
  if (!owner) return NextResponse.json({ error: "Hanya owner organisasi yang dapat mengarsipkan organisasi." }, { status: 403 });
  const { data: organization, error: organizationError } = await auth.context.admin.from("organizations").select("id, name, deleted_at").eq("id", auth.context.organizationId).maybeSingle() as unknown as { data: { id: string; name: string; deleted_at: string | null } | null; error: { code?: string; message?: string } | null };
  // #region debug-point A:organization-query
  void fetch("http://127.0.0.1:7777/event", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessionId: "organization-archive-500", runId: "pre-fix", hypothesisId: "A", location: "organization/route.ts:DELETE", msg: "[DEBUG] Organization query completed", data: { found: Boolean(organization), errorCode: organizationError?.code ?? null, hasErrorMessage: Boolean(organizationError?.message) }, ts: Date.now() }) }).catch(() => {});
  // #endregion
  if (!organization) return NextResponse.json({ error: "Organisasi tidak ditemukan." }, { status: 404 });
  const parsed = archiveSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || parsed.data.confirmation !== organization.name) return NextResponse.json({ error: "Ketik nama organisasi persis untuk mengonfirmasi pengarsipan." }, { status: 400 });
  const userClient = await createClient();
  const result = await userClient.rpc("archive_organization" as never, { p_organization_id: organization.id } as never) as unknown as { data: unknown; error: { code?: string; message?: string } | null };
  // #region debug-point B:rpc-result
  void fetch("http://127.0.0.1:7777/event", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessionId: "organization-archive-500", runId: "pre-fix", hypothesisId: "B", location: "organization/route.ts:DELETE", msg: "[DEBUG] Archive RPC completed", data: { hasData: Boolean(result.data), errorCode: result.error?.code ?? null, errorMessage: result.error?.message ?? null }, ts: Date.now() }) }).catch(() => {});
  // #endregion
  if (result.error) {
    const status = result.error.code === "P0002" ? 409 : result.error.code === "42501" ? 403 : 500;
    const error = result.error.message === "SOLE_OWNER_REQUIRED" ? "Organisasi hanya dapat diarsipkan jika Anda adalah satu-satunya owner aktif." : result.error.message === "ORGANIZATION_ALREADY_ARCHIVED" ? "Organisasi sudah diarsipkan." : "Organisasi gagal diarsipkan.";
    return NextResponse.json({ error }, { status });
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
