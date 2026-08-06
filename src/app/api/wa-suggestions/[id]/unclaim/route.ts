import { NextResponse } from "next/server";
import { getSuggestionContext, suggestionError } from "@/lib/whatsapp/suggestions";
import { getAuthContext, requirePermission } from "@/lib/authorization";
import { logAudit } from "@/lib/audit/logger";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(_: Request, context: RouteContext) {
  const { id } = await context.params;
  const { user, organizationId, admin } = await getSuggestionContext();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!organizationId || !admin) return NextResponse.json({ error: "Organisasi tidak ditemukan." }, { status: 403 });
  const auth = await getAuthContext();
  if (auth.response) return auth.response;
  const denied = await requirePermission(auth.context, "integrations.manage");
  if (denied) return denied;
  const result = await admin.rpc("release_action_suggestion_claim" as never, { p_suggestion_id: id, p_organization_id: organizationId, p_released_by: user.id } as never);
  const typed = result as unknown as { data: boolean | null; error: unknown };
  if (typed.error) {
    console.error("[POST /api/wa-suggestions/:id/unclaim] Supabase error:", suggestionError(typed.error));
    return NextResponse.json({ error: "Claim tidak dapat dilepas." }, { status: 500 });
  }
  if (!typed.data) return NextResponse.json({ error: "Claim tidak ditemukan atau bukan milik Anda." }, { status: 409 });
  await logAudit(admin, { organizationId, actorId: user.id, action: "wa_suggestion.unclaimed", entityType: "action_suggestion", entityId: id });
  return NextResponse.json({ data: { id, review_state: "unclaimed" } });
}
