import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getAuthContext, requirePermission } from "@/lib/authorization";

type Role = { id: string; role_key: string; name: string; description: string | null; is_system: boolean; is_active: boolean };
type Permission = { id: string; permission_key: string; name: string; description: string | null; category: string };

export async function GET() {
  const auth = await getAuthContext();
  if (auth.response) return auth.response;
  const denied = await requirePermission(auth.context, "roles.view");
  if (denied) return denied;
  const client = auth.context.admin as unknown as SupabaseClient;
  const [rolesResult, permissionsResult] = await Promise.all([
    client.from("organization_roles").select("id, role_key, name, description, is_system, is_active").eq("organization_id", auth.context.organizationId).is("deleted_at", null).order("name"),
    client.from("permission_catalog").select("id, permission_key, name, description, category").order("category").order("name"),
  ]);
  if (rolesResult.error || permissionsResult.error) return NextResponse.json({ error: "Data peran dan permission gagal dimuat." }, { status: 500 });
  const roles = (rolesResult.data ?? []) as Role[];
  const permissions = (permissionsResult.data ?? []) as Permission[];
  const roleIds = roles.map((role) => role.id);
  const mapping = roleIds.length ? await client.from("role_permissions").select("role_id, permission_id").in("role_id", roleIds) : { data: [], error: null };
  if (mapping.error) return NextResponse.json({ error: "Permission peran gagal dimuat." }, { status: 500 });
  return NextResponse.json({ roles, permissions, rolePermissions: mapping.data ?? [] });
}

export async function POST(request: NextRequest) {
  const auth = await getAuthContext();
  if (auth.response) return auth.response;
  const denied = await requirePermission(auth.context, "roles.manage");
  if (denied) return denied;
  const body = await request.json() as { role_key?: string; name?: string; description?: string | null };
  const roleKey = body.role_key?.trim().toLowerCase();
  const name = body.name?.trim();
  if (!roleKey || !/^[a-z][a-z0-9_]{1,49}$/.test(roleKey) || !name || name.length > 120) return NextResponse.json({ error: "Key dan nama peran tidak valid." }, { status: 400 });
  const client = auth.context.admin as unknown as SupabaseClient;
  const result = await client.from("organization_roles").insert({ organization_id: auth.context.organizationId, role_key: roleKey, name, description: body.description?.trim() || null }).select("id, role_key, name, description, is_system, is_active").single();
  if (result.error) return NextResponse.json({ error: "Peran gagal dibuat." }, { status: 400 });
  return NextResponse.json({ data: result.data }, { status: 201 });
}

export async function PATCH(request: NextRequest) {
  const auth = await getAuthContext();
  if (auth.response) return auth.response;
  const denied = await requirePermission(auth.context, "roles.manage");
  if (denied) return denied;
  const body = await request.json() as { role_id?: string; name?: string; description?: string | null; is_active?: boolean; permission_ids?: string[] };
  if (!body.role_id) return NextResponse.json({ error: "Role wajib dipilih." }, { status: 400 });
  const client = auth.context.admin as unknown as SupabaseClient;
  const role = await client.from("organization_roles").select("id, is_system").eq("id", body.role_id).eq("organization_id", auth.context.organizationId).maybeSingle();
  if (role.error || !role.data) return NextResponse.json({ error: "Peran tidak ditemukan." }, { status: 404 });
  if (role.data.is_system && (body.name !== undefined || body.description !== undefined || body.is_active !== undefined || body.permission_ids !== undefined)) return NextResponse.json({ error: "Role system tidak dapat diubah." }, { status: 400 });
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.name !== undefined) update.name = body.name.trim();
  if (body.description !== undefined) update.description = body.description?.trim() || null;
  if (body.is_active !== undefined) update.is_active = body.is_active;
  const updated = await client.from("organization_roles").update(update).eq("id", body.role_id).eq("organization_id", auth.context.organizationId).select("id, role_key, name, description, is_system, is_active").single();
  if (updated.error) return NextResponse.json({ error: "Peran gagal diperbarui." }, { status: 400 });
  if (Array.isArray(body.permission_ids)) {
    await client.from("role_permissions").delete().eq("role_id", body.role_id);
    if (body.permission_ids.length) {
      const inserted = await client.from("role_permissions").insert(body.permission_ids.map((permission_id) => ({ role_id: body.role_id, permission_id })));
      if (inserted.error) return NextResponse.json({ error: "Permission peran gagal diperbarui." }, { status: 400 });
    }
  }
  return NextResponse.json({ data: updated.data });
}
