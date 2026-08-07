import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export type ActiveOrganizationAssertion = { organizationId: string; active: true };

type OrganizationClient = Pick<SupabaseClient, "from">;

export async function getActiveOrganizationAssertion(admin: OrganizationClient, organizationId: string): Promise<ActiveOrganizationAssertion | null> {
  const result = await admin.from("organizations").select("id").eq("id", organizationId).is("deleted_at", null).maybeSingle();
  const checked = result as unknown as { data: { id: string } | null; error: { message: string } | null };
  if (checked.error) throw new Error(checked.error.message);
  return checked.data?.id === organizationId ? { organizationId, active: true } : null;
}

export async function requireActiveOrganization(admin: OrganizationClient, organizationId: string): Promise<ActiveOrganizationAssertion> {
  const assertion = await getActiveOrganizationAssertion(admin, organizationId);
  if (!assertion) throw new Error("Organisasi sudah diarsipkan.");
  return assertion;
}
