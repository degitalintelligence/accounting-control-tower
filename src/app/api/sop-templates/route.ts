import { NextRequest, NextResponse } from "next/server";
import { getAuthContext, canManageOrganization } from "@/lib/authorization";

export async function GET() {
  const auth = await getAuthContext();
  if (auth.response) return auth.response;
  const result = await auth.context.admin.from("sop_templates").select("id, organization_id, name, description, created_at, updated_at, sop_versions(id, version_number, content, effective_from, review_date, status, owner_id, created_at)").eq("organization_id", auth.context.organizationId).is("deleted_at", null).order("created_at", { ascending: false });
  const data = result as unknown as { data: unknown[] | null; error: { message: string } | null };
  if (data.error) return NextResponse.json({ error: "Gagal memuat SOP." }, { status: 500 });
  return NextResponse.json({ data: data.data ?? [] });
}

export async function POST(request: NextRequest) {
  const auth = await getAuthContext();
  if (auth.response) return auth.response;
  if (!canManageOrganization(auth.context.memberships[0]?.role)) return NextResponse.json({ error: "Akses hanya tersedia untuk manager." }, { status: 403 });
  const body = await request.json() as { name?: string; description?: string | null; content?: string; effective_from?: string | null; review_date?: string | null };
  if (!body.name?.trim() || !body.content?.trim()) return NextResponse.json({ error: "name dan content wajib diisi." }, { status: 400 });
  const template = await auth.context.admin.from("sop_templates").insert({ organization_id: auth.context.organizationId, name: body.name.trim(), description: body.description ?? null } as never).select("id, organization_id, name, description, created_at, updated_at").single();
  const templateData = template as unknown as { data: { id: string } | null; error: { message: string } | null };
  if (templateData.error || !templateData.data) return NextResponse.json({ error: "Gagal membuat SOP." }, { status: 500 });
  const version = await auth.context.admin.from("sop_versions").insert({ sop_template_id: templateData.data.id, version_number: 1, content: body.content.trim(), effective_from: body.effective_from ?? null, review_date: body.review_date ?? null, owner_id: auth.context.userId } as never).select("id, sop_template_id, version_number, content, effective_from, review_date, status, owner_id, created_at").single();
  const versionData = version as unknown as { data: unknown; error: { message: string } | null };
  if (versionData.error) return NextResponse.json({ error: "Gagal membuat versi SOP." }, { status: 500 });
  return NextResponse.json({ data: { ...templateData.data, version: versionData.data } }, { status: 201 });
}
