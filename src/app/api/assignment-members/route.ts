import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/authorization";

export async function GET() {
  const auth = await getAuthContext();
  if (auth.response) return auth.response;
  const { admin, organizationId } = auth.context;
  const result = await admin.from("memberships").select("profile_id, client_id, role, profiles!inner(id, display_name, email)").eq("organization_id", organizationId).eq("is_active", true).order("created_at", { ascending: true });
  const data = result as unknown as { data: { profile_id: string; client_id: string | null; role: string; profiles: { id: string; display_name: string; email: string | null } }[] | null; error: { message: string } | null };
  if (data.error) return NextResponse.json({ error: "Gagal memuat anggota." }, { status: 500 });
  const unique = new Map<string, { profile_id: string; name: string; email: string | null; role: string }>();
  for (const member of data.data ?? []) unique.set(member.profile_id, { profile_id: member.profile_id, name: member.profiles.display_name, email: member.profiles.email, role: member.role });
  return NextResponse.json({ data: [...unique.values()] });
}
