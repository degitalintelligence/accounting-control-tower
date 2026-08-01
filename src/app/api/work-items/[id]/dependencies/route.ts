import { NextRequest, NextResponse } from "next/server";
import { getAuthContext, canAccessClient } from "@/lib/authorization";

type Context = { params: Promise<{ id: string }> };
type Item = { id: string; title: string; client_id: string; organization_id: string; deleted_at: string | null };

async function authorize(context: Context) {
  const auth = await getAuthContext();
  if (auth.response) return { response: auth.response };
  const { id } = await context.params;
  const result = await auth.context.admin.from("work_items").select("id, title, client_id, organization_id, deleted_at").eq("id", id).eq("organization_id", auth.context.organizationId).is("deleted_at", null).single();
  const item = result as unknown as { data: Item | null; error: { message: string } | null };
  if (item.error || !item.data || !canAccessClient(auth.context, item.data.client_id)) return { response: NextResponse.json({ error: "Work item tidak ditemukan." }, { status: 404 }) };
  return { context: auth.context, item: item.data };
}

export async function GET(_: NextRequest, route: Context) {
  const auth = await authorize(route);
  if (auth.response) return auth.response;
  const result = await auth.context!.admin.from("dependencies").select("id, work_item_id, depends_on_id, dependency_type, created_at, depends_on:work_items!dependencies_depends_on_id_fkey(id, title, status, due_at)").eq("work_item_id", auth.item!.id);
  const data = result as unknown as { data: unknown[] | null; error: { message: string } | null };
  if (data.error) return NextResponse.json({ error: "Gagal memuat dependency." }, { status: 500 });
  return NextResponse.json({ data: data.data ?? [] });
}

export async function POST(request: NextRequest, route: Context) {
  const auth = await authorize(route);
  if (auth.response) return auth.response;
  const body = await request.json() as { depends_on_id?: string; dependency_type?: string };
  if (!body.depends_on_id || body.depends_on_id === auth.item!.id) return NextResponse.json({ error: "depends_on_id tidak valid." }, { status: 400 });
  const dependency = await auth.context!.admin.from("work_items").select("id, client_id").eq("id", body.depends_on_id).eq("organization_id", auth.context!.organizationId).is("deleted_at", null).single();
  const dependencyData = dependency as unknown as { data: { id: string; client_id: string } | null; error: { message: string } | null };
  if (dependencyData.error || !dependencyData.data || dependencyData.data.client_id !== auth.item!.client_id) return NextResponse.json({ error: "Dependency harus berada pada tenant dan client yang sama." }, { status: 409 });
  const result = await auth.context!.admin.from("dependencies").insert({ work_item_id: auth.item!.id, depends_on_id: body.depends_on_id, dependency_type: body.dependency_type ?? "finish_to_start" } as never).select("id, work_item_id, depends_on_id, dependency_type, created_at").single();
  const data = result as unknown as { data: unknown; error: { message: string } | null };
  if (data.error) return NextResponse.json({ error: data.error.message.includes("duplicate") ? "Dependency sudah ada." : "Gagal menambah dependency." }, { status: 409 });
  return NextResponse.json({ data: data.data }, { status: 201 });
}

export async function DELETE(request: NextRequest, route: Context) {
  const auth = await authorize(route);
  if (auth.response) return auth.response;
  const body = await request.json() as { dependency_id?: string };
  if (!body.dependency_id) return NextResponse.json({ error: "dependency_id wajib diisi." }, { status: 400 });
  const result = await auth.context!.admin.from("dependencies").delete().eq("id", body.dependency_id).eq("work_item_id", auth.item!.id);
  const data = result as unknown as { error: { message: string } | null };
  if (data.error) return NextResponse.json({ error: "Gagal menghapus dependency." }, { status: 500 });
  return NextResponse.json({ data: { id: body.dependency_id } });
}
