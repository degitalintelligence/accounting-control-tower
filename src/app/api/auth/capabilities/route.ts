import { NextResponse } from "next/server";
import { getAuthContext, hasPermission } from "@/lib/authorization";

const permissionMap = {
  integrations: "integrations.manage",
  escalations: "escalations.view",
  ai: "integrations.manage",
  audit: "audit.view",
  dead: "dead_letters.view",
  health: "job_health.view",
} as const;

export async function GET() {
  const auth = await getAuthContext();
  if (auth.response) return auth.response;
  const entries = await Promise.all(Object.entries(permissionMap).map(async ([key, permission]) => [key, await hasPermission(auth.context, permission)] as const));
  return NextResponse.json({ administration: Object.fromEntries(entries) });
}
