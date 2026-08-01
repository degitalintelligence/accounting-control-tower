import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { getUserOrganizationId } from "@/lib/checklists";
import { checklistResponseSchema, validationMessage } from "@/lib/validation/schemas";

type Context = { params: Promise<{ id: string }> };

async function authorize(context: Context) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  const admin = createServiceRoleClient();
  const organizationId = await getUserOrganizationId(admin, user.id);
  if (!organizationId) return { response: NextResponse.json({ error: "Organisasi tidak ditemukan." }, { status: 403 }) };
  const { id } = await context.params;
  const workItem = await admin.from("work_items").select("id, checklist_template_id, assignments(profile_id, role, unassigned_at)").eq("id", id).eq("organization_id", organizationId).is("deleted_at", null).single();
  const data = workItem as unknown as { data: { id: string; checklist_template_id: string | null; assignments: { profile_id: string; role: string; unassigned_at: string | null }[] } | null; error: { message: string } | null };
  if (data.error || !data.data) return { response: NextResponse.json({ error: "Work item tidak ditemukan." }, { status: 404 }) };
  return { admin, id, userId: user.id, templateId: data.data.checklist_template_id, assignments: data.data.assignments };
}

export async function GET(_request: NextRequest, context: Context) {
  const auth = await authorize(context);
  if (auth.response) return auth.response;
  if (!auth.templateId) return NextResponse.json({ data: { template: null, responses: [], required_total: 0, required_completed: 0 } });
  const organizationId = await getUserOrganizationId(auth.admin!, auth.userId);
  const templateResult = organizationId
    ? await auth.admin!.from("checklist_templates").select("id, organization_id, name, description, target_role, is_active, created_at, updated_at, checklist_items(id, checklist_template_id, label, input_type, is_required, sort_order, validation_rules, created_at)").eq("id", auth.templateId).eq("organization_id", organizationId).single()
    : { data: null, error: { message: "Organisasi tidak ditemukan." } };
  const responseResult = await auth.admin!.from("checklist_responses").select("id, work_item_id, checklist_item_id, profile_id, value, file_id, created_at, updated_at").eq("work_item_id", auth.id);
  const templateData = templateResult as unknown as { data: Record<string, unknown> | null; error: { message: string } | null };
  const responsesData = responseResult as unknown as { data: Record<string, unknown>[] | null; error: { message: string } | null };
  if (templateData.error || responsesData.error) return NextResponse.json({ error: "Gagal mengambil checklist." }, { status: 500 });
  const items = (templateData.data?.checklist_items as { id: string; is_required: boolean }[] | undefined) ?? [];
  const responses = responsesData.data ?? [];
  const completed = new Set(responses.filter((item) => Boolean(item.value) || Boolean(item.file_id)).map((item) => item.checklist_item_id));
  return NextResponse.json({ data: { template: templateData.data, responses, required_total: items.filter((item) => item.is_required).length, required_completed: items.filter((item) => item.is_required && completed.has(item.id)).length } });
}

export async function PATCH(request: NextRequest, context: Context) {
  const auth = await authorize(context);
  if (auth.response) return auth.response;
  const parsed = checklistResponseSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: validationMessage(parsed.error) }, { status: 400 });
  const body = parsed.data;
  if (!auth.templateId) return NextResponse.json({ error: "Work item belum memiliki template checklist." }, { status: 400 });
  const organizationId = await getUserOrganizationId(auth.admin!, auth.userId);
  const membership = organizationId
    ? await auth.admin!.from("memberships").select("role").eq("profile_id", auth.userId).eq("organization_id", organizationId).eq("is_active", true).limit(1).maybeSingle()
    : { data: null, error: null };
  const membershipData = membership as unknown as { data: { role: string } | null };
  const templateRole = await auth.admin!.from("checklist_templates").select("target_role").eq("id", auth.templateId).single();
  const templateRoleData = templateRole as unknown as { data: { target_role: string } | null };
  const assigned = auth.assignments.some((entry) => entry.profile_id === auth.userId && !entry.unassigned_at && entry.role === templateRoleData.data?.target_role);
  const manager = ["admin", "manager", "finance_manager", "accounting_manager"].includes(membershipData.data?.role ?? "");
  if (!assigned && !manager) return NextResponse.json({ error: "Anda tidak berwenang mengubah checklist ini." }, { status: 403 });
  const item = await auth.admin!.from("checklist_items").select("id, input_type, validation_rules").eq("id", body.checklist_item_id).eq("checklist_template_id", auth.templateId).single();
  const itemData = item as unknown as { data: { id: string; input_type: string; validation_rules: Record<string, unknown> } | null; error: { message: string } | null };
  if (itemData.error || !itemData.data) return NextResponse.json({ error: "Item checklist tidak valid." }, { status: 400 });
  if (body.file_id) {
    const fileResult = await auth.admin!.from("work_item_files").select("file_id").eq("work_item_id", auth.id).eq("file_id", body.file_id).maybeSingle();
    const fileData = fileResult as unknown as { data: { file_id: string } | null; error: { message: string } | null };
    if (fileData.error || !fileData.data) return NextResponse.json({ error: "File tidak terhubung ke work item ini." }, { status: 400 });
  }
  const value = body.value?.trim() ?? null;
  const rules = itemData.data.validation_rules ?? {};
  if (itemData.data.input_type === "number" && value !== null && (value === "" || !Number.isFinite(Number(value)))) return NextResponse.json({ error: "Nilai harus berupa angka." }, { status: 400 });
  if (itemData.data.input_type === "url" && value !== null) {
    try { new URL(value); } catch { return NextResponse.json({ error: "URL checklist tidak valid." }, { status: 400 }); }
  }
  if (itemData.data.input_type === "confirmation" && value !== null && value !== "true") return NextResponse.json({ error: "Konfirmasi harus bernilai benar." }, { status: 400 });
  if (typeof rules.min_length === "number" && value !== null && value.length < rules.min_length) return NextResponse.json({ error: "Nilai checklist terlalu pendek." }, { status: 400 });
  if (typeof rules.max_length === "number" && value !== null && value.length > rules.max_length) return NextResponse.json({ error: "Nilai checklist terlalu panjang." }, { status: 400 });
  if (itemData.data.input_type === "file" && !body.file_id) return NextResponse.json({ error: "File wajib dilampirkan." }, { status: 400 });
  const result = await auth.admin!.from("checklist_responses").upsert({ work_item_id: auth.id, checklist_item_id: body.checklist_item_id, profile_id: auth.userId, value: body.value ?? null, file_id: body.file_id ?? null, updated_at: new Date().toISOString() } as never, { onConflict: "work_item_id,checklist_item_id,profile_id" }).select().single();
  const data = result as unknown as { data: unknown; error: { message: string } | null };
  if (data.error) return NextResponse.json({ error: "Gagal menyimpan checklist." }, { status: 500 });
  return NextResponse.json({ data: data.data });
}
