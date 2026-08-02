import { NextResponse } from "next/server";
import { getAuthContext, requirePermission } from "@/lib/authorization";
import { memberCreateSchema, validationMessage } from "@/lib/validation/schemas";
import { NextRequest } from "next/server";
import { createPublicAuthClient } from "@/lib/supabase/server";

/**
 * GET /api/settings/members
 * Returns all members in the current user's organization.
 */
export async function GET() {
  const auth = await getAuthContext();
  if (auth.response) return auth.response;
  const { admin, organizationId } = auth.context;

  const denied = await requirePermission(auth.context, "members.view");
  if (denied) return denied;

  // Fetch all members in this org
  const { data: members } = (await admin
    .from("memberships")
    .select("id, role, role_id, is_active, created_at, profile_id")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: true })) as unknown as {
    data: {
      id: string;
      role: string;
      role_id: string | null;
      is_active: boolean;
      created_at: string;
      profile_id: string;
    }[];
  };

  // Fetch profiles for these members
  const profileIds = (members ?? []).map((m) => m.profile_id);
  const profileMap: Record<
    string,
    { display_name: string; email: string | null; avatar_url: string | null }
  > = {};

  if (profileIds.length > 0) {
    const { data: profiles } = (await admin
      .from("profiles")
      .select("id, display_name, email, avatar_url")
      .in("id", profileIds)) as unknown as {
      data: {
        id: string;
        display_name: string;
        email: string | null;
        avatar_url: string | null;
      }[];
    };

    for (const p of profiles ?? []) {
      profileMap[p.id] = p;
    }
  }

  const result = (members ?? []).map((m) => {
    const profile = profileMap[m.profile_id];
    const name = profile?.display_name ?? "Unknown";
    const parts = name.split(" ");
    const initials =
      parts.length >= 2
        ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
        : name.slice(0, 2).toUpperCase();

    return {
      id: m.id,
      profile_id: m.profile_id,
      name,
      email: profile?.email ?? null,
      avatar_url: profile?.avatar_url ?? null,
      role: m.role,
      initials,
      joined_at: m.created_at,
      is_active: m.is_active,
    };
  });

  return NextResponse.json(result);
}

