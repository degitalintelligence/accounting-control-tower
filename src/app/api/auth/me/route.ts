import { NextResponse } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";

/**
 * GET /api/auth/me
 * Returns current user's profile + organization + membership role.
 * Uses service_role to bypass RLS (since org RLS requires JWT claims).
 */
export async function GET() {
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createServiceRoleClient();

  // Fetch profile (explicit cast due to Database type catch-all)
  const { data: profile } = (await admin
    .from("profiles")
    .select("display_name, avatar_url, timezone")
    .eq("id", user.id)
    .maybeSingle()) as unknown as {
    data: {
      display_name: string;
      avatar_url: string | null;
      timezone: string;
    } | null;
  };

  // Fetch membership (active, primary)
  const { data: membership } = (await admin
    .from("memberships")
    .select("organization_id, role, client_id")
    .eq("profile_id", user.id)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle()) as unknown as {
    data: {
      organization_id: string;
      role: string;
      client_id: string | null;
    } | null;
  };

  // Fetch org name
  let orgName = "Workspace";
  if (membership?.organization_id) {
    const { data: org } = (await admin
      .from("organizations")
      .select("name")
      .eq("id", membership.organization_id)
      .maybeSingle()) as unknown as { data: { name: string } | null };
    if (org) orgName = org.name;
  }

  return NextResponse.json({
    id: user.id,
    email: user.email ?? "",
    name:
      profile?.display_name ??
      user.user_metadata?.full_name ??
      user.email?.split("@")[0] ??
      "User",
    avatar_url: profile?.avatar_url ?? null,
    role: membership?.role ?? "finance_staff",
    organization_id: membership?.organization_id ?? "",
    organization_name: orgName,
  });
}
