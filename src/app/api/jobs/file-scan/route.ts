import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { isCronRequestAuthorized } from "@/lib/server-env";
import { runFileScanWorker } from "@/lib/files/scan-worker";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const authorization = isCronRequestAuthorized(request.headers.get("authorization"));
  if (authorization === "misconfigured") return NextResponse.json({ error: "Job scheduler belum dikonfigurasi." }, { status: 503 });
  if (authorization !== "authorized") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try { return NextResponse.json({ data: await runFileScanWorker(createServiceRoleClient()) }); }
  catch { return NextResponse.json({ error: "Gagal menjalankan file scan worker." }, { status: 500 }); }
}
