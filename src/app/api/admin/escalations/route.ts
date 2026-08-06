import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getAuthContext, canAccessOptionalClient, requirePermission } from "@/lib/authorization";
import { validateEscalationRules } from "@/lib/validation/policy";

export async function GET() {
  const auth = await getAuthContext();
  if (auth.response) return auth.response;
  const denied = await requirePermission(auth.context, "escalations.view");
  if (denied) return denied;
  const db = auth.context.admin as unknown as SupabaseClient;
  let query = db.from("escalation_policies").select("id, client_id, name, description, rules, is_active, created_at, updated_at").eq("organization_id", auth.context.organizationId).order("name");
  if (!auth.context.isOrgWide) query = query.in("client_id", auth.context.clientIds);
  const result = await query;
  if (result.error) return NextResponse.json({ error: result.error.message }, { status: 400 });
  return NextResponse.json(result.data ?? []);
}

export async function POST(request: Request) {
  const auth = await getAuthContext();
  if (auth.response) return auth.response;
  const denied = await requirePermission(auth.context, "escalations.manage");
  if (denied) return denied;
  const body = await request.json() as { id?: string; name?: string; description?: string | null; client_id?: string | null; rules?: unknown; is_active?: boolean };
  if (!body.name?.trim() || !canAccessOptionalClient(auth.context, body.client_id)) return NextResponse.json({ error: "Nama dan client yang valid wajib diisi." }, { status: 400 });
  const validation = validateEscalationRules(body.rules);
  if (validation.error) return NextResponse.json({ error: validation.error }, { status: 400 });
  const values = { organization_id: auth.context.organizationId, client_id: body.client_id ?? null, name: body.name.trim(), description: body.description ?? null, rules: validation.rules, is_active: body.is_active ?? true, updated_at: new Date().toISOString() };
  const db = auth.context.admin as unknown as SupabaseClient;
  const result = body.id ? await db.from("escalation_policies").update(values).eq("id", body.id).eq("organization_id", auth.context.organizationId).select("id, client_id, name, description, rules, is_active, created_at, updated_at").single() : await db.from("escalation_policies").insert(values).select("id, client_id, name, description, rules, is_active, created_at, updated_at").single();
  if (result.error) return NextResponse.json({ error: result.error.message }, { status: 400 });
  return NextResponse.json(result.data, { status: body.id ? 200 : 201 });
}
