"use client";

import { useAuthStore } from "@/stores/auth-store";

/**
 * Client-side RBAC helper. Reads the permission keys for the active
 * organization (populated by /api/auth/me) and exposes `has`/`hasAny`.
 * NOTE: only used to HIDE UI. Server-side enforcement (403) always remains
 * the source of truth.
 */
export function usePermissions() {
  const permissions = useAuthStore((s) => s.user?.permissions ?? []);

  const has = (key: string) => permissions.includes(key);
  const hasAny = (...keys: string[]) => keys.some((key) => permissions.includes(key));

  return { permissions, has, hasAny };
}
