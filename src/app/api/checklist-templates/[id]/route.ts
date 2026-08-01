import { NextRequest, NextResponse } from "next/server";
import { getAuthContext, canManageOrganization } from "@/lib/authorization";

type Context = { params: Promise<{ id: string }> };

async function authorize(context: Context) {
  const auth = await getAuthContext();
  if (auth.response) return { response: auth.response };
  const { id } = await context.params;
  const result = await auth.context.admin.from("checklist_templates").select("id, organization_id, name, description, target_role, created_at, updated_at, checklist_items!inner(id, checklist_template_id, label, input_type, is_required, sort_order, validation_rules, created_at)").eq("id", id).eq("organization_id", auth.context.organizationId).eq("is_active", true).is("deleted_at", null).is("checklist_items.deleted_at", null).single();
  const data = result as unknown as { data: Record<string, unknown> | null; error: { message: string } | null };
  if (data.error || !data.data) return { response: NextResponse.json({ error: "Template checklist tidak ditemukan." }, { status: 404 }) };
  if (!canManageOrganization(auth.context.memberships[0]?.role)) return { response: NextResponse.json({ error: "Akses hanya tersedia untuk manager." }, { status: 403 }) };
  return { context: auth.context, id, data: data.data };
}

export async function GET(_: NextRequest, route: Context) {
  const auth = await authorize(route);
  if (auth.response) return auth.response;
  return NextResponse.json({ data: auth.data });
}

export async function PATCH(request: NextRequest, route: Context) {
  const auth = await authorize(route);
  if (auth.response) return auth.response;
  if (!canManageOrganization(auth.context!.memberships[0]?.role)) return NextResponse.json({ error: "Akses hanya tersedia untuk manager." }, { status: 403 });
  const body = await request.json() as { name?: string; description?: string | null; target_role?: string };
  const update: Record<string, unknown> = {};
  if (body.name !== undefined) { if (!body.name.trim()) return NextResponse.json({ error: "name wajib diisi." }, { status: 400 }); update.name = body.name.trim(); }
  if (body.description !== undefined) update.description = body.description;
  if (body.target_role !== undefined) { if (!["maker", "checker", "approver"].includes(body.target_role)) return NextResponse.json({ error: "target_role tidak valid." }, { status: 400 }); update.target_role = body.target_role; }
  if (!Object.keys(update).length) return NextResponse.json({ error: "Tidak ada field yang diupdate." }, { status: 400 });
  const result = await auth.context!.admin.from("checklist_templates").update({ ...update, updated_at: new Date().toISOString() } as never).eq("id", auth.id).eq("organization_id", auth.context!.organizationId).select("id, organization_id, name, description, target_role, created_at, updated_at").single();
  const data = result as unknown as { data: unknown; error: { message: string } | null };
  if (data.error) return NextResponse.json({ error: "Gagal mengubah template checklist." }, { status: 500 });
  return NextResponse.json({ data: data.data });
}

export async function DELETE(_: NextRequest, route: Context) {
  const auth = await authorize(route);
  if (auth.response) return auth.response;
  if (!canManageOrganization(auth.context!.memberships[0]?.role)) return NextResponse.json({ error: "Akses hanya tersedia untuk manager." }, { status: 403 });
  const result = await auth.context!.admin.from("checklist_templates").update({ is_active: false, deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() } as never).eq("id", auth.id).eq("organization_id", auth.context!.organizationId).is("deleted_at", null);
  const data = result as unknown as { error: { message: string } | null };
  if (data.error) return NextResponse.json({ error: "Template checklist tidak dapat dihapus karena masih digunakan." }, { status: 409 });
  return NextResponse.json({ data: { id: auth.id } });
}
