import { NextResponse } from "next/server";
import { getSuggestionContext, suggestionError } from "@/lib/whatsapp/suggestions";
import { canManageOrganization } from "@/lib/authorization";
import { suggestionRejectSchema, validationMessage } from "@/lib/validation/schemas";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const { user, organizationId, role, admin } = await getSuggestionContext();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!organizationId || !admin) return NextResponse.json({ error: "Organisasi tidak ditemukan." }, { status: 403 });
  if (!canManageOrganization(role)) return NextResponse.json({ error: "Hanya manager yang dapat menolak suggestion." }, { status: 403 });

  const parsed = suggestionRejectSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: validationMessage(parsed.error) }, { status: 400 });
  const reason = parsed.data.reason;

  const result = await admin
    .from("action_suggestions")
    .update({ status: "rejected", confirmed_by: user.id, confirmed_at: new Date().toISOString(), rejected_reason: reason, updated_at: new Date().toISOString() } as never)
    .eq("id", id)
    .eq("organization_id", organizationId)
    .eq("status", "pending")
    .select("id, status, confirmed_by, confirmed_at, rejected_reason")
    .maybeSingle();
  const updated = result as unknown as { data: unknown; error: unknown };
  if (updated.error) {
    console.error("[POST /api/wa-suggestions/:id/reject] Supabase error:", suggestionError(updated.error));
    return NextResponse.json({ error: "Gagal menolak suggestion." }, { status: 500 });
  }
  if (!updated.data) return NextResponse.json({ error: "Suggestion tidak ditemukan atau sudah diproses." }, { status: 404 });
  return NextResponse.json({ data: updated.data });
}
