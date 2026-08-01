import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { getUserOrganizationId } from "@/lib/checklists";
import { canManageOrganization } from "@/lib/authorization";
import type { AssignmentRole } from "@/types/work-item";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const admin = createServiceRoleClient();
  const organizationId = await getUserOrganizationId(admin, user.id);
  if (!organizationId) return NextResponse.json({ error: "Organisasi tidak ditemukan." }, { status: 403 });
  const memberships = await admin.from("memberships").select("role").eq("organization_id", organizationId).eq("profile_id", user.id).eq("is_active", true);
  const membershipData = memberships as unknown as { data: { role?: string }[] | null };
  if (!canManageOrganization(membershipData.data?.[0]?.role)) return NextResponse.json({ error: "Akses hanya tersedia untuk manager." }, { status: 403 });
  const result = await admin
    .from("checklist_templates")
    .select("id, organization_id, name, description, target_role, created_at, updated_at, checklist_items(id, checklist_template_id, label, input_type, is_required, sort_order, validation_rules, created_at)")
    .eq("organization_id", organizationId)
    .eq("is_active", true)
    .is("deleted_at", null)
    .is("checklist_items.deleted_at", null)
    .order("created_at", { ascending: false });
  const data = result as unknown as { data: unknown[] | null; error: { message: string; code: string; hint: string; details: string } | null };
  if (data.error) return NextResponse.json({ error: "Gagal mengambil template checklist." }, { status: 500 });
  return NextResponse.json({ data: data.data ?? [] });
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const admin = createServiceRoleClient();
  const organizationId = await getUserOrganizationId(admin, user.id);
  if (!organizationId) return NextResponse.json({ error: "Organisasi tidak ditemukan." }, { status: 403 });
  const memberships = await admin.from("memberships").select("role").eq("organization_id", organizationId).eq("profile_id", user.id).eq("is_active", true);
  const membershipData = memberships as unknown as { data: { role?: string }[] | null };
  if (!canManageOrganization(membershipData.data?.[0]?.role)) return NextResponse.json({ error: "Akses hanya tersedia untuk manager." }, { status: 403 });
  const body = await request.json() as {
    name?: string;
    description?: string | null;
    target_role?: AssignmentRole;
    items?: { label?: string; input_type?: string; is_required?: boolean; sort_order?: number; validation_rules?: Record<string, unknown> }[];
  };
  if (!body.name?.trim()) return NextResponse.json({ error: "name wajib diisi." }, { status: 400 });
  const targetRole = body.target_role ?? "maker";
  if (!["maker", "checker", "approver"].includes(targetRole)) return NextResponse.json({ error: "target_role tidak valid." }, { status: 400 });
  const templateResult = await admin.from("checklist_templates").insert({
    organization_id: organizationId,
    name: body.name.trim(),
    description: body.description ?? null,
    target_role: targetRole,
  } as never).select("id, organization_id, name, description, target_role, created_at, updated_at").single();
  const template = templateResult as unknown as { data: { id: string } | null; error: { message: string; code: string; hint: string; details: string } | null };
  if (template.error || !template.data) return NextResponse.json({ error: "Gagal membuat template checklist." }, { status: 500 });
  const items = (body.items ?? []).filter((item) => item.label?.trim()).map((item, index) => ({
    checklist_template_id: template.data!.id,
    label: item.label!.trim(),
    input_type: ["checkbox", "text", "number", "date", "file", "url", "confirmation"].includes(item.input_type ?? "") ? item.input_type : "checkbox",
    is_required: item.is_required ?? false,
    sort_order: item.sort_order ?? index,
    validation_rules: item.validation_rules ?? {},
  }));
  if (items.length) {
    const itemResult = await admin.from("checklist_items").insert(items as never);
    const itemData = itemResult as unknown as { error: { message: string; code: string; hint: string; details: string } | null };
    if (itemData.error) {
      await admin.from("checklist_templates").update({ is_active: false, deleted_at: new Date().toISOString() } as never).eq("id", template.data.id);
      return NextResponse.json({ error: "Gagal menyimpan item checklist." }, { status: 500 });
    }
  }
  return NextResponse.json({ data: { ...template.data, items } }, { status: 201 });
}
