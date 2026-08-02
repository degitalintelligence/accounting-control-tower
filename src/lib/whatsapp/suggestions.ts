import "server-only";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { getAuthContext } from "@/lib/authorization";

export async function getSuggestionContext() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { user: null, organizationId: null, admin: null };

  const admin = createServiceRoleClient();
  const context = await getAuthContext();
  if (context.response) return { user: auth.user, organizationId: null, role: null, roleId: null, admin: null };
  const membership = context.context.memberships[0];
  return { user: auth.user, organizationId: context.context.organizationId, clientIds: context.context.clientIds, isOrgWide: context.context.isOrgWide, role: membership?.role ?? null, roleId: membership?.role_id ?? null, admin };
}

export function suggestionError(error: unknown) {
  const details = error as { message?: string; code?: string; hint?: string; details?: string };
  return { message: details.message, code: details.code, hint: details.hint, details: details.details };
}
