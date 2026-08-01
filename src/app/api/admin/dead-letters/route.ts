import { NextResponse } from "next/server";
import { getAuthContext, canManageOrganization } from "@/lib/authorization";

export async function GET() {
  const auth = await getAuthContext();
  if (auth.response) return auth.response;
  if (!canManageOrganization(auth.context.memberships.find((item) => item.client_id === null)?.role)) return NextResponse.json({ error: "Akses ditolak." }, { status: 403 });
  const result = await auth.context.admin.from("dead_letter_events").select("id, organization_id, outbox_event_id, event_type, payload, error_message, last_error, status, retry_count, last_retry_at, replayed_at, created_at").eq("organization_id", auth.context.organizationId).order("created_at", { ascending: false }).limit(100);
  if (result.error) return NextResponse.json({ error: result.error.message }, { status: 400 });
  return NextResponse.json(result.data ?? []);
}

export async function POST(request: Request) {
  const auth = await getAuthContext();
  if (auth.response) return auth.response;
  if (!canManageOrganization(auth.context.memberships.find((item) => item.client_id === null)?.role)) return NextResponse.json({ error: "Akses ditolak." }, { status: 403 });
  const body = await request.json() as { id?: string };
  if (!body.id) return NextResponse.json({ error: "Event wajib dipilih." }, { status: 400 });
  const db = auth.context.admin as unknown as { rpc: (fn: string, args: Record<string, string>) => Promise<{ data: unknown; error: { message: string } | null }> };
  const result = await db.rpc("replay_dead_letter_event", { p_dead_letter_id: body.id, p_actor_id: auth.context.userId });
  if (result.error) return NextResponse.json({ error: result.error.message }, { status: 400 });
  return NextResponse.json({ data: result.data });
}
