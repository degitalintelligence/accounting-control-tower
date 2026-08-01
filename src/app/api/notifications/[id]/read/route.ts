import { NextResponse } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { structuredSupabaseError } from "@/lib/supabase/error";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(_request: Request, context: RouteContext) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await context.params;
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
    .eq("id", id)
    .eq("profile_id", user.id)
    .eq("organization_id", membership.data.organization_id)
    .is("read_at", null)
    .select("id, read_at")
    .maybeSingle();
  const updated = result as unknown as {
    data: { id: string; read_at: string } | null;
    error: { message: string; code: string; hint: string; details: string } | null;
  };

  if (updated.error) {
    console.error("[notifications/read] Update gagal:", structuredSupabaseError(updated.error));
    return NextResponse.json({ error: "Gagal menandai notifikasi." }, { status: 500 });
  }
  if (!updated.data) return NextResponse.json({ error: "Notifikasi tidak ditemukan." }, { status: 404 });
  return NextResponse.json(updated.data);
}
