import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { canAccessOptionalClient, canManageOrganization, getAuthContext } from "@/lib/authorization";

const fields = "id, organization_id, client_id, name, provider, model, is_active, require_human_confirmation, allow_sensitive_data, no_training_required, retention_days, created_at, updated_at";

export async function GET() {
  const auth = await getAuthContext();
  if (auth.response) return auth.response;
  if (!canManageOrganization(auth.context.memberships.find((item) => item.client_id === null)?.role)) return NextResponse.json({ error: "Akses ditolak." }, { status: 403 });
  const db = auth.context.admin as unknown as SupabaseClient;
  let query = db.from("ai_policies").select(fields).eq("organization_id", auth.context.organizationId).order("client_id").order("name");
  if (!auth.context.isOrgWide) query = query.in("client_id", auth.context.clientIds);
  const result = await query;
  if (result.error) return NextResponse.json({ error: result.error.message }, { status: 400 });
  return NextResponse.json(result.data ?? []);
}

export async function POST(request: Request) {
  const auth = await getAuthContext();
  if (auth.response) return auth.response;
  if (!canManageOrganization(auth.context.memberships.find((item) => item.client_id === null)?.role)) return NextResponse.json({ error: "Akses ditolak." }, { status: 403 });
  const body = await request.json() as { id?: string; client_id?: string | null; name?: string; provider?: string; model?: string | null; is_active?: boolean; require_human_confirmation?: boolean; allow_sensitive_data?: boolean; no_training_required?: boolean; retention_days?: number };
  if (!body.name?.trim() || !canAccessOptionalClient(auth.context, body.client_id)) return NextResponse.json({ error: "Nama dan client yang valid wajib diisi." }, { status: 400 });
  const retentionDays = body.retention_days ?? 90;
  if (!Number.isInteger(retentionDays) || retentionDays < 1 || retentionDays > 3650) return NextResponse.json({ error: "Retensi harus antara 1 dan 3650 hari." }, { status: 400 });
  const db = auth.context.admin as unknown as SupabaseClient;
  const values = { organization_id: auth.context.organizationId, client_id: body.client_id ?? null, name: body.name.trim(), provider: body.provider?.trim() || "openrouter", model: body.model?.trim() || null, is_active: body.is_active ?? true, require_human_confirmation: body.require_human_confirmation ?? true, allow_sensitive_data: body.allow_sensitive_data ?? false, no_training_required: body.no_training_required ?? true, retention_days: retentionDays, updated_at: new Date().toISOString() };
  const result = body.id ? await db.from("ai_policies").update(values).eq("id", body.id).eq("organization_id", auth.context.organizationId).select(fields).single() : await db.from("ai_policies").insert(values).select(fields).single();
  if (result.error) return NextResponse.json({ error: result.error.message }, { status: 400 });
  return NextResponse.json(result.data, { status: body.id ? 200 : 201 });
}
