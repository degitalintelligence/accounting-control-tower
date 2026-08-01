import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "./types";

/**
 * Browser-side Supabase client with cookie-based auth via @supabase/ssr.
 * Uses anon key with RLS enforcement. Schema: acct_ctrl.
 */
export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { db: { schema: "acct_ctrl" } }
  );
}
