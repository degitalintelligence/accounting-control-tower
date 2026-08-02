import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getAuthContext, canAccessOptionalClient, requirePermission } from "@/lib/authorization";
import { getWahaGroupParticipants, getWahaGroups, getWahaQr, getWahaSessionStatus, startWahaSession, WahaRequestError } from "@/lib/whatsapp/adapter";
import { logAudit } from "@/lib/audit/logger";

export async function GET(request: Request) {
  const auth = await getAuthContext();
  if (auth.response) return auth.response;
  const denied = await requirePermission(auth.context, "integrations.manage");
  if (denied) return denied;
  const url = new URL(request.url);
  const action = url.searchParams.get("action");
  const connectionId = url.searchParams.get("id");
  const { admin, organizationId, isOrgWide, clientIds } = auth.context;
  const db = admin as unknown as SupabaseClient;
  if (action === "discover-groups" && connectionId) {
    const connection = await db.from("integration_connections").select("id, provider, session_id, status").eq("id", connectionId).eq("organization_id", organizationId).maybeSingle();
    if (connection.error || !connection.data) return NextResponse.json({ error: "Connection tidak ditemukan." }, { status: 404 });
    if (connection.data.status === "retired") return NextResponse.json({ error: "Connection sudah retired dan tidak dapat digunakan." }, { status: 409 });
    if (connection.data.provider !== "waha" || !connection.data.session_id) return NextResponse.json({ error: "Connection WAHA belum memiliki session." }, { status: 400 });
    try {
      const groups = await getWahaGroups(connection.data.session_id);
      return NextResponse.json({ groups });
    } catch (error) {
      return NextResponse.json({ error: error instanceof WahaRequestError ? "WAHA tidak dapat memuat daftar grup." : "Discovery grup gagal." }, { status: error instanceof WahaRequestError ? 502 : 500 });
    }
  }
  if (action === "discover-participants" && connectionId) {
    const providerGroupId = url.searchParams.get("group_id");
    const connection = await db.from("integration_connections").select("id, provider, session_id, status").eq("id", connectionId).eq("organization_id", organizationId).maybeSingle();
    if (connection.error || !connection.data) return NextResponse.json({ error: "Connection tidak ditemukan." }, { status: 404 });
    if (connection.data.status === "retired") return NextResponse.json({ error: "Connection sudah retired dan tidak dapat digunakan." }, { status: 409 });
    if (connection.data.provider !== "waha" || !connection.data.session_id || !providerGroupId) return NextResponse.json({ error: "Connection WAHA dan group ID wajib diisi." }, { status: 400 });
    try {
      const participants = await getWahaGroupParticipants(connection.data.session_id, providerGroupId);
      return NextResponse.json({ participants });
    } catch (error) {
      return NextResponse.json({ error: error instanceof WahaRequestError ? "WAHA tidak dapat memuat peserta grup." : "Discovery peserta gagal." }, { status: error instanceof WahaRequestError ? 502 : 500 });
    }
  }
  if ((action === "status" || action === "qr") && connectionId) {
    const connection = await db.from("integration_connections").select("id, provider, session_id, status").eq("id", connectionId).eq("organization_id", organizationId).maybeSingle();
    if (connection.error || !connection.data) return NextResponse.json({ error: "Connection tidak ditemukan." }, { status: 404 });
    if (connection.data.status === "retired") return NextResponse.json({ error: "Connection sudah retired dan tidak dapat digunakan." }, { status: 409 });
    if (connection.data.provider !== "waha" || !connection.data.session_id) return NextResponse.json({ error: "Connection WAHA belum memiliki session." }, { status: 400 });
    try {
      if (action === "qr") {
        const qr = await getWahaQr(connection.data.session_id);
        return new NextResponse(qr.body, { headers: { "Content-Type": qr.contentType, "Cache-Control": "no-store" } });
      }
      const remote = await getWahaSessionStatus(connection.data.session_id) as { status?: string };
      const status = remote.status ?? connection.data.status;
      const updated = await db.from("integration_connections").update({ status, last_health_check_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", connectionId).eq("organization_id", organizationId).select("id, status, last_health_check_at").single();
      if (updated.error) return NextResponse.json({ error: updated.error.message }, { status: 400 });
      return NextResponse.json({ ...updated.data, remote_status: remote.status ?? null });
    } catch (error) {
      const upstreamStatus = error instanceof WahaRequestError ? error.status : undefined;
      const isSessionStateError = upstreamStatus === 422;
      if (action === "qr") return NextResponse.json({ id: connectionId, status: connection.data.status, error: isSessionStateError ? "Session WAHA belum siap untuk mengambil QR." : "WAHA tidak dapat dihubungi.", action: isSessionStateError ? "Pastikan session sudah dimulai, lalu coba tampilkan QR kembali." : undefined }, { status: isSessionStateError ? 422 : 502 });
      const updated = await db.from("integration_connections").update({ status: "disconnected", last_health_check_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", connectionId).eq("organization_id", organizationId).select("id, status, last_health_check_at").single();
      return NextResponse.json({ ...updated.data, error: isSessionStateError ? "Session WAHA belum siap untuk mengambil QR." : "WAHA tidak dapat dihubungi.", action: isSessionStateError ? "Pastikan session sudah dimulai, lalu coba tampilkan QR kembali." : undefined }, { status: isSessionStateError ? 422 : 502 });
    }
  }
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
  const denied = await requirePermission(auth.context, "integrations.manage");
  if (denied) return denied;
  const body = await request.json() as { action?: string; id?: string; connection_id?: string; wa_group_id?: string; client_id?: string | null; provider?: string; session_id?: string | null; status?: string; provider_group_id?: string; group_name?: string | null; provider_participant_id?: string; phone?: string | null; display_name?: string | null; profile_id?: string | null; is_verified?: boolean };
  const { admin, organizationId, userId } = auth.context;
  const db = admin as unknown as SupabaseClient;
  if (body.action === "retire") {
    if (!body.id) return NextResponse.json({ error: "Connection wajib dipilih." }, { status: 400 });
    const existing = await db.from("integration_connections").select("id, provider, session_id, status, retired_at").eq("id", body.id).eq("organization_id", organizationId).maybeSingle();
    if (existing.error || !existing.data) return NextResponse.json({ error: "Connection tidak ditemukan." }, { status: 404 });
    const result = await db.rpc("retire_whatsapp_connection" as never, { p_connection_id: body.id, p_organization_id: organizationId, p_actor_id: userId } as never);
    const retired = result as unknown as { data: { id: string; provider: string; session_id: string | null; status: string; retired_at: string | null } | null; error: { message: string; code?: string } | null };
    if (retired.error || !retired.data) return NextResponse.json({ error: retired.error?.code === "P0002" ? "Connection tidak ditemukan." : retired.error?.message ?? "Connection gagal dinonaktifkan." }, { status: retired.error?.code === "P0002" ? 404 : 400 });
    await logAudit(admin, { organizationId, actorId: userId, action: "whatsapp_connection.retired", entityType: "integration_connection", entityId: retired.data.id, oldValue: { provider: existing.data.provider, session_id: existing.data.session_id, status: existing.data.status }, newValue: { status: retired.data.status, retired_at: retired.data.retired_at }, metadata: { related_groups_deactivated: true } });
    return NextResponse.json(retired.data);
  }
  if (body.action === "start" && body.id) {
    const connection = await db.from("integration_connections").select("id, provider, session_id, status").eq("id", body.id).eq("organization_id", organizationId).maybeSingle();
    if (connection.error || !connection.data) return NextResponse.json({ error: "Connection tidak ditemukan." }, { status: 404 });
    if (connection.data.status === "retired") return NextResponse.json({ error: "Connection sudah retired." }, { status: 409 });
    if (connection.data.provider !== "waha" || !connection.data.session_id) return NextResponse.json({ error: "Connection WAHA belum memiliki session." }, { status: 400 });
    try {
      await startWahaSession(connection.data.session_id);
      const result = await db.from("integration_connections").update({ status: "starting", last_health_check_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", body.id).eq("organization_id", organizationId).select("id, status, last_health_check_at").single();
      if (result.error) return NextResponse.json({ error: result.error.message }, { status: 400 });
      return NextResponse.json(result.data);
    } catch (error) {
      const status = error instanceof WahaRequestError ? error.status : undefined;
      return NextResponse.json({ error: status === 422 ? "Session WAHA belum siap untuk dimulai." : "WAHA tidak dapat dihubungi.", action: status === 422 ? "Pastikan session tersedia dan konfigurasi WAHA benar." : undefined }, { status: status === 422 ? 422 : 502 });
    }
  }
  if (body.action === "connection") {
    const provider = body.provider?.trim() || "waha";
    const sessionId = body.session_id?.trim() || null;
    if (body.status === "retired") return NextResponse.json({ error: "Status retired hanya dapat ditetapkan melalui proses retire." }, { status: 400 });
    const values = { organization_id: organizationId, provider, session_id: sessionId, status: body.status ?? "disconnected", config: {}, updated_at: new Date().toISOString() };
    if (!body.id && !sessionId) return NextResponse.json({ error: "Session ID wajib diisi." }, { status: 400 });
    if (body.id) {
      const current = await db.from("integration_connections").select("status").eq("id", body.id).eq("organization_id", organizationId).maybeSingle();
      if (current.error || !current.data) return NextResponse.json({ error: "Connection tidak ditemukan." }, { status: 404 });
      if (current.data.status === "retired") return NextResponse.json({ error: "Connection sudah retired dan tidak dapat diaktifkan kembali." }, { status: 409 });
    }
    const result = body.id ? await db.from("integration_connections").update(values).eq("id", body.id).eq("organization_id", organizationId).select("id, provider, session_id, status, config, last_health_check_at, created_at, updated_at").single() : await db.from("integration_connections").insert(values).select("id, provider, session_id, status, config, last_health_check_at, created_at, updated_at").single();
    if (result.error) return NextResponse.json({ error: result.error.code === "23505" ? "Provider dan session ID sudah terdaftar di tenant ini." : result.error.message }, { status: result.error.code === "23505" ? 409 : 400 });
    return NextResponse.json(result.data, { status: body.id ? 200 : 201 });
  }
  if (body.action === "group") {
    if (!body.connection_id || !body.provider_group_id) return NextResponse.json({ error: "Connection dan provider group wajib diisi." }, { status: 400 });
    if (!canAccessOptionalClient(auth.context, body.client_id)) return NextResponse.json({ error: "Client tidak dapat diakses." }, { status: 403 });
    const connection = await db.from("integration_connections").select("id, status").eq("id", body.connection_id).eq("organization_id", organizationId).maybeSingle();
    if (connection.error || !connection.data) return NextResponse.json({ error: "Connection tidak dapat diakses." }, { status: 403 });
    if (connection.data.status === "retired") return NextResponse.json({ error: "Connection sudah retired dan tidak dapat menerima whitelist baru." }, { status: 409 });
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
    const result = body.id ? await db.from("wa_participant_mappings").update({ profile_id: body.profile_id, phone: body.phone ?? null, display_name: body.display_name ?? null, is_verified: body.is_verified ?? false }).eq("id", body.id).eq("wa_group_id", body.wa_group_id).select("id, wa_group_id, provider_participant_id, phone, display_name, profile_id, is_verified, created_at").single() : await db.from("wa_participant_mappings").insert({ wa_group_id: body.wa_group_id, provider_participant_id: body.provider_participant_id, phone: body.phone ?? null, display_name: body.display_name ?? null, profile_id: body.profile_id, is_verified: body.is_verified ?? false }).select("id, wa_group_id, provider_participant_id, phone, display_name, profile_id, is_verified, created_at").single();
    if (result.error) return NextResponse.json({ error: result.error.message }, { status: 400 });
    return NextResponse.json(result.data, { status: body.id ? 200 : 201 });
  }
  if (body.action === "health" && body.id) {
    const current = await db.from("integration_connections").select("status").eq("id", body.id).eq("organization_id", organizationId).maybeSingle();
    if (current.error || !current.data) return NextResponse.json({ error: "Connection tidak ditemukan." }, { status: 404 });
    if (current.data.status === "retired") return NextResponse.json({ error: "Connection sudah retired dan tidak dapat diperbarui." }, { status: 409 });
    const result = await db.from("integration_connections").update({ last_health_check_at: new Date().toISOString(), status: body.status ?? "connected", updated_at: new Date().toISOString() }).eq("id", body.id).eq("organization_id", organizationId).select("id, status, last_health_check_at").single();
    if (result.error) return NextResponse.json({ error: result.error.message }, { status: 400 });
    return NextResponse.json(result.data);
  }
  return NextResponse.json({ error: "Action tidak dikenal." }, { status: 400 });
}
