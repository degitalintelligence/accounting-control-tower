import { create } from "zustand";
import type { AppLocale } from "@/lib/i18n";

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  avatar_url: string | null;
  role: string; // membership role: owner | administrator | team_leader | staff
  organization_id: string;
  organization_name: string;
  organizations: Array<{ id: string; name: string; slug: string; is_active: boolean }>;
  locale: AppLocale;
}

interface AuthState {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  setUser: (user: AuthUser) => void;
  clearUser: () => void;
  setLoading: (loading: boolean) => void;
  setLocale: (locale: AppLocale) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: false,
  isLoading: true,
  setUser: (user) => set({ user, isAuthenticated: true, isLoading: false }),
  clearUser: () => set({ user: null, isAuthenticated: false, isLoading: false }),
  setLoading: (isLoading) => set({ isLoading }),
  setLocale: (locale) => set((state) => ({ user: state.user ? { ...state.user, locale } : state.user })),
}));
