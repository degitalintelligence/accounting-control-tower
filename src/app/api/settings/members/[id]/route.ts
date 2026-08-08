import { NextRequest, NextResponse } from "next/server";
import { getAuthContext, requirePermission } from "@/lib/authorization";
import { memberUpdateSchema, validationMessage } from "@/lib/validation/schemas";

type Params = { params: Promise<{ id: string }> };

const assignableRoles = ["administrator", "team_leader", "staff"] as const;

type MemberAccess = {
  id: string;
  profile_id: string;
  role: string;
  role_id: string | null;
  is_active: boolean;
};

async function authorize(id: string) {
  const auth = await getAuthContext();
  if (auth.response) return { response: auth.response } as const;
  const denied = await requirePermission(auth.context, "members.manage");
  if (denied) return { response: denied } as const;
  const membership = await auth.context.admin.from("memberships").select("id, profile_id, role, role_id, is_active").eq("id", id).eq("organization_id", auth.context.organizationId).maybeSingle();
  const found = membership as unknown as { data: MemberAccess | null; error: { message: string } | null };
  if (found.error || !found.data) return { response: NextResponse.json({ error: "Member tidak ditemukan." }, { status: 404 }) } as const;
  return { context: auth.context, member: found.data } as const;
}

type AuthMember = { profile_id: string; role: string; is_active: boolean };

/**
 * Menjaga supaya akun tidak kehilangan akses sepenuhnya ke organisasi:
 * 1. Member tidak boleh menonaktifkan/mengubah status dirinya sendiri.
 * 2. Member yang merupakan owner aktif terakhir tidak boleh dinonaktifkan.
 */
async function guardDeactivation(
  context: { userId: string; organizationId: string; admin: { from: (t: "memberships" | "organization_roles") => any } },
  member: AuthMember
): Promise<NextResponse | null> {
  if (member.profile_id === context.userId) {
    return NextResponse.json({ error: "Anda tidak dapat menonaktifkan akun Anda sendiri." }, { status: 400 });
  }
  if (member.role === "owner" && member.is_active) {
    const ownerRoleResult = await context.admin
      .from("organization_roles")
      .select("id")
      .eq("organization_id", context.organizationId)
      .eq("role_key", "owner")
      .is("deleted_at", null)
      .maybeSingle();
    const ownerRoleId = (ownerRoleResult as { data: { id: string } | null }).data?.id;
    if (!ownerRoleId) return NextResponse.json({ error: "Role owner organisasi tidak ditemukan." }, { status: 500 });
    const { count } = await context.admin
      .from("memberships")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", context.organizationId)
      .eq("role_id", ownerRoleId)
      .eq("is_active", true);
    if ((count ?? 0) <= 1) {
      return NextResponse.json({ error: "Tidak dapat menonaktifkan owner terakhir organisasi. Tetapkan/migrasi owner lain terlebih dahulu." }, { status: 400 });
    }
  }
  return null;
}

export async function PATCH(request: NextRequest, { params }: Params) {
  const { id } = await params;
  const authorized = await authorize(id);
  if (authorized.response) return authorized.response;
  const parsed = memberUpdateSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: validationMessage(parsed.error) }, { status: 400 });
  const { context } = authorized;
  const isCurrentUser = authorized.member.profile_id === context.userId;
  if (isCurrentUser && (parsed.data.role !== undefined || parsed.data.is_active !== undefined)) {
    return NextResponse.json(
      { error: "Anda tidak dapat mengubah role atau status akun Anda sendiri." },
      { status: 400 }
    );
  }
  if (authorized.member.role === "owner" && parsed.data.role !== undefined) {
    return NextResponse.json(
      { error: "Role owner tidak dapat diubah melalui pengelolaan anggota." },
      { status: 400 }
    );
  }
  if (parsed.data.role && !assignableRoles.includes(parsed.data.role as (typeof assignableRoles)[number])) {
    return NextResponse.json({ error: "Role yang dapat diberikan melalui pengelolaan anggota: administrator, team_leader, atau staff." }, { status: 400 });
  }
  if (parsed.data.is_active === false) {
    const guardError = await guardDeactivation(context, authorized.member);
    if (guardError) return guardError;
  }
  const update = { ...parsed.data } as Record<string, unknown>;
  if (parsed.data.role) {
    const roleRecordResult = await context.admin.from("organization_roles").select("id").eq("organization_id", context.organizationId).eq("role_key", parsed.data.role).is("deleted_at", null).maybeSingle();
    const roleRecord = roleRecordResult as unknown as { data: { id: string } | null; error: unknown };
    if (roleRecord.error || !roleRecord.data) return NextResponse.json({ error: "Role workspace tidak ditemukan." }, { status: 400 });
    update.role_id = roleRecord.data.id;
    update.role = parsed.data.role;
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
  const guardError = await guardDeactivation(context, authorized.member);
  if (guardError) return guardError;
  const { error } = await context.admin.from("memberships").update({ is_active: false } as never).eq("id", id).eq("organization_id", context.organizationId);
  if (error) return NextResponse.json({ error: "Member gagal dinonaktifkan." }, { status: 500 });
  return NextResponse.json({ ok: true });
}
