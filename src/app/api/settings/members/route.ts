import { NextResponse } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";

/**
 * GET /api/settings/members
 * Returns all members in the current user's organization.
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createServiceRoleClient();

  // Get user's organization_id
  const { data: membership } = (await admin
    .from("memberships")
    .select("organization_id")
    .eq("profile_id", user.id)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle()) as unknown as {
    data: { organization_id: string } | null;
  };

  if (!membership) {
    return NextResponse.json([]);
  }

  // Fetch all active members in this org
  const { data: members } = (await admin
    .from("memberships")
    .select("id, role, is_active, created_at, profile_id")
    .eq("organization_id", membership.organization_id)
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
