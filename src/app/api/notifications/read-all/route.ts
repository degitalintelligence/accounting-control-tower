import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/authorization";
import { structuredSupabaseError } from "@/lib/supabase/error";

export async function PATCH() {
  const authorization = await getAuthContext();
  if (authorization.response) return authorization.response;
  const { admin, organizationId, userId } = authorization.context;

  const result = await (admin as { from: (table: string) => ReturnType<typeof admin.from> }).from("notifications")
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("profile_id", userId)
    .eq("organization_id", organizationId)
    .is("read_at", null)
    .select("id");
  const updated = result as unknown as { data: { id: string }[] | null; error: { message: string; code: string; hint: string; details: string } | null };
  if (updated.error) {
    console.error("[notifications/read-all] Update gagal:", structuredSupabaseError(updated.error));
    return NextResponse.json({ error: "Gagal menandai notifikasi." }, { status: 500 });
  }
  return NextResponse.json({ updated_count: updated.data?.length ?? 0 });
}
