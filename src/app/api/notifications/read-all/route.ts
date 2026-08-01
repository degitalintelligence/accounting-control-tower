import { NextResponse } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { structuredSupabaseError } from "@/lib/supabase/error";

export async function PATCH() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createServiceRoleClient();
  const membershipResult = await admin
    .from("memberships")
    .select("organization_id")
    .eq("profile_id", user.id)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();
  const membership = membershipResult as unknown as { data: { organization_id: string } | null };
  if (!membership.data) return NextResponse.json({ error: "Organisasi tidak ditemukan." }, { status: 403 });

  const result = await (admin as { from: (table: string) => ReturnType<typeof admin.from> }).from("notifications")
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("profile_id", user.id)
    .eq("organization_id", membership.data.organization_id)
    .is("read_at", null)
    .select("id");
  const updated = result as unknown as { data: { id: string }[] | null; error: { message: string; code: string; hint: string; details: string } | null };
  if (updated.error) {
    console.error("[notifications/read-all] Update gagal:", structuredSupabaseError(updated.error));
    return NextResponse.json({ error: "Gagal menandai notifikasi." }, { status: 500 });
  }
  return NextResponse.json({ updated_count: updated.data?.length ?? 0 });
}
