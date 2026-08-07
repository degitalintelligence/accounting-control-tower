import { NextResponse } from "next/server";
import { getAuthContext, requirePermission } from "@/lib/authorization";

export async function GET() {
  const auth = await getAuthContext();
  if (auth.response) return auth.response;
  const denied = await requirePermission(auth.context, "dead_letters.view");
  if (denied) return denied;
  const result = await auth.context.admin.from("dead_letter_events").select("id, event_type, status, retry_count, last_retry_at, replayed_at, created_at, error_message, last_error", { count: "exact" }).eq("organization_id", auth.context.organizationId).eq("status", "pending").order("created_at", { ascending: true }).limit(100);

  if (result.error) return NextResponse.json({ error: result.error.message }, { status: 400 });
  const data = (result.data ?? []).map((item: { id: string; event_type: string; status: string; retry_count: number; last_retry_at: string | null; replayed_at: string | null; created_at: string; error_message: string | null; last_error: string | null }) => ({ id: item.id, event_type: item.event_type, status: item.status, retry_count: item.retry_count, last_retry_at: item.last_retry_at, replayed_at: item.replayed_at, created_at: item.created_at, error_message: item.error_message, last_error: item.last_error }));
  return NextResponse.json({ items: data, total: result.count ?? data.length, has_more: (result.count ?? data.length) > data.length });
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
