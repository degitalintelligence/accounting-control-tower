import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { canAccessClient, getAuthContext } from "@/lib/authorization";
import { logAudit } from "@/lib/audit/logger";
import { publishNotificationEvent } from "@/lib/notification/publisher";
import type { WorkItemStatus } from "@/types/work-item";
import { reviewSchema, validationMessage } from "@/lib/validation/schemas";

type Context = { params: Promise<{ id: string }> };
type ErrorShape = { message: string; code?: string; hint?: string; details?: string };
type Admin = ReturnType<typeof createServiceRoleClient>;

async function authorize(id: string) {
  const authContext = await getAuthContext();
  if (authContext.response) return { response: authContext.response };
  const { admin, organizationId, userId, isOrgWide, clientIds } = authContext.context;

  const itemResult = await admin.from("work_items").select("id, organization_id, status, risk_level, checklist_template_id, client_id, assignments(id, profile_id, role, unassigned_at)").eq("id", id).eq("organization_id", organizationId).is("deleted_at", null).single();
  const item = itemResult as unknown as { data: { id: string; organization_id: string; status: WorkItemStatus; risk_level: string; checklist_template_id: string | null; client_id: string | null; assignments: { id: string; profile_id: string; role: string; unassigned_at: string | null }[] } | null; error: ErrorShape | null };
  if (item.error || !item.data) return { response: NextResponse.json({ error: "Work item tidak ditemukan." }, { status: 404 }) };

  if (!canAccessClient(authContext.context, item.data.client_id)) return { response: NextResponse.json({ error: "Work item tidak ditemukan." }, { status: 404 }) };

  const assignment = item.data.assignments.find((entry) => entry.profile_id === userId && !entry.unassigned_at);
  const activeMembership = authContext.context.memberships.find((m) => m.client_id === null || m.client_id === item.data!.client_id);
  const role = assignment?.role ?? (activeMembership?.role === "admin" ? "admin" : null);
  return { admin, userId, organizationId, item: item.data, role };
}

async function getChecklistState(admin: Admin, item: { id: string; checklist_template_id: string | null }) {
  if (!item.checklist_template_id) return { complete: true, missing: [] as string[] };
  const itemsResult = await admin.from("checklist_items").select("id, label, is_required").eq("checklist_template_id", item.checklist_template_id).eq("is_required", true);
  const responseResult = await admin.from("checklist_responses").select("checklist_item_id, value, file_id").eq("work_item_id", item.id);
  const items = itemsResult as unknown as { data: { id: string; label: string; is_required: boolean }[] | null; error: ErrorShape | null };
  const responses = responseResult as unknown as { data: { checklist_item_id: string; value: string | null; file_id: string | null }[] | null; error: ErrorShape | null };
  if (items.error || responses.error) throw new Error("Gagal memvalidasi checklist.");
  const completed = new Set((responses.data ?? []).filter((entry) => Boolean(entry.value?.trim()) || Boolean(entry.file_id)).map((entry) => entry.checklist_item_id));
  const missing = (items.data ?? []).filter((entry) => !completed.has(entry.id)).map((entry) => entry.label);
  return { complete: missing.length === 0, missing };
}

export async function GET(_request: NextRequest, context: Context) {
  const { id } = await context.params;
  const auth = await authorize(id);
  if (auth.response) return auth.response;
  const { admin } = auth;
  const reviewsResult = await admin!.from("reviews").select("id, work_item_id, reviewer_id, decision, comment, checklist_template_id, created_at, review_findings(id, review_id, checklist_item_id, finding_type, description, severity, created_at), profiles!reviews_reviewer_id_fkey(display_name)").eq("work_item_id", id).order("created_at", { ascending: false });
  const approvalsResult = await admin!.from("approvals").select("id, work_item_id, approver_id, decision, comment, created_at, profiles!approvals_approver_id_fkey(display_name)").eq("work_item_id", id).order("created_at", { ascending: false });
  const reviews = reviewsResult as unknown as { data: Record<string, unknown>[] | null; error: ErrorShape | null };
  const approvals = approvalsResult as unknown as { data: Record<string, unknown>[] | null; error: ErrorShape | null };
  if (reviews.error || approvals.error) return NextResponse.json({ error: "Gagal mengambil riwayat review." }, { status: 500 });
  return NextResponse.json({ data: { reviews: reviews.data ?? [], approvals: approvals.data ?? [], role: auth.role } });
}

