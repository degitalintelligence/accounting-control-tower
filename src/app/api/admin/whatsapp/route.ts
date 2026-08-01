import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getAuthContext, canAccessOptionalClient, canManageOrganization } from "@/lib/authorization";

const managerRoles = ["admin", "manager", "finance_manager", "accounting_manager"];

export async function GET() {
  const auth = await getAuthContext();
  if (auth.response) return auth.response;
  if (!canManageOrganization(auth.context.memberships.find((item) => item.client_id === null)?.role)) {
    return NextResponse.json({ error: "Akses hanya tersedia untuk manager." }, { status: 403 });
  }
  const { admin, organizationId, isOrgWide, clientIds } = auth.context;
  const db = admin as unknown as SupabaseClient;
  const connections = await db.from("integration_connections").select("id, provider, session_id, status, config, last_health_check_at, created_at, updated_at").eq("organization_id", organizationId).order("created_at", { ascending: false });
  const connectionIds = (connections.data ?? []).map((item: { id: string }) => item.id);
  let groupsQuery = db.from("wa_groups").select("id, connection_id, client_id, provider_group_id, group_name, is_active, activated_at, created_at").eq("organization_id", organizationId).order("group_name", { ascending: true });
  if (!isOrgWide) groupsQuery = groupsQuery.in("client_id", clientIds);
  const groups = connectionIds.length ? await groupsQuery : { data: [], error: null };
  const groupIds = (groups.data ?? []).map((item: { id: string }) => item.id);
  const mappings = groupIds.length ? await db.from("wa_participant_mappings").select("id, wa_group_id, provider_participant_id, phone, display_name, profile_id, is_verified, created_at").in("wa_group_id", groupIds) : { data: [], error: null };
  return NextResponse.json({ connections: connections.data ?? [], groups: groups.data ?? [], mappings: mappings.data ?? [] });
}

export async function POST(request: Request) {
  const auth = await getAuthContext();
  if (auth.response) return auth.response;
  if (!auth.context.memberships.some((item) => managerRoles.includes(item.role))) return NextResponse.json({ error: "Akses ditolak." }, { status: 403 });
  const body = await request.json() as { action?: string; id?: string; connection_id?: string; wa_group_id?: string; client_id?: string | null; provider?: string; session_id?: string | null; status?: string; provider_group_id?: string; group_name?: string | null; provider_participant_id?: string; phone?: string | null; display_name?: string | null; profile_id?: string | null; is_verified?: boolean };
  const { admin, organizationId, userId } = auth.context;
  const db = admin as unknown as SupabaseClient;
  if (body.action === "connection") {
    const values = { organization_id: organizationId, provider: body.provider ?? "waha", session_id: body.session_id ?? null, status: body.status ?? "disconnected", config: {}, updated_at: new Date().toISOString() };
    const result = body.id ? await db.from("integration_connections").update(values).eq("id", body.id).eq("organization_id", organizationId).select("id, provider, session_id, status, config, last_health_check_at, created_at, updated_at").single() : await db.from("integration_connections").insert(values).select("id, provider, session_id, status, config, last_health_check_at, created_at, updated_at").single();
    if (result.error) return NextResponse.json({ error: result.error.message }, { status: 400 });
    return NextResponse.json(result.data, { status: body.id ? 200 : 201 });
  }
  if (body.action === "group") {
    if (!body.connection_id || !body.provider_group_id) return NextResponse.json({ error: "Connection dan provider group wajib diisi." }, { status: 400 });
    if (!canAccessOptionalClient(auth.context, body.client_id)) return NextResponse.json({ error: "Client tidak dapat diakses." }, { status: 403 });
    const values = { connection_id: body.connection_id, organization_id: organizationId, client_id: body.client_id ?? null, provider_group_id: body.provider_group_id, group_name: body.group_name ?? null, is_active: body.is_verified === true, activated_by: body.is_verified === true ? userId : null, activated_at: body.is_verified === true ? new Date().toISOString() : null };
    const result = body.id ? await db.from("wa_groups").update(values).eq("id", body.id).eq("organization_id", organizationId).select("id, connection_id, client_id, provider_group_id, group_name, is_active, activated_at, created_at").single() : await db.from("wa_groups").insert(values).select("id, connection_id, client_id, provider_group_id, group_name, is_active, activated_at, created_at").single();
    if (result.error) return NextResponse.json({ error: result.error.message }, { status: 400 });
    return NextResponse.json(result.data, { status: body.id ? 200 : 201 });
  }
  if (body.action === "mapping") {
    if (!body.wa_group_id || !body.provider_participant_id || !body.profile_id) return NextResponse.json({ error: "Group, participant, dan profile wajib diisi." }, { status: 400 });
    const group = await db.from("wa_groups").select("id, client_id").eq("id", body.wa_group_id).eq("organization_id", organizationId).maybeSingle();
    if (group.error || !group.data || !canAccessOptionalClient(auth.context, group.data.client_id)) return NextResponse.json({ error: "Group tidak dapat diakses." }, { status: 403 });
    const member = await db.from("memberships").select("profile_id").eq("organization_id", organizationId).eq("profile_id", body.profile_id).eq("is_active", true).limit(1).maybeSingle();
    if (!member.data) return NextResponse.json({ error: "Profile bukan anggota tenant." }, { status: 400 });
    const result = body.id ? await db.from("wa_participant_mappings").update({ profile_id: body.profile_id, phone: body.phone ?? null, display_name: body.display_name ?? null, is_verified: body.is_verified ?? false }).eq("id", body.id).select("id, wa_group_id, provider_participant_id, phone, display_name, profile_id, is_verified, created_at").single() : await db.from("wa_participant_mappings").insert({ wa_group_id: body.wa_group_id, provider_participant_id: body.provider_participant_id, phone: body.phone ?? null, display_name: body.display_name ?? null, profile_id: body.profile_id, is_verified: body.is_verified ?? false }).select("id, wa_group_id, provider_participant_id, phone, display_name, profile_id, is_verified, created_at").single();
    if (result.error) return NextResponse.json({ error: result.error.message }, { status: 400 });
    return NextResponse.json(result.data, { status: body.id ? 200 : 201 });
  }
  if (body.action === "health" && body.id) {
    const result = await db.from("integration_connections").update({ last_health_check_at: new Date().toISOString(), status: body.status ?? "connected", updated_at: new Date().toISOString() }).eq("id", body.id).eq("organization_id", organizationId).select("id, status, last_health_check_at").single();
    if (result.error) return NextResponse.json({ error: result.error.message }, { status: 400 });
    return NextResponse.json(result.data);
  }
  return NextResponse.json({ error: "Action tidak dikenal." }, { status: 400 });
}
