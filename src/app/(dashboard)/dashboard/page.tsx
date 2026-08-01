"use client";

import { AlertTriangle, Clock, Ban, TrendingUp, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { KpiGrid } from "@/components/dashboard/kpi-grid";
import { OverdueAgingCard } from "@/components/dashboard/overdue-aging-card";

export default function DashboardPage() {
  const { stats, kpis, insights, sections, loading, error, partialFailures, refetch } = useDashboard();
  const user = useAuthStore((s) => s.user);

  return (
    <main className="flex-1 min-h-screen bg-canvas p-4 sm:p-6">
      <PageHeading
        userName={user?.name?.split(" ")[0] || ""}
        exceptionCount={stats?.critical_overdue ?? 0}
        goalPercent={stats?.on_time_rate ?? 0}
      />

      {error && (
        <div role="alert" className="mb-6 flex flex-col gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-semibold">Dashboard gagal dimuat.</p>
            <p className="mt-1">{error}</p>
          </div>
          <Button type="button" variant="outline" onClick={refetch} className="w-fit gap-2 border-red-200 bg-white text-red-700 hover:bg-red-100">
            <RefreshCw className="size-4" />
            Coba lagi
          </Button>
        </div>
      )}
      {!error && partialFailures.length > 0 && <div role="status" className="mb-6 flex flex-col gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 sm:flex-row sm:items-center sm:justify-between"><span>Sebagian data belum tersedia: {partialFailures.join(", ")}.</span><Button type="button" variant="outline" onClick={refetch} className="w-fit border-amber-200 bg-white text-amber-800 hover:bg-amber-100">Muat ulang</Button></div>}

      {/* Stats Grid */}
      <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 mb-6">
        {loading ? (
          <>
            <StatCardSkeleton />
            <StatCardSkeleton />
            <StatCardSkeleton />
            <StatCardSkeleton />
          </>
        ) : stats ? (
          <>
            <StatCard
              variant="danger"
              icon={AlertTriangle}
              label="Terlambat Kritis"
              value={stats?.critical_overdue ?? 0}
              description="butuh tindakan segera"
              actionText="Lihat semua"
              actionHref="/work-items?tab=overdue"
            />
            <StatCard
              variant="warning"
              icon={Clock}
              label="Menunggu Review"
              value={stats?.waiting_review ?? 0}
              description="menunggu persetujuan Anda"
              actionText="Review sekarang"
              actionHref="/work-items?filter=review"
            />
            <StatCard
              variant="neutral"
              icon={Ban}
              label="Terblokir"
              value={stats?.blocked ?? 0}
              description="tergantung pihak lain"
              actionText="Tindak lanjuti"
              actionHref="/work-items?status=blocked"
            />
            <StatCard
              variant="success"
              icon={TrendingUp}
              label="Tingkat Tepat Waktu"
              value={`${stats?.on_time_rate ?? 0}%`}
              description={`${stats?.total_completed ?? 0} total selesai`}
              actionText="Lihat tren"
              actionHref="/reports"
            />
          </>
        ) : null}
      </div>

      {!loading && <div className="mb-6 space-y-3"><KpiGrid kpis={kpis} />{kpis && <OverdueAgingCard buckets={kpis.overdue_aging} />}{!kpis && !error && <EmptyDashboard text="KPI belum tersedia." />}</div>}

      <div className="mb-6">
        <InsightsCard insights={insights} />
      </div>

      <div className="grid gap-3 grid-cols-1 lg:grid-cols-2 mb-6">
        <div className="space-y-3">
          <ExceptionCenter data={sections?.exceptions} count={sections?.exceptionCount} />
          <ReviewQueue data={sections?.reviews} count={sections?.reviewCount} />
        </div>

        <div className="space-y-3">
          <ClosingProgress data={sections?.closing} overallProgress={sections?.overallProgress} />
          <WhatsappInbox />
        </div>
      </div>
    </main>
  );
}

function EmptyDashboard({ text }: { text: string }) {
  return <div className="rounded-xl border border-dashed border-slate-300 bg-white p-5 text-sm text-slate-500">{text}</div>;
}
