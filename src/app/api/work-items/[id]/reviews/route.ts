import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit/logger";
import { publishNotificationEvent } from "@/lib/notification/publisher";
import { transitionWorkItem } from "@/lib/work-engine/status-machine";
import type { AssignmentRole, WorkItemStatus } from "@/types/work-item";
import { reviewSchema, validationMessage } from "@/lib/validation/schemas";

type Context = { params: Promise<{ id: string }> };
type ErrorShape = { message: string; code?: string; hint?: string; details?: string };
type Admin = ReturnType<typeof createServiceRoleClient>;

async function authorize(id: string) {
  const client = await createClient();
  const { data: { user } } = await client.auth.getUser();
  if (!user) return { response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };

  const admin = createServiceRoleClient();
  const membershipResult = await admin.from("memberships").select("organization_id, role").eq("profile_id", user.id).eq("is_active", true).limit(1).single();
  const membership = membershipResult as unknown as { data: { organization_id: string; role: string } | null; error: ErrorShape | null };
  if (membership.error || !membership.data) return { response: NextResponse.json({ error: "Organisasi tidak ditemukan." }, { status: 403 }) };

  const itemResult = await admin.from("work_items").select("id, organization_id, status, risk_level, checklist_template_id, assignments(id, profile_id, role, unassigned_at)").eq("id", id).eq("organization_id", membership.data.organization_id).is("deleted_at", null).single();
  const item = itemResult as unknown as { data: { id: string; organization_id: string; status: WorkItemStatus; risk_level: string; checklist_template_id: string | null; assignments: { id: string; profile_id: string; role: string; unassigned_at: string | null }[] } | null; error: ErrorShape | null };
  if (item.error || !item.data) return { response: NextResponse.json({ error: "Work item tidak ditemukan." }, { status: 404 }) };

  const assignment = item.data.assignments.find((entry) => entry.profile_id === user.id && !entry.unassigned_at);
  const role = assignment?.role ?? (membership.data.role === "admin" ? "admin" : null);
  return { admin, userId: user.id, organizationId: membership.data.organization_id, item: item.data, role };
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

async function writeStatus(admin: Admin, item: { id: string; status: WorkItemStatus; risk_level: string }, next: WorkItemStatus, role: AssignmentRole | "system" | "admin", userId: string, reason?: string) {
  const result = transitionWorkItem(item, next, role, reason);
  if (!result.success) throw new Error(result.error);
  const update = await admin.from("work_items").update({ status: next, updated_at: new Date().toISOString(), ...(next === "completed" ? { completed_at: new Date().toISOString() } : {}) } as never).eq("id", item.id);
  const updateData = update as unknown as { error: ErrorShape | null };
  if (updateData.error) throw new Error(updateData.error.message);
  const history = await admin.from("work_item_status_history").insert({ work_item_id: item.id, from_status: item.status, to_status: next, changed_by: userId, reason: reason ?? null } as never);
  const historyData = history as unknown as { error: ErrorShape | null };
  if (historyData.error) throw new Error(historyData.error.message);
  item.status = next;
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

  if (kind === "review" && item.status === "submitted") await writeStatus(admin!, item, "under_review", "checker", userId);
  if (decision === "approved") {
    const checklist = await getChecklistState(admin!, item);
    if (!checklist.complete) return NextResponse.json({ error: "Checklist wajib belum lengkap.", missing_checklist: checklist.missing }, { status: 422 });
  }

  if (kind === "review") {
    const inserted = await admin!.from("reviews").insert({ work_item_id: id, reviewer_id: userId, decision, comment: body.comment?.trim() || null, checklist_template_id: item.checklist_template_id } as never).select("id").single();
    const review = inserted as unknown as { data: { id: string } | null; error: ErrorShape | null };
    if (review.error || !review.data) return NextResponse.json({ error: "Gagal menyimpan review." }, { status: 500 });
    const findings = (body.findings ?? []).filter((finding) => finding.description?.trim()).map((finding) => ({ review_id: review.data!.id, checklist_item_id: finding.checklist_item_id ?? null, finding_type: finding.finding_type ?? "observation", description: finding.description!.trim(), severity: finding.severity ?? null }));
    if (findings.length) await admin!.from("review_findings").insert(findings as never);
    if (decision === "approved") {
      await writeStatus(admin!, item, "approved", "checker", userId);
      if (item.risk_level === "high" || item.risk_level === "critical") await writeStatus(admin!, item, "awaiting_approval", "system", userId);
    } else await writeStatus(admin!, item, "revision_required", "checker", userId, body.comment ?? "Review memerlukan revisi.");
    await logAudit(admin!, { organizationId, actorId: userId, action: "review.created", entityType: "review", entityId: review.data.id, newValue: { work_item_id: id, decision }, metadata: { finding_count: findings.length } });
  } else {
    const inserted = await admin!.from("approvals").insert({ work_item_id: id, approver_id: userId, decision, comment: body.comment?.trim() || null } as never).select("id").single();
    const approval = inserted as unknown as { data: { id: string } | null; error: ErrorShape | null };
    if (approval.error || !approval.data) return NextResponse.json({ error: "Gagal menyimpan approval." }, { status: 500 });
    await writeStatus(admin!, item, decision === "approved" ? "completed" : "revision_required", "approver", userId, body.comment ?? "Approval memerlukan revisi.");
    await logAudit(admin!, { organizationId, actorId: userId, action: "approval.created", entityType: "approval", entityId: approval.data.id, newValue: { work_item_id: id, decision } });
  }

  const recipients = activeAssignments.filter((entry) => entry.profile_id !== userId && (entry.role === "maker" || entry.role === "checker" || entry.role === "approver")).map((entry) => entry.profile_id);
  if (recipients.length) await publishNotificationEvent(admin!, { eventType: kind === "review" ? (decision === "approved" ? "review_approved" : "review_requested") : "review_approved", organizationId, aggregateType: "work_item", aggregateId: id, profileIds: recipients, title: kind === "review" ? "Review work item diperbarui" : "Approval work item diperbarui", body: body.comment?.trim() || null, data: { decision, kind }, dedupKey: `${kind}:${id}:${decision}:${userId}` });
  return NextResponse.json({ data: { decision, kind } }, { status: 201 });
}
