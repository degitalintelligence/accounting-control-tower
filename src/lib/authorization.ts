import "server-only";
import { NextResponse } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";

type AdminClient = ReturnType<typeof createServiceRoleClient>;

export type MembershipAccess = {
  organization_id: string;
  client_id: string | null;
  role: string;
  role_id: string | null;
};

export type AuthContext = {
  userId: string;
  admin: AdminClient;
  organizationId: string;
  memberships: MembershipAccess[];
  clientIds: string[];
  isOrgWide: boolean;
};

export async function getAuthContext(): Promise<
  | { context: AuthContext; response?: never }
  | { context?: never; response: NextResponse }
> {
  const client = await createClient();
  const { data: { user } } = await client.auth.getUser();
  if (!user) return { response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };

  const admin = createServiceRoleClient();
  const result = await admin
    .from("memberships")
    .select("organization_id, client_id, role, role_id")
    .eq("profile_id", user.id)
    .eq("is_active", true);
  const memberships = result as unknown as {
    data: MembershipAccess[] | null;
    error: { message: string; code?: string; hint?: string; details?: string } | null;
  };
  if (memberships.error) {
    return { response: NextResponse.json({ error: "Gagal memuat authorization context." }, { status: 500 }) };
  }
  if (!memberships.data?.length) {
    return { response: NextResponse.json({ error: "User tidak memiliki membership aktif." }, { status: 403 }) };
  }

  const organizationIds = [...new Set(memberships.data.map((membership) => membership.organization_id))];
  if (organizationIds.length !== 1) {
    return { response: NextResponse.json({ error: "User memiliki lebih dari satu organisasi aktif dan perlu memilih organisasi." }, { status: 409 }) };
  }
  const organizationId = organizationIds[0];
  const organizationMemberships = memberships.data.filter((membership) => membership.organization_id === organizationId);
  const clientIds = [...new Set(organizationMemberships.flatMap((membership) => membership.client_id ? [membership.client_id] : []))];
  return {
    context: {
      userId: user.id,
      admin,
      organizationId,
      memberships: organizationMemberships,
      clientIds,
      isOrgWide: organizationMemberships.some((membership) => membership.client_id === null),
    },
  };
}

export function canAccessClient(context: AuthContext, clientId: string | null | undefined) {
  return Boolean(clientId && (context.isOrgWide || context.clientIds.includes(clientId)));
}

export async function getAccessibleClients(context: AuthContext) {
  let query = context.admin
    .from("clients")
    .select("id, name, slug, timezone, created_at, updated_at, deleted_at")
    .eq("organization_id", context.organizationId)
    .is("deleted_at", null)
    .order("name", { ascending: true });
  if (!context.isOrgWide) query = query.in("id", context.clientIds);
  return query;
}

export function canAccessOptionalClient(context: AuthContext, clientId: string | null | undefined) {
  return clientId == null || canAccessClient(context, clientId);
}

export function hasRole(context: AuthContext, roles: string[]) {
  return context.memberships.some((membership) => roles.includes(membership.role));
}

export async function getActiveMembership(admin: AdminClient, userId: string) {
  const result = await admin
    .from("memberships")
    .select("organization_id, client_id, role, role_id")
    .eq("profile_id", userId)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();
  const data = result as unknown as {
    data: { organization_id: string; client_id: string | null; role: string; role_id: string | null } | null;
  };
  return data.data;
}

export function canManageOrganization(role: string | null | undefined) {
  return ["admin", "manager", "finance_manager", "accounting_manager"].includes(role ?? "");
}

export async function hasPermission(context: AuthContext, permissionKey: string) {
  const { data, error } = await context.admin
    .from("memberships")
    .select("role_id, role, organization_id")
    .eq("profile_id", context.userId)
    .eq("organization_id", context.organizationId)
    .eq("is_active", true);
  if (error || !data?.length) return false;
  const roleIds = data.map((membership) => (membership as { role_id?: string | null }).role_id).filter((id): id is string => Boolean(id));
  if (roleIds.length) {
    const result = await context.admin
      .from("role_permissions")
      .select("role_id, permission_catalog!inner(permission_key)")
      .in("role_id", roleIds);
    const permissionRows = (result.data ?? []) as unknown as { permission_catalog: { permission_key?: string } | null }[];
    if (!result.error && permissionRows.some((item) => item.permission_catalog?.permission_key === permissionKey)) return true;
  }
  return false;
}

export async function requirePermission(context: AuthContext, permissionKey: string) {
  if (await hasPermission(context, permissionKey)) return null;
  return NextResponse.json({ error: "Anda tidak memiliki permission untuk aksi ini." }, { status: 403 });
}
