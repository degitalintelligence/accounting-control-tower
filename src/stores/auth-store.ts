import { create } from "zustand";

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  avatar_url: string | null;
  role: string; // membership role: admin | finance_manager | finance_staff
  organization_id: string;
  organization_name: string;
  organizations: Array<{ id: string; name: string; slug: string; is_active: boolean }>;
}

interface AuthState {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  setUser: (user: AuthUser) => void;
  clearUser: () => void;
  setLoading: (loading: boolean) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: false,
  isLoading: true,
  setUser: (user) => set({ user, isAuthenticated: true, isLoading: false }),
  clearUser: () => set({ user: null, isAuthenticated: false, isLoading: false }),
  setLoading: (isLoading) => set({ isLoading }),
}));
