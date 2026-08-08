import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./types";

/**
 * Server-side Supabase client with cookie-based auth via @supabase/ssr.
 * Use in Server Components / Server Actions that need user session.
 * Schema: acct_ctrl.
 */
export async function createClient(): Promise<SupabaseClient<Database, "acct_ctrl">> {
  let cookieStore;
  try {
    cookieStore = await cookies();
  } catch (e) {
    // cookies() might throw if called outside of a request context
    // In this case, we return a client without cookie support (or with empty cookies)
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!supabaseUrl || !supabaseAnonKey) throw new Error("Missing Supabase public environment variables.");
    
    return createServerClient<Database, "acct_ctrl">(supabaseUrl, supabaseAnonKey, {
      db: { schema: "acct_ctrl" },
      cookies: {
        getAll: () => [],
        setAll: () => {},
      },
    });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Missing Supabase public environment variables.");
  }

  return createServerClient<Database, "acct_ctrl">(
    supabaseUrl,
    supabaseAnonKey,
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
export function createServiceRoleClient(): SupabaseClient<Database, "acct_ctrl"> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceRoleKey) {
    throw new Error("Missing Supabase service role environment variables.");
  }

  return createSupabaseClient<Database, "acct_ctrl">(supabaseUrl, supabaseServiceRoleKey, {
    db: { schema: "acct_ctrl" },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

export function createPublicAuthClient(): SupabaseClient<Database, "acct_ctrl"> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Missing Supabase public environment variables.");
  }

  return createSupabaseClient<Database, "acct_ctrl">(supabaseUrl, supabaseAnonKey, {
    db: { schema: "acct_ctrl" },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
