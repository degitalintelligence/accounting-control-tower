import { NextRequest, NextResponse } from "next/server";
import { assistReview } from "@/lib/ai/openrouter-client";
import { logAudit } from "@/lib/audit/logger";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { aiReviewSchema, validationMessage, workItemIdQuerySchema } from "@/lib/validation/schemas";
import { getAuthContext, hasPermission } from "@/lib/authorization";
import { resolveOrganizationLocale } from "@/lib/ai/locale";

type ErrorShape = { message: string; code?: string; hint?: string; details?: string };
type Assignment = { profile_id: string; role: string; unassigned_at: string | null };
type AuthContext = { admin: ReturnType<typeof createServiceRoleClient>; userId: string; organizationId: string; membershipRole: string; locale: Awaited<ReturnType<typeof resolveOrganizationLocale>>; item: { id: string; organization_id: string; client_id: string; title: string; description: string | null; acceptance_criteria: string | null; status: string; checklist_template_id: string | null; assignments: Assignment[] } };

async function authorize(id: string): Promise<AuthContext | NextResponse> {
  const client = await createClient();
  const { data: { user } } = await client.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const admin = createServiceRoleClient();
  const membershipResult = await admin.from("memberships").select("organization_id, client_id, role").eq("profile_id", user.id).eq("is_active", true);
  const membership = membershipResult as unknown as { data: { organization_id: string; client_id: string | null; role: string }[] | null; error: ErrorShape | null };
  if (membership.error || !membership.data) return NextResponse.json({ error: "Organisasi tidak ditemukan." }, { status: 403 });
  const organizationIds = [...new Set(membership.data.map((entry) => entry.organization_id))];
  if (organizationIds.length !== 1) return NextResponse.json({ error: "Organisasi aktif tidak tunggal." }, { status: 409 });
  const organizationId = organizationIds[0];
  const itemResult = await admin.from("work_items").select("id, organization_id, client_id, title, description, acceptance_criteria, status, checklist_template_id, assignments(profile_id, role, unassigned_at)").eq("id", id).eq("organization_id", organizationId).is("deleted_at", null).single();
  const item = itemResult as unknown as { data: AuthContext["item"] | null; error: ErrorShape | null };
  if (item.error || !item.data) return NextResponse.json({ error: "Work item tidak ditemukan." }, { status: 404 });
  if (!membership.data.some((entry) => entry.organization_id === organizationId && (entry.client_id === null || entry.client_id === item.data!.client_id))) return NextResponse.json({ error: "Work item tidak ditemukan." }, { status: 404 });
  const scopedMembership = membership.data.find((entry) => entry.organization_id === organizationId && (entry.client_id === null || entry.client_id === item.data!.client_id));
  return { admin, userId: user.id, organizationId, membershipRole: scopedMembership?.role ?? "", locale: await resolveOrganizationLocale(admin, organizationId), item: item.data };
}

function canUseAssistant(auth: AuthContext) {
  const assigned = auth.item.assignments.some((entry) => entry.profile_id === auth.userId && !entry.unassigned_at && ["checker", "approver"].includes(entry.role));
  return assigned;
}

function contextFor(auth: AuthContext, checklist: { label: string; is_required: boolean; value: string | null; file_id: string | null }[]) {
  const checklistText = checklist.map((entry) => `${entry.is_required ? "Wajib" : "Opsional"}: ${entry.label} — ${entry.value?.trim() || (entry.file_id ? "File terlampir" : "Belum diisi")}`).join("\n");
  return [
    `Judul: ${auth.item.title.slice(0, 240)}`,
    `Deskripsi: ${(auth.item.description ?? "").slice(0, 600)}`,
    `Kriteria penerimaan: ${(auth.item.acceptance_criteria ?? "").slice(0, 600)}`,
    `Status: ${auth.item.status}`,
    "Checklist:",
    checklistText.slice(0, 2_000),
  ].join("\n");
}

