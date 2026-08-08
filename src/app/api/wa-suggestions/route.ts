import { NextResponse } from "next/server";
import { getSuggestionContext, suggestionError } from "@/lib/whatsapp/suggestions";
import { getAuthContext, requirePermission } from "@/lib/authorization";

export async function GET(request: Request) {
  const { user, organizationId, admin } = await getSuggestionContext();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!organizationId || !admin) return NextResponse.json({ error: "Organisasi tidak ditemukan." }, { status: 403 });
  const auth = await getAuthContext();
  if (auth.response) return auth.response;
  const denied = await requirePermission(auth.context, "integrations.manage");
  if (denied) return denied;

  try {
    const searchParams = new URL(request.url).searchParams;
    const status = searchParams.get("status");
    const requestedLimit = Number(searchParams.get("limit") ?? "0");
    const hasPagination = requestedLimit > 0 || searchParams.has("page");
    const page = Math.max(1, Number(searchParams.get("page") ?? "1") || 1);
    const limit = Math.min(100, Math.max(1, requestedLimit || 50));
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    let query = admin
      .from("action_suggestions")
      .select("id, source_type, source_reference_id, source_summary_id, source_metadata, evidence_message_ids, evidence_text, suggested_title, suggested_description, suggested_maker_id, suggested_checker_id, suggested_due_at, suggested_client_id, suggested_section_id, confidence, status, review_state, claimed_by, claimed_at, claim_expires_at, clarification_question, clarification_requested_at, clarification_response_text, clarification_response_at, created_at, updated_at, rejected_reason, created_work_item_id, decision_type, target_work_item_id, decision_note", hasPagination ? { count: "exact" } : undefined)
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false });

    if (status) query = query.eq("status", status);
    if (!auth.context.isOrgWide) query = query.in("suggested_client_id", auth.context.clientIds);
    if (hasPagination) query = query.range(from, to);

    const result = await query;
    const data = result as unknown as { data: unknown[] | null; count: number | null; error: unknown };
    if (data.error) {
      console.error("[GET /api/wa-suggestions] Supabase error:", suggestionError(data.error));
      return NextResponse.json({ error: "Gagal mengambil suggestion." }, { status: 500 });
    }
    return NextResponse.json({
      data: data.data ?? [],
      ...(hasPagination ? { total: data.count ?? 0, page, limit } : {}),
    });
  } catch (error) {
    console.error("[GET /api/wa-suggestions] Unexpected error:", suggestionError(error));
    return NextResponse.json({ error: "Terjadi kesalahan server." }, { status: 500 });
  }
}
