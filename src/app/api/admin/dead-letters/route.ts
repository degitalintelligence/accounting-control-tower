import { NextResponse } from "next/server";
import { getAuthContext, requirePermission } from "@/lib/authorization";

export async function GET() {
  const auth = await getAuthContext();
  if (auth.response) return auth.response;
  const denied = await requirePermission(auth.context, "dead_letters.view");
  if (denied) return denied;
  const result = await auth.context.admin.from("dead_letter_events").select("id, event_type, status, retry_count, last_retry_at, replayed_at, created_at").eq("organization_id", auth.context.organizationId).order("created_at", { ascending: false }).limit(100);
  if (result.error) return NextResponse.json({ error: result.error.message }, { status: 400 });
  const data = (result.data ?? []).map((item: { id: string; event_type: string; status: string; retry_count: number; last_retry_at: string | null; replayed_at: string | null; created_at: string }) => ({ id: item.id, event_type: item.event_type, status: item.status, retry_count: item.retry_count, last_retry_at: item.last_retry_at, replayed_at: item.replayed_at, created_at: item.created_at }));
  return NextResponse.json(data);
}

export async function POST(request: Request) {
  const auth = await getAuthContext();
  if (auth.response) return auth.response;
  const denied = await requirePermission(auth.context, "dead_letters.manage");
  if (denied) return denied;
  const body = await request.json() as { id?: string };
  if (!body.id) return NextResponse.json({ error: "Event wajib dipilih." }, { status: 400 });
  const db = auth.context.admin as unknown as { rpc: (fn: string, args: Record<string, string>) => Promise<{ data: unknown; error: { message: string } | null }> };
  const result = await db.rpc("replay_dead_letter_event", { p_dead_letter_id: body.id, p_actor_id: auth.context.userId });
  if (result.error) return NextResponse.json({ error: result.error.message }, { status: 400 });
  return NextResponse.json({ data: result.data });
}