export async function POST(request: NextRequest, context: Context) {
  const { id } = await context.params;
  const auth = await authorize(id);
  if (auth.response) return auth.response;
  const { admin, item, userId, organizationId, role } = auth;
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Payload JSON tidak valid." }, { status: 400 });
  }
  const parsed = reviewSchema.safeParse(payload);
  if (!parsed.success) return NextResponse.json({ error: validationMessage(parsed.error) }, { status: 400 });
  const body = parsed.data;
  const { kind, decision } = body;
  if (kind === "review" && role !== "checker") return NextResponse.json({ error: "Hanya checker yang dapat melakukan review." }, { status: 403 });
  if (kind === "approval" && role !== "approver") return NextResponse.json({ error: "Hanya approver yang dapat melakukan approval." }, { status: 403 });
  if (kind === "review" && !["submitted", "under_review"].includes(item.status)) return NextResponse.json({ error: "Work item belum berada pada tahap review." }, { status: 409 });
  if (kind === "approval" && item.status !== "awaiting_approval") return NextResponse.json({ error: "Work item belum menunggu approval." }, { status: 409 });

  const activeAssignments = item.assignments.filter((entry) => !entry.unassigned_at);
  const maker = activeAssignments.find((entry) => entry.role === "maker")?.profile_id;
  const checker = activeAssignments.find((entry) => entry.role === "checker")?.profile_id;
  if ((kind === "review" && userId === maker) || (kind === "approval" && (userId === maker || userId === checker))) return NextResponse.json({ error: "Pelanggaran separation of duties." }, { status: 403 });
  if (decision !== "approved" && !body.comment?.trim() && !(body.findings?.length)) return NextResponse.json({ error: "Alasan atau finding wajib diisi untuk keputusan ini." }, { status: 400 });

  if (decision === "approved") {
    const checklist = await getChecklistState(admin!, item);
    if (!checklist.complete) return NextResponse.json({ error: "Checklist wajib belum lengkap.", missing_checklist: checklist.missing }, { status: 422 });
  }

  if (kind === "review") {
    const rpc = await admin!.rpc("record_review_decision" as never, {
      p_work_item_id: id,
      p_actor_id: userId,
      p_kind: kind,
      p_decision: decision,
      p_comment: body.comment?.trim() || null,
      p_checklist_template_id: item.checklist_template_id,
      p_findings: body.findings ?? [],
    } as never);
    const review = rpc as unknown as { data: { id: string; [key: string]: unknown } | null; error: ErrorShape | null };
    if (review.error || !review.data) return NextResponse.json({ error: review.error?.message ?? "Gagal menyimpan review." }, { status: 409 });
    await logAudit(admin!, { organizationId, actorId: userId, action: "review.created", entityType: "review", entityId: review.data.id, newValue: { work_item_id: id, decision }, metadata: { finding_count: body.findings?.length ?? 0, transaction: "record_review_decision" } });
  } else {
    const rpc = await admin!.rpc("record_review_decision" as never, {
      p_work_item_id: id,
      p_actor_id: userId,
      p_kind: kind,
      p_decision: decision,
      p_comment: body.comment?.trim() || null,
      p_checklist_template_id: null,
      p_findings: [],
    } as never);
    const approval = rpc as unknown as { data: { id: string; [key: string]: unknown } | null; error: ErrorShape | null };
    if (approval.error || !approval.data) return NextResponse.json({ error: approval.error?.message ?? "Gagal menyimpan approval." }, { status: 409 });
    await logAudit(admin!, { organizationId, actorId: userId, action: "approval.created", entityType: "approval", entityId: approval.data.id, newValue: { work_item_id: id, decision, transaction: "record_review_decision" } });
  }

  const recipients = activeAssignments.filter((entry) => entry.profile_id !== userId && (entry.role === "maker" || entry.role === "checker" || entry.role === "approver")).map((entry) => entry.profile_id);
  if (recipients.length) await publishNotificationEvent(admin!, { eventType: kind === "review" ? (decision === "approved" ? "review_approved" : "review_requested") : "review_approved", organizationId, aggregateType: "work_item", aggregateId: id, profileIds: recipients, title: kind === "review" ? "Review work item diperbarui" : "Approval work item diperbarui", body: body.comment?.trim() || null, data: { decision, kind }, dedupKey: `${kind}:${id}:${decision}:${userId}` });
  return NextResponse.json({ data: { decision, kind } }, { status: 201 });
}
