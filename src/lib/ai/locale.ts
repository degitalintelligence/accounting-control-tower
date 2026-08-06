import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isAppLocale, type AppLocale } from "@/lib/i18n";

export const DEFAULT_AI_LOCALE: AppLocale = "id-ID";

export async function resolveOrganizationLocale(admin: Pick<SupabaseClient, "from">, organizationId: string): Promise<AppLocale> {
  const result = await admin.from("organizations").select("settings").eq("id", organizationId).maybeSingle();
  const data = result as unknown as { data: { settings?: { locale?: unknown } } | null; error: { message: string } | null };
  if (data.error || !data.data) return DEFAULT_AI_LOCALE;
  return isAppLocale(data.data.settings?.locale) ? data.data.settings.locale : DEFAULT_AI_LOCALE;
}