export async function GET(request: NextRequest) {
  const parsed = workItemIdQuerySchema.safeParse({ work_item_id: request.nextUrl.searchParams.get("work_item_id") });
  if (!parsed.success) return NextResponse.json({ error: validationMessage(parsed.error) }, { status: 400 });
  const id = parsed.data.work_item_id;
  const auth = await authorize(id);
  if (auth instanceof NextResponse) return auth;
  const permissionContext = await getAuthContext();
  if (permissionContext.response) return permissionContext.response;
  if (!canUseAssistant(auth) && !(await hasPermission(permissionContext.context, "ai_review.view"))) return NextResponse.json({ error: "Anda tidak berwenang melihat AI Notes." }, { status: 403 });
  const result = await auth.admin.from("ai_review_notes").select("id, status, result, generated_by, reviewed_by, created_at, reviewed_at").eq("work_item_id", id).eq("organization_id", auth.organizationId).eq("client_id", auth.item.client_id).order("created_at", { ascending: false }).limit(10);
  const data = result as unknown as { data: unknown[] | null; error: ErrorShape | null };
  if (data.error) return NextResponse.json({ error: "Gagal mengambil AI Notes." }, { status: 500 });
  return NextResponse.json({ data: data.data ?? [], membership_role: auth.membershipRole });
}

export async function POST(request: NextRequest) {
  const parsedBody = aiReviewSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsedBody.success) return NextResponse.json({ error: validationMessage(parsedBody.error) }, { status: 400 });
  const body = parsedBody.data;
  const id = body.work_item_id;
  const auth = await authorize(id);
  if (auth instanceof NextResponse) return auth;
  const permissionContext = await getAuthContext();
  if (permissionContext.response) return permissionContext.response;
  if (!canUseAssistant(auth) && !(await hasPermission(permissionContext.context, "ai_review.use"))) return NextResponse.json({ error: "Anda tidak berwenang menggunakan AI review assistant." }, { status: 403 });
  if (body.action === "accept" || body.action === "reject") {
    if (!(await hasPermission(permissionContext.context, "ai_review.decide"))) return NextResponse.json({ error: "Anda tidak memiliki permission untuk menyelesaikan AI Notes." }, { status: 403 });
    if (!body.note_id) return NextResponse.json({ error: "note_id wajib diisi." }, { status: 400 });
    const status = body.action === "accept" ? "accepted" : "rejected";
    const update = await auth.admin.from("ai_review_notes").update({ status, reviewed_by: auth.userId, reviewed_at: new Date().toISOString() } as never).eq("id", body.note_id).eq("work_item_id", id).eq("organization_id", auth.organizationId).eq("client_id", auth.item.client_id).eq("status", "pending").select("id, status").single();
    const updated = update as unknown as { data: { id: string; status: string } | null; error: ErrorShape | null };
    if (updated.error || !updated.data) return NextResponse.json({ error: "AI Note tidak ditemukan atau sudah diproses." }, { status: 409 });
    await logAudit(auth.admin, { organizationId: auth.organizationId, actorId: auth.userId, action: `ai_review_note.${status}`, entityType: "ai_review_note", entityId: updated.data.id, newValue: { status } });
    return NextResponse.json({ data: updated.data });
  }
  const checklistResult = await auth.admin.from("checklist_responses").select("value, file_id, checklist_items!inner(label, is_required)").eq("work_item_id", id);
  const checklist = checklistResult as unknown as { data: { value: string | null; file_id: string | null; checklist_items: { label: string; is_required: boolean } }[] | null; error: ErrorShape | null };
  if (checklist.error) return NextResponse.json({ error: "Gagal memuat checklist." }, { status: 500 });
  const result = await assistReview(contextFor(auth, (checklist.data ?? []).map((entry) => ({ ...entry.checklist_items, value: entry.value, file_id: entry.file_id }))), auth.locale);
  const inserted = await auth.admin.from("ai_review_notes").insert({ organization_id: auth.organizationId, client_id: auth.item.client_id, work_item_id: id, generated_by: auth.userId, result, status: "pending" } as never).select("id, status, result, generated_by, created_at").single();
  const note = inserted as unknown as { data: unknown | null; error: ErrorShape | null };
  if (note.error || !note.data) return NextResponse.json({ error: "Gagal menyimpan AI Notes." }, { status: 500 });
  await logAudit(auth.admin, { organizationId: auth.organizationId, actorId: auth.userId, action: "ai_review_note.created", entityType: "ai_review_note", entityId: (note.data as { id: string }).id, newValue: { status: "pending" }, metadata: { completeness_count: result.completeness.length, anomaly_count: result.anomalies.length } });
  return NextResponse.json({ data: note.data }, { status: 201 });
}
