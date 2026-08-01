import { NextResponse } from "next/server";
import { getAuthContext, canManageOrganization } from "@/lib/authorization";

/**
 * GET /api/settings/members
 * Returns all members in the current user's organization.
 */
export async function GET() {
  const auth = await getAuthContext();
  if (auth.response) return auth.response;
  const { admin, organizationId } = auth.context;

  if (!canManageOrganization(auth.context.memberships[0]?.role)) {
    return NextResponse.json({ error: "Akses hanya tersedia untuk manager." }, { status: 403 });
  }

  // Fetch all active members in this org
  const { data: members } = (await admin
    .from("memberships")
    .select("id, role, is_active, created_at, profile_id")
    .eq("organization_id", organizationId)
    .eq("is_active", true)
    .order("created_at", { ascending: true })) as unknown as {
    data: {
      id: string;
      role: string;
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
    };
  });

  return NextResponse.json(result);
}
