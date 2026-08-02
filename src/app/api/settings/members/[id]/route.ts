import { NextRequest, NextResponse } from "next/server";
import { getAuthContext, requirePermission } from "@/lib/authorization";
import { memberUpdateSchema, validationMessage } from "@/lib/validation/schemas";

type Params = { params: Promise<{ id: string }> };

async function authorize(id: string) {
  const auth = await getAuthContext();
  if (auth.response) return { response: auth.response } as const;
  const denied = await requirePermission(auth.context, "members.manage");
  if (denied) return { response: denied } as const;
  const membership = await auth.context.admin.from("memberships").select("id, profile_id").eq("id", id).eq("organization_id", auth.context.organizationId).maybeSingle();
  const found = membership as unknown as { data: { id: string; profile_id: string } | null; error: { message: string } | null };
  if (found.error || !found.data) return { response: NextResponse.json({ error: "Member tidak ditemukan." }, { status: 404 }) } as const;
  return { context: auth.context, member: found.data } as const;
}

export async function PATCH(request: NextRequest, { params }: Params) {
  const { id } = await params;
  const authorized = await authorize(id);
  if (authorized.response) return authorized.response;
  const parsed = memberUpdateSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: validationMessage(parsed.error) }, { status: 400 });
  const { context } = authorized;
  const update = { ...parsed.data } as Record<string, unknown>;
  if (parsed.data.role) {
    const roleRecordResult = await context.admin.from("organization_roles").select("id").eq("organization_id", context.organizationId).eq("role_key", parsed.data.role).is("deleted_at", null).maybeSingle();
    const roleRecord = roleRecordResult as unknown as { data: { id: string } | null; error: unknown };
    if (roleRecord.error || !roleRecord.data) return NextResponse.json({ error: "Role workspace tidak ditemukan." }, { status: 400 });
    update.role_id = roleRecord.data.id;
  }
  const { data, error } = await context.admin.from("memberships").update(update as never).eq("id", id).eq("organization_id", context.organizationId).select("id, profile_id, role, role_id, client_id, entity_id, is_active, updated_at").single();
  if (error) return NextResponse.json({ error: "Member gagal diperbarui." }, { status: 500 });
  if (parsed.data.display_name) await context.admin.from("profiles").update({ display_name: parsed.data.display_name } as never).eq("id", authorized.member.profile_id);
  return NextResponse.json({ data });
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  const { id } = await params;
  const authorized = await authorize(id);
  if (authorized.response) return authorized.response;
  const { context } = authorized;
  const { error } = await context.admin.from("memberships").update({ is_active: false } as never).eq("id", id).eq("organization_id", context.organizationId);
  if (error) return NextResponse.json({ error: "Member gagal dinonaktifkan." }, { status: 500 });
  return NextResponse.json({ ok: true });
}
