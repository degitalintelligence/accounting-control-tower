import { NextRequest, NextResponse } from "next/server";
import { getAuthContext, canAccessOptionalClient } from "@/lib/authorization";

export async function GET(request: NextRequest) {
  const auth = await getAuthContext();
  if (auth.response) return auth.response;
  const { admin, organizationId } = auth.context;
  const workItemId = request.nextUrl.searchParams.get("work_item_id");
  const clientId = request.nextUrl.searchParams.get("client_id");
  if (clientId !== null && !canAccessOptionalClient(auth.context, clientId || null)) return NextResponse.json({ error: "Client tidak berada dalam scope akses user." }, { status: 403 });
  let scopedClientId = clientId;

  if (workItemId) {
    const workItemResult = await admin.from("work_items").select("client_id").eq("id", workItemId).eq("organization_id", organizationId).is("deleted_at", null).maybeSingle();
    const workItem = workItemResult as unknown as { data: { client_id: string | null } | null; error: { message: string } | null };
    if (workItem.error) return NextResponse.json({ error: "Gagal memuat work item." }, { status: 500 });
    if (!workItem.data) return NextResponse.json({ error: "Work item tidak ditemukan." }, { status: 404 });
    scopedClientId = workItem.data.client_id;
    if (!canAccessOptionalClient(auth.context, scopedClientId)) return NextResponse.json({ error: "Work item tidak berada dalam scope akses user." }, { status: 403 });
  }

  let query = admin.from("memberships").select("profile_id, client_id, role, profiles!inner(id, display_name, email)").eq("organization_id", organizationId).eq("is_active", true);
  if (scopedClientId) query = query.or(`client_id.is.null,client_id.eq.${scopedClientId}`);
  else if (clientId === "") query = query.is("client_id", null);
  else if (!auth.context.isOrgWide) query = query.or(`client_id.is.null,client_id.in.(${auth.context.clientIds.join(",")})`);
  const result = await query.order("created_at", { ascending: true });
  const data = result as unknown as { data: { profile_id: string; client_id: string | null; role: string; profiles: { id: string; display_name: string; email: string | null } }[] | null; error: { message: string } | null };
  if (data.error) return NextResponse.json({ error: "Gagal memuat anggota." }, { status: 500 });
  const unique = new Map<string, { profile_id: string; name: string; email: string | null; role: string }>();
  for (const member of data.data ?? []) unique.set(member.profile_id, { profile_id: member.profile_id, name: member.profiles.display_name, email: member.profiles.email, role: member.role });
  return NextResponse.json({ data: [...unique.values()] });
}
