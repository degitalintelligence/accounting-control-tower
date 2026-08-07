"use client";

import { useState, useCallback, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AppSidebar } from "./app-sidebar";
import { AppHeader } from "./app-header";
import { CommandPalette } from "./command-palette";
import { ContextualHelpSheet } from "@/components/help/contextual-help-sheet";
import { useAuthStore } from "@/stores/auth-store";

interface AppShellProps {
  children: React.ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const router = useRouter();
  const pathname = usePathname();
  const user = useAuthStore((s) => s.user);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isLoading = useAuthStore((s) => s.isLoading);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);

  // Redirect to onboarding if authenticated but no organization selected.
  useEffect(() => {
    if (isLoading || !isAuthenticated || !user) return;
    if (user.organization_id) return;
    if (pathname.startsWith("/onboarding")) return;
    router.replace("/onboarding/organization");
  }, [isLoading, isAuthenticated, user, pathname, router]);

  const handleMenuClick = useCallback(() => {
    setSidebarOpen((prev) => !prev);
  }, []);

  const handleSidebarClose = useCallback(() => {
    setSidebarOpen(false);
  }, []);

  const handleNewWorkItem = useCallback(() => {
    router.push("/work-items?new=1");
  }, [router]);

  const handleSearch = useCallback(() => {
    router.push("/work-items?focus=search");
  }, [router]);

  const handleHelp = useCallback(() => {
    setHelpOpen(true);
  }, []);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const isFormField = target?.matches("input, textarea, select, [contenteditable='true']");

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen((open) => !open);
        return;
      }

      if (isFormField || event.altKey || event.ctrlKey || event.metaKey) return;

      if (event.key.toLowerCase() === "n") {
        event.preventDefault();
        handleNewWorkItem();
      } else if (event.key === "/") {
        event.preventDefault();
        handleSearch();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleNewWorkItem, handleSearch]);

  return (
    <div className="flex min-h-screen bg-[#f3f5f2]">
      <AppSidebar open={sidebarOpen} onClose={handleSidebarClose} />

      {/* Main content area */}
      <div className="flex min-w-0 flex-1 flex-col lg:ml-64">
        <AppHeader
          onMenuClick={handleMenuClick}
          onNewWorkItem={handleNewWorkItem}
          onSearch={handleSearch}
          onHelp={handleHelp}
        />
        <main className="flex-1">{children}</main>
      </div>
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
      <ContextualHelpSheet open={helpOpen} onOpenChange={setHelpOpen} />
    </div>
  );
}
