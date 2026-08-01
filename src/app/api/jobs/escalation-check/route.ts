import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { runEscalationCheck } from "@/lib/notification/escalation";
import { isCronRequestAuthorized } from "@/lib/server-env";

export async function POST(request: NextRequest) {
  const authorization = isCronRequestAuthorized(request.headers.get("authorization"));
  if (authorization === "misconfigured") {
    return NextResponse.json({ error: "Job scheduler belum dikonfigurasi." }, { status: 503 });
  }
  if (authorization !== "authorized") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await runEscalationCheck(createServiceRoleClient());
    return NextResponse.json({ data: result });
  } catch (error) {
    const details = error as { message?: string; code?: string; hint?: string; details?: string };
    console.error("[POST /api/jobs/escalation-check] Supabase error:", {
      message: details.message,
      code: details.code,
      hint: details.hint,
      details: details.details,
    });
    return NextResponse.json({ error: "Gagal menjalankan escalation check." }, { status: 500 });
  }
}
