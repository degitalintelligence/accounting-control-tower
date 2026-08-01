import { NextResponse } from "next/server";
import { validateProductionEnv, validateServerEnv, type ServerEnvName } from "@/lib/server-env";

export const runtime = "nodejs";

const requiredEnv: ServerEnvName[] = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
];

export function GET() {
  const validation = process.env.NODE_ENV === "production"
    ? validateProductionEnv()
    : validateServerEnv(requiredEnv);
  return NextResponse.json(
    { status: validation.ok ? "ok" : "degraded" },
    { status: validation.ok ? 200 : 503 },
  );
}
