import { NextResponse } from "next/server";
import { getAuthContext, requirePermission } from "@/lib/authorization";
import { structuredSupabaseError } from "@/lib/supabase/error";

const PUBLIC_DEAD_LETTER_COLUMNS =
  "id, event_type, status, retry_count, last_retry_at, replayed_at, created_at";
const GENERIC_ERROR = "Operasi dead-letter gagal diproses.";
const GENERIC_REPLAY_ERROR = "Replay gagal diproses.";

type PublicDeadLetter = {
  id: string;
  event_type: string;
  status: string;
  retry_count: number;
  last_retry_at: string | null;
  replayed_at: string | null;
  created_at: string;
};

function internalErrorResponse(error: unknown, status = 500) {
  console.error("Dead-letter operation failed", structuredSupabaseError(error));
  return NextResponse.json({ error: GENERIC_ERROR }, { status });
}

export async function GET() {
  const auth = await getAuthContext();
  if (auth.response) return auth.response;
  const denied = await requirePermission(auth.context, "dead_letters.view");
  if (denied) return denied;

  try {
    const result = await auth.context.admin
      .from("dead_letter_events")
      .select(PUBLIC_DEAD_LETTER_COLUMNS, { count: "exact" })
      .eq("organization_id", auth.context.organizationId)
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .limit(100);
    if (result.error) return internalErrorResponse(result.error);

    const items = (result.data ?? []).map((item: PublicDeadLetter): PublicDeadLetter => ({
      id: item.id,
      event_type: item.event_type,
      status: item.status,
      retry_count: item.retry_count,
      last_retry_at: item.last_retry_at ?? null,
      replayed_at: item.replayed_at ?? null,
      created_at: item.created_at,
    }));
    return NextResponse.json({
      items,
      total: result.count ?? items.length,
      has_more: (result.count ?? items.length) > items.length,
    });
  } catch (error) {
    return internalErrorResponse(error);
  }
}

export async function POST(request: Request) {
  const auth = await getAuthContext();
  if (auth.response) return auth.response;
  const denied = await requirePermission(auth.context, "dead_letters.manage");
  if (denied) return denied;

  let body: { id?: string; all?: boolean; limit?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request tidak valid." }, { status: 400 });
  }

  const db = auth.context.admin;
  if (body.all === true) {
    const limit = body.limit === undefined ? 25 : body.limit;
    if (!Number.isInteger(limit) || limit < 1 || limit > 25) {
      return NextResponse.json({ error: "Limit harus berupa bilangan bulat 1 sampai 25." }, { status: 400 });
    }

    try {
      const pending = await db
        .from("dead_letter_events")
        .select("id")
        .eq("organization_id", auth.context.organizationId)
        .eq("status", "pending")
        .order("created_at", { ascending: true })
        .limit(limit);
      if (pending.error) return internalErrorResponse(pending.error, 400);

      const results: { id: string; success: boolean; error?: string }[] = [];
      for (const item of pending.data ?? []) {
        try {
          const result = await db.rpc("replay_dead_letter_event", {
            p_dead_letter_id: item.id,
            p_actor_id: auth.context.userId,
          });
          if (result.error) {
            console.error("Dead-letter replay failed", structuredSupabaseError(result.error));
            results.push({ id: item.id, success: false, error: GENERIC_REPLAY_ERROR });
          } else {
            results.push({ id: item.id, success: true });
          }
        } catch (error) {
          console.error("Dead-letter replay threw", structuredSupabaseError(error));
          results.push({ id: item.id, success: false, error: GENERIC_REPLAY_ERROR });
        }
      }
      return NextResponse.json({
        processed: results.filter((item) => item.success).length,
        failed: results.filter((item) => !item.success).length,
        results,
      });
    } catch (error) {
      return internalErrorResponse(error, 400);
    }
  }

  if (!body.id) return NextResponse.json({ error: "Event wajib dipilih." }, { status: 400 });
  try {
    const result = await db.rpc("replay_dead_letter_event", {
      p_dead_letter_id: body.id,
      p_actor_id: auth.context.userId,
    });
    if (result.error) {
      console.error("Dead-letter replay failed", structuredSupabaseError(result.error));
      return NextResponse.json({ error: GENERIC_REPLAY_ERROR }, { status: 400 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Dead-letter replay threw", structuredSupabaseError(error));
    return NextResponse.json({ error: GENERIC_REPLAY_ERROR }, { status: 400 });
  }
}
