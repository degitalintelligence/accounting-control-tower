import { NextRequest, NextResponse } from "next/server";
import { getAuthContext, requirePermission } from "@/lib/authorization";
import { organizationUpdateSchema, validationMessage } from "@/lib/validation/schemas";
import { isAppLocale } from "@/lib/i18n";

export async function GET() {
  const auth = await getAuthContext();
  if (auth.response) return auth.response;
  const { data, error } = await auth.context.admin.from("organizations").select("id, name, slug, settings, updated_at").eq("id", auth.context.organizationId).maybeSingle();
  if (error || !data) return NextResponse.json({ error: "Pengaturan organisasi gagal dimuat." }, { status: 500 });
  return NextResponse.json({ data });
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
