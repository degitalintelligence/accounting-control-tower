import { NextResponse } from "next/server";
import { getAuthContext, hasPermission } from "@/lib/authorization";

const permissionMap = {
  integrations: "integrations.manage",
  escalations: "escalations.view",
  escalationManage: "escalations.manage",
  ai: "integrations.manage",
  audit: "audit.view",
  auditManage: "audit.manage",
  dead: "dead_letters.view",
  deadManage: "dead_letters.manage",
  health: "job_health.view",
} as const;

export async function GET() {
  const auth = await getAuthContext();
  if (auth.response) return auth.response;
  const entries = await Promise.all(Object.entries(permissionMap).map(async ([key, permission]) => [key, await hasPermission(auth.context, permission)] as const));
  return NextResponse.json({ administration: Object.fromEntries(entries) });
}
