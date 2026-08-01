import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { isCronRequestAuthorized } from "@/lib/server-env";
import { runDeadlineReminderSweep } from "@/lib/notification/scheduling";

export async function POST(request: NextRequest) {
  const authorization = isCronRequestAuthorized(request.headers.get("authorization"));
  if (authorization === "misconfigured") return NextResponse.json({ error: "Job scheduler belum dikonfigurasi." }, { status: 503 });
  if (authorization !== "authorized") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try { return NextResponse.json({ data: await runDeadlineReminderSweep(createServiceRoleClient()) }); } catch (error) {
    const details = error as { message?: string; code?: string; hint?: string; details?: string };
    console.error("[POST /api/jobs/reminders] Supabase error:", { message: details.message, code: details.code, hint: details.hint, details: details.details });
    return NextResponse.json({ error: "Gagal menjalankan reminder sweep." }, { status: 500 });
  }
}
