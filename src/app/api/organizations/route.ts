import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const createOrganizationSchema = z.object({
  name: z.string().trim().min(2).max(120),
  slug: z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(80),
  timezone: z.string().trim().min(1).max(80).default("Asia/Jakarta"),
  currency: z.string().trim().length(3).default("IDR"),
});

export async function POST(request: Request) {
  const client = await createClient();
  const { data: { user } } = await client.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = createOrganizationSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Data organisasi belum valid." }, { status: 400 });

  const { data, error } = await (client as unknown as { rpc: (name: string, args: Record<string, string>) => Promise<{ data: unknown; error: { code?: string; message: string } | null }> }).rpc("create_organization_with_owner", {
    p_name: parsed.data.name,
    p_slug: parsed.data.slug,
    p_timezone: parsed.data.timezone,
    p_currency: parsed.data.currency.toUpperCase(),
  });

  if (error) {
    const duplicate = error.code === "23505" || error.message.includes("ORGANIZATION_ALREADY_EXISTS");
    return NextResponse.json({ error: duplicate ? "Anda sudah memiliki organisasi aktif." : "Organisasi gagal dibuat." }, { status: duplicate ? 409 : 500 });
  }

  const organization = Array.isArray(data) ? data[0] : data;
  return NextResponse.json({ organization }, { status: 201 });
}
