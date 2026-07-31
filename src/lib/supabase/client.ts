import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

/**
 * Browser-side Supabase client.
 * Uses anon key with RLS enforcement. Schema: acct_ctrl.
 */
export function createBrowserClient() {
  return createClient(supabaseUrl, supabaseAnonKey, {
    db: { schema: "acct_ctrl" },
    auth: {
      persistSession: true,
      autoRefreshToken: true,
    },
  });
}
