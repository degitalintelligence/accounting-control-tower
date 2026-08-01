import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { getUserOrganizationId } from "@/lib/checklists";
import { checklistItemCreateSchema, checklistItemUpdateSchema, validationMessage } from "@/lib/validation/schemas";

type Context = { params: Promise<{ id: string }> };

async function authorize(context: Context) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  const admin = createServiceRoleClient();
  const organizationId = await getUserOrganizationId(admin, user.id);
  if (!organizationId) return { response: NextResponse.json({ error: "Organisasi tidak ditemukan." }, { status: 403 }) };
  const { id } = await context.params;
  const template = await admin.from("checklist_templates").select("id").eq("id", id).eq("organization_id", organizationId).single();
  const templateData = template as unknown as { data: { id: string } | null; error: { message: string } | null };
  if (templateData.error || !templateData.data) return { response: NextResponse.json({ error: "Template checklist tidak ditemukan." }, { status: 404 }) };
  return { admin, id };
}

export async function POST(request: NextRequest, context: Context) {
  const auth = await authorize(context);
  if (auth.response) return auth.response;
  const parsed = checklistItemCreateSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: validationMessage(parsed.error) }, { status: 400 });
  const body = parsed.data;
  const result = await auth.admin!.from("checklist_items").insert({
    checklist_template_id: auth.id,
    label: body.label.trim(),
    input_type: ["checkbox", "text", "number", "date"].includes(body.input_type ?? "") ? body.input_type : "checkbox",
    is_required: body.is_required ?? false,
    sort_order: body.sort_order ?? 0,
    validation_rules: body.validation_rules ?? {},
  } as never).select("id, checklist_template_id, label, input_type, is_required, sort_order, validation_rules, created_at").single();
  const data = result as unknown as { data: unknown; error: { message: string } | null };
  if (data.error) return NextResponse.json({ error: "Gagal menambah item checklist." }, { status: 500 });
  return NextResponse.json({ data: data.data }, { status: 201 });
}

export async function PATCH(request: NextRequest, context: Context) {
  const auth = await authorize(context);
  if (auth.response) return auth.response;
  const parsed = checklistItemUpdateSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: validationMessage(parsed.error) }, { status: 400 });
  const body = parsed.data;
  const { item_id, ...update } = body;
  const result = await auth.admin!.from("checklist_items").update(update as never).eq("id", item_id).eq("checklist_template_id", auth.id).select("id, checklist_template_id, label, input_type, is_required, sort_order, validation_rules, created_at").single();
  const data = result as unknown as { data: unknown; error: { message: string } | null };
  if (data.error) return NextResponse.json({ error: "Gagal mengubah item checklist." }, { status: 500 });
  return NextResponse.json({ data: data.data });
}
