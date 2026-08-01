import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getAuthContext, canManageOrganization } from "@/lib/authorization";

export async function GET() {
  const auth = await getAuthContext();
  if (auth.response) return auth.response;
  if (!canManageOrganization(auth.context.memberships.find((item) => item.client_id === null)?.role)) return NextResponse.json({ error: "Akses ditolak." }, { status: 403 });
  const result = await auth.context.admin.from("dead_letter_events").select("id, event_type, payload, error_message, retry_count, last_retry_at, created_at").order("created_at", { ascending: false }).limit(100);
  if (result.error) return NextResponse.json({ error: result.error.message }, { status: 400 });
  return NextResponse.json(result.data ?? []);
}

export async function POST(request: Request) {
  const auth = await getAuthContext();
  if (auth.response) return auth.response;
  if (!canManageOrganization(auth.context.memberships.find((item) => item.client_id === null)?.role)) return NextResponse.json({ error: "Akses ditolak." }, { status: 403 });
  const body = await request.json() as { id?: string };
  if (!body.id) return NextResponse.json({ error: "Event wajib dipilih." }, { status: 400 });
  const db = auth.context.admin as unknown as SupabaseClient;
  const event = await db.from("dead_letter_events").select("id, event_type, payload, retry_count").eq("id", body.id).maybeSingle();
  if (!event.data) return NextResponse.json({ error: "Event tidak ditemukan." }, { status: 404 });
  const result = await db.from("dead_letter_events").update({ retry_count: event.data.retry_count + 1, last_retry_at: new Date().toISOString() }).eq("id", body.id).select("id, event_type, payload, error_message, retry_count, last_retry_at, created_at").single();
  if (result.error) return NextResponse.json({ error: result.error.message }, { status: 400 });
  return NextResponse.json(result.data);
}
