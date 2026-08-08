import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit/logger";
import { canAccessClient, getAuthContext, requirePermission } from "@/lib/authorization";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, context: Context) {
  const client = await createClient();
  const { data: { user } } = await client.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const auth = await getAuthContext();
  if (auth.response) return auth.response;
  const denied = await requirePermission(auth.context, "reports.manage");
  if (denied) return denied;
  const { admin, organizationId } = auth.context;
  const { id } = await context.params;
  let body: { stage?: string; delivery_reference?: string | null };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Payload JSON tidak valid." }, { status: 400 });
  }
  if (!body.stage) return NextResponse.json({ error: "Stage report wajib diisi." }, { status: 400 });
  const item = await admin.from("work_items").select("id, type, status, client_id, report_stage").eq("id", id).eq("organization_id", organizationId).is("deleted_at", null).maybeSingle();
  const itemData = item as unknown as { data: { id: string; type: string; status: string; client_id: string | null; report_stage: string } | null; error: { message: string } | null };
  if (itemData.error || !itemData.data || itemData.data.type !== "report") return NextResponse.json({ error: "Report tidak ditemukan." }, { status: 404 });
  if (!canAccessClient(auth.context, itemData.data.client_id)) return NextResponse.json({ error: "Report tidak ditemukan." }, { status: 404 });
  if (body.stage === "delivered" && itemData.data.status !== "approved") return NextResponse.json({ error: "Report harus berstatus Approved sebelum delivery." }, { status: 409 });
  const result = await admin.rpc("set_report_deliverable_stage" as never, { p_work_item_id: id, p_stage: body.stage, p_actor_id: user.id, p_delivery_reference: body.delivery_reference ?? null } as never);
  const rpc = result as unknown as { data: Record<string, unknown> | null; error: { message: string; code?: string; hint?: string; details?: string } | null };
  if (rpc.error) return NextResponse.json({ error: rpc.error.message }, { status: 409 });
  await logAudit(admin, { organizationId, actorId: user.id, action: "report.stage_changed", entityType: "work_item", entityId: id, oldValue: { report_stage: itemData.data.report_stage }, newValue: rpc.data });
  return NextResponse.json({ data: rpc.data });
}
