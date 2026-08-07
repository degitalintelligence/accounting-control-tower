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
  const body = await request.json() as { id?: string; all?: boolean; limit?: number };
  type Query = {
    eq: (column: string, value: string) => Query;
    order: (column: string, options: { ascending: boolean }) => Query;
    limit: (count: number) => Promise<{ data: { id: string }[] | null; error: { message: string } | null }>;
  };
  const db = auth.context.admin as unknown as {
    from: (table: string) => { select: (columns: string) => Query };
    rpc: (fn: string, args: Record<string, string>) => Promise<{ data: unknown; error: { message: string } | null }>;
  };

  if (body.all === true) {
    const limit = body.limit === undefined ? 25 : body.limit;
    if (!Number.isInteger(limit) || limit < 1 || limit > 25) return NextResponse.json({ error: "Limit harus berupa bilangan bulat 1 sampai 25." }, { status: 400 });
    const pending = await db.from("dead_letter_events").select("id").eq("organization_id", auth.context.organizationId).eq("status", "pending").order("created_at", { ascending: true }).limit(limit);
    if (pending.error) return NextResponse.json({ error: pending.error.message }, { status: 400 });

    const results: { id: string; success: boolean; error?: string }[] = [];
    for (const item of pending.data ?? []) {
      try {
        const result = await db.rpc("replay_dead_letter_event", { p_dead_letter_id: item.id, p_actor_id: auth.context.userId });
        results.push(result.error ? { id: item.id, success: false, error: result.error.message } : { id: item.id, success: true });
      } catch (error) {
        results.push({ id: item.id, success: false, error: error instanceof Error ? error.message : "Replay gagal diproses." });
      }
    }
    return NextResponse.json({ processed: results.filter((item) => item.success).length, failed: results.filter((item) => !item.success).length, results });
  }

  if (!body.id) return NextResponse.json({ error: "Event wajib dipilih." }, { status: 400 });
  const result = await db.rpc("replay_dead_letter_event", { p_dead_letter_id: body.id, p_actor_id: auth.context.userId });
  if (result.error) return NextResponse.json({ error: result.error.message }, { status: 400 });
  return NextResponse.json({ data: result.data });
}
