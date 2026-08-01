import "server-only";
import type { createServiceRoleClient } from "@/lib/supabase/server";

type AdminClient = ReturnType<typeof createServiceRoleClient>;

export async function getActiveMembership(admin: AdminClient, userId: string) {
  const result = await admin
    .from("memberships")
    .select("organization_id, role")
    .eq("profile_id", userId)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();
  const data = result as unknown as {
    data: { organization_id: string; role: string } | null;
  };
  return data.data;
}

export function canManageOrganization(role: string | null | undefined) {
  return ["admin", "manager", "finance_manager", "accounting_manager"].includes(role ?? "");
}
