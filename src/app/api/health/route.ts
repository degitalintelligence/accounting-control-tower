import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { validateProductionEnv, validateServerEnv, type ServerEnvName } from "@/lib/server-env";

export const runtime = "nodejs";

const requiredEnv: ServerEnvName[] = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
];

export async function GET() {
  const validation = process.env.NODE_ENV === "production"
    ? validateProductionEnv()
    : validateServerEnv(requiredEnv);
  let database = "not_checked";
  if (validation.ok) {
    try {
      const result = await createServiceRoleClient().from("organizations").select("id").limit(1);
      database = result.error ? "unavailable" : "ok";
    } catch {
      database = "unavailable";
    }
  }
  const healthy = validation.ok && database === "ok";
  return NextResponse.json(
    { status: healthy ? "ok" : "degraded", checks: { env: validation.ok ? "ok" : "invalid", database }, timestamp: new Date().toISOString() },
    { status: healthy ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
