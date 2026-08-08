import { NextResponse } from "next/server";
import { getSuggestionContext, suggestionError } from "@/lib/whatsapp/suggestions";
import { getAuthContext, requirePermission } from "@/lib/authorization";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const { user, organizationId, admin } = await getSuggestionContext();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!organizationId || !admin) return NextResponse.json({ error: "Organisasi tidak ditemukan." }, { status: 403 });
  const auth = await getAuthContext();
  if (auth.response) return auth.response;
  const denied = await requirePermission(auth.context, "integrations.manage");
  if (denied) return denied;
  const body = await request.json().catch(() => ({})) as { duration_minutes?: number };
  const result = await admin.rpc("claim_action_suggestion" as never, { p_suggestion_id: id, p_organization_id: organizationId, p_claimed_by: user.id, p_claim_duration_minutes: body.duration_minutes ?? 30 } as never);
  const typed = result as unknown as { data: unknown[] | null; error: unknown };
  if (typed.error) {
    console.error("[POST /api/wa-suggestions/:id/claim] Supabase error:", suggestionError(typed.error));
    return NextResponse.json({ error: "Suggestion tidak dapat di-claim. Mungkin sedang direview user lain." }, { status: 409 });
  }
  const data = typed.data?.[0];
  if (!data) return NextResponse.json({ error: "Suggestion tidak ditemukan atau sudah diproses." }, { status: 404 });
  return NextResponse.json({ data });
}
