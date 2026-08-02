import { NextRequest, NextResponse } from "next/server";
import { getAuthContext, requirePermission } from "@/lib/authorization";

type Context = { params: Promise<{ id: string }> };
export async function PATCH(request: NextRequest, route: Context) {
  const auth = await getAuthContext();
  if (auth.response) return auth.response;
  const denied = await requirePermission(auth.context, "sop.manage");
  if (denied) return denied;
  const { id } = await route.params;
  const body = await request.json() as { name?: string; description?: string | null; content?: string; version_number?: number; status?: string };
  const owner = await auth.context.admin.from("sop_templates").select("id").eq("id", id).eq("organization_id", auth.context.organizationId).is("deleted_at", null).single();
  const ownerData = owner as unknown as { data: { id: string } | null; error: { message: string } | null };
  if (ownerData.error || !ownerData.data) return NextResponse.json({ error: "SOP tidak ditemukan." }, { status: 404 });
  if (body.name !== undefined || body.description !== undefined) await auth.context.admin.from("sop_templates").update({ ...(body.name !== undefined ? { name: body.name.trim() } : {}), ...(body.description !== undefined ? { description: body.description } : {}), updated_at: new Date().toISOString() } as never).eq("id", id);
  if (body.content !== undefined) {
    const latest = await auth.context.admin.from("sop_versions").select("version_number").eq("sop_template_id", id).order("version_number", { ascending: false }).limit(1).maybeSingle();
    const latestData = latest as unknown as { data: { version_number: number } | null };
    await auth.context.admin.from("sop_versions").insert({ sop_template_id: id, version_number: body.version_number ?? ((latestData.data?.version_number ?? 0) + 1), content: body.content.trim(), status: body.status ?? "draft", owner_id: auth.context.userId } as never);
  }
  return NextResponse.json({ data: { id } });
}

export async function DELETE(_: NextRequest, route: Context) {
  const auth = await getAuthContext();
  if (auth.response) return auth.response;
  const denied = await requirePermission(auth.context, "sop.manage");
  if (denied) return denied;
  const { id } = await route.params;
  const result = await auth.context.admin.from("sop_templates").update({ deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() } as never).eq("id", id).eq("organization_id", auth.context.organizationId).is("deleted_at", null);
  const data = result as unknown as { error: { message: string } | null };
  if (data.error) return NextResponse.json({ error: "Gagal mengarsipkan SOP." }, { status: 500 });
  return NextResponse.json({ data: { id } });
}
