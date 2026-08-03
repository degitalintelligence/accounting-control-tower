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
        // #region debug-point B:auth-store-update
        void fetch("http://127.0.0.1:7777/event", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessionId: "new-workspace-missing", runId: "pre-fix", hypothesisId: "B", location: "src/hooks/use-auth.ts:fetchProfile", msg: "[DEBUG] Auth store organization update", data: { organizationCount: data.organizations?.length ?? 0, activeOrganizationPresent: Boolean(data.organization_id) } }) }).catch(() => {});
        // #endregion
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
