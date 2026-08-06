"use client";

import { Suspense } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { Breadcrumb } from "@/components/layout/breadcrumb";
import { useAuth } from "@/hooks/use-auth";
import { I18nProvider } from "@/components/i18n-provider";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user } = useAuth();

  return (
    <Suspense fallback={null}>
      <I18nProvider locale={user?.locale ?? "id-ID"}>
        <AppShell>
        <div className="px-6 pt-4">
          <Breadcrumb />
        </div>
        {children}
        </AppShell>
      </I18nProvider>
    </Suspense>
  );
}
