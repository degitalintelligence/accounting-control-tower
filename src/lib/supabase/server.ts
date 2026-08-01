import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./types";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

/**
 * Server-side Supabase client with cookie-based auth via @supabase/ssr.
 * Use in Server Components / Server Actions that need user session.
 * Schema: acct_ctrl.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    supabaseUrl,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      db: { schema: "acct_ctrl" },
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Server Component — setAll dipanggil dari Server Component
            // yang tidak bisa set cookie. Ini normal, middleware akan
            // refresh session dan meng-handle cookie update.
          }
        },
      },
    }
  );
}

/**
 * Server-side Supabase client with service_role key.
 * Bypasses RLS — ONLY use in Server Components / API routes.
 * NEVER import this from client components.
 * Schema: acct_ctrl.
 */
export function createServiceRoleClient() {
  return createSupabaseClient<Database>(supabaseUrl, supabaseServiceRoleKey, {
    db: { schema: "acct_ctrl" },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
