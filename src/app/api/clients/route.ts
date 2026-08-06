import { NextResponse } from "next/server";
import { getAuthContext, getAccessibleClients, requirePermission } from "@/lib/authorization";
import { logAudit } from "@/lib/audit/logger";
import { slugifyClientName } from "@/lib/clients";
import { clientCreateSchema, validationMessage } from "@/lib/validation/schemas";

export async function GET() {
  const auth = await getAuthContext();
  if (auth.response) return auth.response;
  const denied = await requirePermission(auth.context, "clients.view");
  if (denied) return denied;
  const result = await getAccessibleClients(auth.context);
  const data = result as unknown as {
    data: { id: string; name: string; slug: string; timezone: string; created_at: string; updated_at: string; deleted_at: string | null }[] | null;
    error: { message: string; code?: string; hint?: string; details?: string } | null;
  };

  if (data.error) {
    console.error("[GET /api/clients] Supabase error:", {
      message: data.error.message,
      code: data.error.code,
      hint: data.error.hint,
      details: data.error.details,
    });
    return NextResponse.json({ error: "Gagal memuat daftar client." }, { status: 500 });
  }

  return NextResponse.json({ data: data.data ?? [] });
}

export async function POST(request: Request) {
  const auth = await getAuthContext();
  if (auth.response) return auth.response;
  const denied = await requirePermission(auth.context, "clients.manage");
  if (denied) return denied;

  const body = await request.json().catch(() => null);
  const parsed = clientCreateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: validationMessage(parsed.error) }, { status: 400 });

  const clients = auth.context.admin.from("clients") as unknown as {
    insert: (values: Record<string, unknown>) => { select: (fields: string) => { single: () => Promise<unknown> } };
  };
  const result = await (clients
    .insert({
      organization_id: auth.context.organizationId,
      name: parsed.data.name,
      slug: slugifyClientName(parsed.data.name),
      timezone: parsed.data.timezone ?? "Asia/Jakarta",
    })
    .select("id, name, slug, timezone, created_at, updated_at, deleted_at")
    .single() as unknown as Promise<unknown>);
  const data = result as unknown as { data: unknown; error: { message: string; code?: string; hint?: string; details?: string } | null };
  if (data.error) {
    console.error("[POST /api/clients] Supabase error:", { message: data.error.message, code: data.error.code, hint: data.error.hint, details: data.error.details });
    return NextResponse.json({ error: data.error.code === "23505" ? "Slug client sudah digunakan." : "Gagal membuat client." }, { status: data.error.code === "23505" ? 409 : 500 });
  }
  await logAudit(auth.context.admin, {
    organizationId: auth.context.organizationId,
    actorId: auth.context.userId,
    action: "client.created",
    entityType: "client",
    entityId: (data.data as { id: string }).id,
    newValue: { name: parsed.data.name, timezone: parsed.data.timezone ?? "Asia/Jakarta" },
  });
  return NextResponse.json({ data: data.data }, { status: 201 });
}
