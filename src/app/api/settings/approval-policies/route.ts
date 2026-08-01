import { NextRequest, NextResponse } from "next/server";
import { getAuthContext, canManageOrganization } from "@/lib/authorization";

export async function GET() {
  const auth = await getAuthContext(); if (auth.response) return auth.response;
  const { admin, organizationId } = auth.context;
  const result = await admin.from("approval_policies").select("id, client_id, entity_id, name, version, is_active, effective_from, effective_until, default_currency_code, created_at, updated_at").eq("organization_id", organizationId).order("created_at", { ascending: false });
  if (result.error) return NextResponse.json({ error: "Policy approval gagal dimuat." }, { status: 500 });
  return NextResponse.json({ data: result.data ?? [] });
}

export async function POST(request: NextRequest) {
  const auth = await getAuthContext(); if (auth.response) return auth.response;
  if (!canManageOrganization(auth.context.memberships[0]?.role)) return NextResponse.json({ error: "Akses hanya tersedia untuk manager." }, { status: 403 });
  const body = await request.json();
  if (typeof body.name !== "string" || !body.name.trim()) return NextResponse.json({ error: "Nama policy wajib diisi." }, { status: 400 });
  const result = await auth.context.admin.from("approval_policies").insert({ organization_id: auth.context.organizationId, name: body.name.trim(), client_id: body.client_id ?? null, entity_id: body.entity_id ?? null, default_currency_code: body.default_currency_code ?? "IDR", created_by: auth.context.userId } as never).select("id, client_id, entity_id, name, version, is_active, effective_from, effective_until, default_currency_code, created_at, updated_at").single();
  if (result.error) return NextResponse.json({ error: "Policy approval gagal dibuat." }, { status: 500 });
  return NextResponse.json({ data: result.data }, { status: 201 });
}
