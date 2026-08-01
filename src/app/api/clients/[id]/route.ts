import { NextResponse } from "next/server";
import { getAuthContext, canAccessClient, hasRole } from "@/lib/authorization";
import { shouldUpdateClientSlug, slugifyClientName } from "@/lib/clients";
import { clientUpdateSchema, validationMessage } from "@/lib/validation/schemas";

const managerRoles = ["admin", "manager", "finance_manager", "accounting_manager"];

async function getClientContext(id: string) {
  const auth = await getAuthContext();
  if (auth.response) return { response: auth.response } as const;
  if (!canAccessClient(auth.context, id)) return { response: NextResponse.json({ error: "Client tidak ditemukan." }, { status: 404 }) } as const;
  if (!hasRole(auth.context, managerRoles)) return { response: NextResponse.json({ error: "Akses hanya tersedia untuk manager atau admin." }, { status: 403 }) } as const;
  return { context: auth.context } as const;
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await getAuthContext();
  if (auth.response) return auth.response;
  if (!canAccessClient(auth.context, id)) return NextResponse.json({ error: "Client tidak ditemukan." }, { status: 404 });

  const clients = auth.context.admin.from("clients") as unknown as {
    select: (fields: string) => { eq: (column: string, value: string) => { eq: (column: string, value: string) => { maybeSingle: () => Promise<unknown> } } };
  };
  const result = await (clients
    .select("id, name, slug, timezone, created_at, updated_at, deleted_at")
    .eq("organization_id", auth.context.organizationId)
    .eq("id", id)
    .maybeSingle() as unknown as Promise<unknown>);
  const data = result as unknown as { data: unknown; error: { message: string; code?: string; hint?: string; details?: string } | null };
  if (data.error) return NextResponse.json({ error: "Gagal memuat client." }, { status: 500 });
  if (!data.data) return NextResponse.json({ error: "Client tidak ditemukan." }, { status: 404 });
  return NextResponse.json({ data: data.data });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await getClientContext(id);
  if (auth.response) return auth.response;
  const body = await request.json().catch(() => null);
  const parsed = clientUpdateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: validationMessage(parsed.error) }, { status: 400 });
  if (!Object.keys(parsed.data).length) return NextResponse.json({ error: "Tidak ada perubahan." }, { status: 400 });

  let values: Record<string, unknown> = parsed.data;
  if (parsed.data.name) {
    const current = auth.context.admin.from("clients") as unknown as {
      select: (fields: string) => { eq: (column: string, value: string) => { eq: (column: string, value: string) => { is: (column: string, value: null) => { maybeSingle: () => Promise<unknown> } } } };
    };
    const currentResult = await (current
      .select("name, slug")
      .eq("organization_id", auth.context.organizationId)
      .eq("id", id)
      .is("deleted_at", null)
      .maybeSingle() as unknown as Promise<unknown>);
    const currentData = currentResult as unknown as { data: { name: string; slug: string } | null; error: { message: string; code?: string; hint?: string; details?: string } | null };
    if (currentData.error) return NextResponse.json({ error: "Gagal memuat client." }, { status: 500 });
    if (!currentData.data) return NextResponse.json({ error: "Client tidak ditemukan." }, { status: 404 });
    if (shouldUpdateClientSlug(currentData.data.slug, currentData.data.name)) {
      values = { ...values, slug: slugifyClientName(parsed.data.name) };
    }
  }

  const clients = auth.context.admin.from("clients") as unknown as {
    update: (values: Record<string, unknown>) => { eq: (column: string, value: string) => { eq: (column: string, value: string) => { is: (column: string, value: null) => { select: (fields: string) => { maybeSingle: () => Promise<unknown> } } } } };
  };
  const result = await (clients
    .update(values)
    .eq("organization_id", auth.context.organizationId)
    .eq("id", id)
    .is("deleted_at", null)
    .select("id, name, slug, timezone, created_at, updated_at, deleted_at")
    .maybeSingle() as unknown as Promise<unknown>);
  const data = result as unknown as { data: unknown; error: { message: string; code?: string; hint?: string; details?: string } | null };
  if (data.error) {
    console.error("[PATCH /api/clients/:id] Supabase error:", { message: data.error.message, code: data.error.code, hint: data.error.hint, details: data.error.details });
    return NextResponse.json({ error: data.error.code === "23505" ? "Slug client sudah digunakan." : "Gagal memperbarui client." }, { status: data.error.code === "23505" ? 409 : 500 });
  }
  if (!data.data) return NextResponse.json({ error: "Client tidak ditemukan." }, { status: 404 });
  return NextResponse.json({ data: data.data });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await getClientContext(id);
  if (auth.response) return auth.response;
  const clients = auth.context.admin.from("clients") as unknown as {
    update: (values: Record<string, unknown>) => { eq: (column: string, value: string) => { eq: (column: string, value: string) => { is: (column: string, value: null) => { select: (fields: string) => { maybeSingle: () => Promise<unknown> } } } } };
  };
  const result = await (clients
    .update({ deleted_at: new Date().toISOString() })
    .eq("organization_id", auth.context.organizationId)
    .eq("id", id)
    .is("deleted_at", null)
    .select("id")
    .maybeSingle() as unknown as Promise<unknown>);
  const data = result as unknown as { data: unknown; error: { message: string; code?: string; hint?: string; details?: string } | null };
  if (data.error) return NextResponse.json({ error: "Gagal mengarsipkan client." }, { status: 500 });
  if (!data.data) return NextResponse.json({ error: "Client tidak ditemukan." }, { status: 404 });
  return NextResponse.json({ data: data.data });
}