export async function POST(request: NextRequest) {
  const auth = await getAuthContext();
  if (auth.response) return auth.response;
  const denied = await requirePermission(auth.context, "members.manage");
  if (denied) return denied;
  const parsed = memberCreateSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: validationMessage(parsed.error) }, { status: 400 });
  const { admin, organizationId } = auth.context;
  const clientId = parsed.data.client_id ?? null;
  const entityId = parsed.data.entity_id ?? null;

  if (clientId) {
    const client = await admin.from("clients").select("id").eq("id", clientId).eq("organization_id", organizationId).is("deleted_at", null).maybeSingle();
    if (client.error || !client.data) return NextResponse.json({ error: "Client tidak ditemukan." }, { status: 400 });
  }

  if (entityId) {
    const entity = await admin.from("entities").select("id, client_id").eq("id", entityId).eq("organization_id", organizationId).is("deleted_at", null).maybeSingle();
    const entityData = entity.data as unknown as { id: string; client_id: string } | null;
    if (entity.error || !entityData || (clientId !== null && entityData.client_id !== clientId)) {
      return NextResponse.json({ error: "Entity tidak ditemukan." }, { status: 400 });
    }
  }

  const email = parsed.data.email.toLowerCase();
  const roleRecordResult = await admin.from("organization_roles").select("id").eq("organization_id", organizationId).eq("role_key", parsed.data.role).is("deleted_at", null).maybeSingle();
  const roleRecord = roleRecordResult as unknown as { data: { id: string } | null; error: unknown };
  if (roleRecord.error || !roleRecord.data) return NextResponse.json({ error: "Role workspace belum tersedia. Jalankan migration RBAC terlebih dahulu." }, { status: 400 });
  let user;
  for (let page = 1; ; page += 1) {
    const users = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (users.error) return NextResponse.json({ error: "Undangan gagal diproses." }, { status: 500 });
    user = users.data.users.find((candidate) => candidate.email?.toLowerCase() === email);
    if (user || users.data.users.length < 1000) break;
  }

  const isNewUser = !user;
  if (isNewUser) {
    const invited = await admin.auth.admin.inviteUserByEmail(email, {
      data: { full_name: parsed.data.display_name },
      redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback?next=/reset-password`,
    });
    if (invited.error || !invited.data.user) {
      return NextResponse.json({ error: "Undangan gagal diproses." }, { status: 400 });
    }
    user = invited.data.user;
  }
  const authUser = user;
  if (!authUser) return NextResponse.json({ error: "User Auth gagal diproses." }, { status: 500 });

  const profile = await admin.from("profiles").upsert({
    id: authUser.id,
    display_name: parsed.data.display_name,
    email,
  } as never, { onConflict: "id" }).select("id").single();
  if (profile.error || !profile.data) return NextResponse.json({ error: "Profil user gagal diprovision." }, { status: 500 });

  let membership = admin.from("memberships").select("id, profile_id, role, client_id, entity_id, is_active, created_at").eq("profile_id", authUser.id).eq("organization_id", organizationId).eq("role", parsed.data.role);
  membership = clientId === null ? membership.is("client_id", null) : membership.eq("client_id", clientId);
  membership = entityId === null ? membership.is("entity_id", null) : membership.eq("entity_id", entityId);
  const existingMembership = await membership.maybeSingle() as unknown as { data: { id: string } | null; error: unknown };

  if (existingMembership.error) return NextResponse.json({ error: "Membership gagal diverifikasi." }, { status: 500 });

  if (existingMembership.data) {
    const updated = await admin.from("memberships").update({ is_active: true, role_id: roleRecord.data.id } as never).eq("id", existingMembership.data.id).eq("organization_id", organizationId).select("id, profile_id, role, role_id, client_id, entity_id, is_active, created_at").single() as unknown as { data: unknown; error: unknown };
    if (updated.error || !updated.data) return NextResponse.json({ error: "Membership gagal diaktifkan." }, { status: 500 });
    if (!isNewUser) {
      const recovery = await createPublicAuthClient().auth.resetPasswordForEmail(email, {
        redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback?next=/reset-password`,
      });
      if (recovery.error) return NextResponse.json({ error: "Email pengaturan password gagal dikirim." }, { status: 502 });
    }
    return NextResponse.json({ data: updated.data }, { status: 200 });
  }

  const insertedMembership = await admin.from("memberships").insert({
    profile_id: authUser.id,
    organization_id: organizationId,
    client_id: clientId,
    entity_id: entityId,
    role: parsed.data.role,
    role_id: roleRecord.data.id,
    is_active: true,
  } as never).select("id, profile_id, role, client_id, entity_id, is_active, created_at").single() as unknown as { data: unknown; error: unknown };
  if (!insertedMembership.error && insertedMembership.data) {
    if (!isNewUser) {
      const recovery = await createPublicAuthClient().auth.resetPasswordForEmail(email, {
        redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback?next=/reset-password`,
      });
      if (recovery.error) return NextResponse.json({ error: "Email pengaturan password gagal dikirim." }, { status: 502 });
    }
    return NextResponse.json({ data: insertedMembership.data }, { status: 201 });
  }

  const concurrent = admin.from("memberships").select("id, profile_id, role, role_id, client_id, entity_id, is_active, created_at").eq("profile_id", authUser.id).eq("organization_id", organizationId).eq("role", parsed.data.role);
  const concurrentQuery = clientId === null ? concurrent.is("client_id", null) : concurrent.eq("client_id", clientId);
  const concurrentMatch = entityId === null ? concurrentQuery.is("entity_id", null) : concurrentQuery.eq("entity_id", entityId);
  const retry = await concurrentMatch.maybeSingle();
  if (retry.data) return NextResponse.json({ data: retry.data }, { status: 200 });
  return NextResponse.json({ error: "Membership gagal dibuat." }, { status: 500 });
}
