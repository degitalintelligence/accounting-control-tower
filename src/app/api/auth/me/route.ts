import { NextResponse } from "next/server";
import { cookies } from "next/headers";
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

  const { data: memberships } = (await admin
    .from("memberships")
    .select("organization_id, role, client_id")
    .eq("profile_id", user.id)
    .eq("is_active", true)) as unknown as {
    data: Array<{
      organization_id: string;
      role: string;
      client_id: string | null;
    }> | null;
  };

  if (!memberships?.length) {
    return NextResponse.json({ error: "Membership aktif tidak ditemukan." }, { status: 403 });
  }

  const organizationIds = [...new Set(memberships.map((membership) => membership.organization_id))];
  const { data: organizations } = (await admin
    .from("organizations")
    .select("id, name, slug, settings")
    .in("id", organizationIds)
    .is("deleted_at", null)
  .order("name")) as unknown as { data: Array<{ id: string; name: string; slug: string; settings?: { locale?: string } }> | null };
  const activeOrganizationIds = (organizations ?? []).map((organization) => organization.id);
  const selectedOrganizationId = (await cookies()).get("acct_ctrl_active_organization")?.value;
  const activeOrganizationId = selectedOrganizationId && activeOrganizationIds.includes(selectedOrganizationId) ? selectedOrganizationId : activeOrganizationIds[0];
  if (!activeOrganizationId) return NextResponse.json({ error: "Tidak ada organisasi aktif yang dapat digunakan." }, { status: 403 });
  const activeMembership = memberships.find((membership) => membership.organization_id === activeOrganizationId);
  const activeOrganization = organizations?.find((organization) => organization.id === activeOrganizationId);
  if (!activeMembership || !activeOrganization) return NextResponse.json({ error: "Organisasi aktif tidak ditemukan." }, { status: 403 });
  const organizationSettings = (activeOrganization as { settings?: { locale?: string } } | undefined)?.settings;

  return NextResponse.json({
    id: user.id,
    email: user.email ?? "",
    name: profile?.display_name ?? user.user_metadata?.full_name ?? user.email?.split("@")[0] ?? "",
    avatar_url: profile?.avatar_url ?? null,
    role: activeMembership.role,
    organization_id: activeMembership.organization_id,
    organization_name: activeOrganization?.name ?? "",
    organizations: (organizations ?? []).map((organization) => ({ ...organization, is_active: organization.id === activeOrganizationId })),
    locale: organizationSettings?.locale === "en-US" ? "en-US" : "id-ID",
  });
}
