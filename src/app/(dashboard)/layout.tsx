"use client";

import { Suspense } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { Breadcrumb } from "@/components/layout/breadcrumb";
import { useAuth } from "@/hooks/use-auth";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  useAuth();

  return (
    <Suspense fallback={null}>
      <AppShell>
        <div className="px-6 pt-4">
          <Breadcrumb />
        </div>
        {children}
      </AppShell>
    </Suspense>
  );
}
