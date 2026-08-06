import { NextResponse } from "next/server";
import { getSuggestionContext, suggestionError } from "@/lib/whatsapp/suggestions";
import { getAuthContext, requirePermission } from "@/lib/authorization";
import { z } from "zod";

type RouteContext = { params: Promise<{ id: string }> };

const requestSchema = z.object({ question: z.string().trim().min(5).max(2000) });

export async function POST(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const parsed = requestSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Pertanyaan klarifikasi wajib diisi (5–2000 karakter)." }, { status: 400 });

  const { user, organizationId, admin } = await getSuggestionContext();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!organizationId || !admin) return NextResponse.json({ error: "Organisasi tidak ditemukan." }, { status: 403 });
  const auth = await getAuthContext();
  if (auth.response) return auth.response;
  const denied = await requirePermission(auth.context, "integrations.manage");
  if (denied) return denied;

  const result = await admin.rpc("request_action_suggestion_clarification" as never, {
    p_suggestion_id: id,
    p_organization_id: organizationId,
    p_requested_by: user.id,
    p_question: parsed.data.question,
  } as never);
  const clarification = result as unknown as { data: Array<{ id: string; review_state: string; clarification_question: string; clarification_requested_at: string }> | null; error: unknown };
  if (clarification.error || !clarification.data?.[0]) {
    const error = suggestionError(clarification.error);
    const message = error.message ?? "Gagal meminta klarifikasi.";
    const status = message.includes("tidak sedang direview") || message.includes("tidak tersedia") ? 409 : 500;
    console.error("[POST /api/wa-suggestions/:id/clarify] Supabase error:", error);
    return NextResponse.json({ error: status === 409 ? message : "Gagal meminta klarifikasi." }, { status });
  }
  return NextResponse.json({ data: clarification.data[0] });
}
