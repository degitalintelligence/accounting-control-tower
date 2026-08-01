"use client";

import { AlertTriangle, Clock, Ban, TrendingUp } from "lucide-react";
import { PageHeading } from "@/components/dashboard/page-heading";
import { StatCard } from "@/components/dashboard/stat-card";
import { ExceptionCenter } from "@/components/dashboard/exception-center";
import { ReviewQueue } from "@/components/dashboard/review-queue";
import { ClosingProgress } from "@/components/dashboard/closing-progress";
import { WhatsappInbox } from "@/components/dashboard/whatsapp-inbox";
import { useDashboard } from "@/hooks/use-dashboard";
import { useAuthStore } from "@/stores/auth-store";
import { StatCardSkeleton } from "@/components/dashboard/dashboard-skeleton";
import { InsightsCard } from "@/components/dashboard/insights-card";

export default function DashboardPage() {
  const { stats, insights, loading } = useDashboard();
  const user = useAuthStore((s) => s.user);

  return (
    <main className="flex-1 p-6 bg-[#f3f5f2] min-h-screen">
      {/* Page Heading */}
      <PageHeading
        userName={user?.name?.split(" ")[0] || "User"}
        exceptionCount={stats?.critical_overdue ?? 0}
        goalPercent={stats?.on_time_rate ?? 0}
      />

      {/* Stats Grid */}
      <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 mb-6">
        {loading ? (
          <>
            <StatCardSkeleton />
            <StatCardSkeleton />
            <StatCardSkeleton />
            <StatCardSkeleton />
          </>
        ) : (
          <>
            <StatCard
              variant="danger"
              icon={AlertTriangle}
              label="Critical Overdue"
              value={stats?.critical_overdue ?? 0}
              description="butuh tindakan segera"
              actionText="View All"
            />
            <StatCard
              variant="warning"
              icon={Clock}
              label="Waiting Review"
              value={stats?.waiting_review ?? 0}
              description="menunggu persetujuan Anda"
              actionText="Review Now"
            />
            <StatCard
              variant="neutral"
              icon={Ban}
              label="Blocked"
              value={stats?.blocked ?? 0}
              description="tergantung pihak lain"
              actionText="Follow Up"
            />
            <StatCard
              variant="success"
              icon={TrendingUp}
              label="On-Time Rate"
              value={`${stats?.on_time_rate ?? 0}%`}
              description={`${stats?.total_completed ?? 0} total selesai`}
              actionText="Trend"
            />
          </>
        )}
      </div>

      <div className="mb-6">
        <InsightsCard insights={insights} />
      </div>

      {/* Two-column layout */}
      <div className="grid gap-3 grid-cols-1 lg:grid-cols-2 mb-6">
        {/* Left column */}
        <div className="space-y-3">
          <ExceptionCenter />
          <ReviewQueue />
        </div>

        {/* Right column */}
        <div className="space-y-3">
          <ClosingProgress />
          <WhatsappInbox />
        </div>
      </div>
    </main>
  );
}
