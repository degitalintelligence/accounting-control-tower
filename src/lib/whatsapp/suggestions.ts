import "server-only";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";

export async function getSuggestionContext() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { user: null, organizationId: null, admin: null };

  const admin = createServiceRoleClient();
  const result = await admin
    .from("memberships")
    .select("organization_id")
    .eq("profile_id", auth.user.id)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();
  const membership = result as unknown as { data: { organization_id: string; role: string } | null };
  return { user: auth.user, organizationId: membership.data?.organization_id ?? null, role: membership.data?.role ?? null, admin };
}

export function suggestionError(error: unknown) {
  const details = error as { message?: string; code?: string; hint?: string; details?: string };
  return { message: details.message, code: details.code, hint: details.hint, details: details.details };
}
