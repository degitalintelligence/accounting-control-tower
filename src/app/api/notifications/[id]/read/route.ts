import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/authorization";
import { structuredSupabaseError } from "@/lib/supabase/error";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  const authorization = await getAuthContext();
  if (authorization.response) return authorization.response;
  const { admin, organizationId, userId } = authorization.context;

  const result = await (admin as { from: (table: string) => ReturnType<typeof admin.from> }).from("notifications")
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", id)
    .eq("profile_id", userId)
    .eq("organization_id", organizationId)
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
