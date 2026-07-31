import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

/**
 * Server-side Supabase client with service_role key.
 * Bypasses RLS — ONLY use in Server Components / API routes.
 * NEVER import this from client components.
 * Schema: acct_ctrl.
 */
export function createServiceRoleClient() {
  return createClient(supabaseUrl, supabaseServiceRoleKey, {
    db: { schema: "acct_ctrl" },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
