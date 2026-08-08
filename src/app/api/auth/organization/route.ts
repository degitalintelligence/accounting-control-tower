import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";

const schema = z.object({ organization_id: z.string().trim().min(1).max(120) });
const ACTIVE_ORGANIZATION_COOKIE = "acct_ctrl_active_organization";

export async function POST(request: Request) {
  const client = await createClient();
  const { data: { user } } = await client.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rawBody = await request.json().catch(() => null);
  const parsed = schema.safeParse(rawBody);
  if (!parsed.success) return NextResponse.json({ error: "Organisasi belum valid." }, { status: 400 });

  const admin = createServiceRoleClient();
  const membershipQuery = admin
    .from("memberships")
    .select("organization_id")
    .eq("profile_id", user.id)
    .eq("is_active", true);
  const { data: memberships, error: membershipError } = await membershipQuery as unknown as { data: Array<{ organization_id: string }> | null; error: { message: string } | null };
  if (membershipError) return NextResponse.json({ error: "Gagal memvalidasi organisasi." }, { status: 500 });
  const requestedOrganizationId = parsed.data.organization_id;
  const membership = (memberships ?? []).find((item) => item.organization_id === requestedOrganizationId);
  let selectedOrganizationId = membership?.organization_id;
  if (!selectedOrganizationId) {
    const { data: organization } = await admin
      .from("organizations")
      .select("id")
      .eq("slug", requestedOrganizationId)
      .is("deleted_at", null)
      .maybeSingle() as unknown as { data: { id: string } | null };
    selectedOrganizationId = organization?.id;
  }
  const selectedMembership = (memberships ?? []).find((item) => item.organization_id === selectedOrganizationId);
  if (!selectedMembership) return NextResponse.json({ error: "Anda tidak memiliki akses ke organisasi ini." }, { status: 403 });
  const { data: activeOrganization } = await admin.from("organizations").select("id").eq("id", selectedMembership.organization_id).is("deleted_at", null).maybeSingle();
  if (!activeOrganization) return NextResponse.json({ error: "Organisasi ini sudah diarsipkan dan tidak dapat dipilih." }, { status: 410 });

  const cookieStore = await cookies();
  cookieStore.set(ACTIVE_ORGANIZATION_COOKIE, selectedMembership.organization_id, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 30 });
  return NextResponse.json({ organization_id: selectedMembership.organization_id });
}
