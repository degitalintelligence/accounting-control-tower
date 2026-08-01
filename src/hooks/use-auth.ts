"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuthStore, type AuthUser } from "@/stores/auth-store";

/**
 * Hook yang membaca auth state dari Supabase session,
 * fetch profile + organization via /api/auth/me,
 * lalu mengisi Zustand store. Panggil di layout top-level.
 */
export function useAuth() {
  const { user, isAuthenticated, isLoading, setUser, clearUser, setLoading } =
    useAuthStore();

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;

    async function fetchProfile() {
      try {
        const res = await fetch("/api/auth/me");
        if (!res.ok) {
          clearUser();
          return;
        }
        const data: AuthUser = await res.json();
        if (!cancelled) setUser(data);
      } catch {
        if (!cancelled) clearUser();
      }
    }

    async function loadSession() {
      setLoading(true);

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.user) {
        if (!cancelled) clearUser();
        return;
      }

      await fetchProfile();
    }

    loadSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(
      async (
        _event: string,
        session: import("@supabase/supabase-js").Session | null
      ) => {
        if (!session?.user) {
          clearUser();
          return;
        }

        await fetchProfile();
      }
    );

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [setUser, clearUser, setLoading]);

  return { user, isAuthenticated, isLoading };
}
