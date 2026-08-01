import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { isCronRequestAuthorized } from "@/lib/server-env";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const authorization = isCronRequestAuthorized(request.headers.get("authorization"));
  if (authorization === "misconfigured") return NextResponse.json({ error: "Job scheduler belum dikonfigurasi." }, { status: 503 });
  if (authorization !== "authorized") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const result = await createServiceRoleClient().rpc("cleanup_whatsapp_retention" as never, { p_limit: 5000 } as never);
    const cleanup = result as unknown as { data: { raw_payloads_cleaned: number; messages_deleted: number }[] | null; error: { message?: string; code?: string; hint?: string; details?: string } | null };
    if (cleanup.error) {
      console.error("[POST /api/jobs/whatsapp-retention] Supabase error:", cleanup.error);
      return NextResponse.json({ error: "Gagal menjalankan cleanup WhatsApp." }, { status: 500 });
    }
    return NextResponse.json({ data: cleanup.data?.[0] ?? { raw_payloads_cleaned: 0, messages_deleted: 0 } });
  } catch (error) {
    const details = error as { message?: string; code?: string; hint?: string; details?: string };
    console.error("[POST /api/jobs/whatsapp-retention] Supabase error:", { message: details.message, code: details.code, hint: details.hint, details: details.details });
    return NextResponse.json({ error: "Gagal menjalankan cleanup WhatsApp." }, { status: 500 });
  }
}
