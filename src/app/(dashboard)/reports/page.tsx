"use client";

import { useEffect, useState } from "react";
import { Activity, AlertTriangle, CheckCircle2, ClipboardList } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

type ReportData = {
  summary: { total: number; active: number; completed: number; overdue: number; delivered: number; pending_delivery: number; on_time_rate: number };
  lifecycle: { stage: string; total: number }[];
  versions: { version: string; total: number; completed: number }[];
};

const stageLabels: Record<string, string> = {
  draft: "Draft", prepared: "Disiapkan", submitted: "Dikirim", accepted: "Diterima", rejected: "Ditolak", delivered: "Delivered",
};

export default function ReportsPage() {
  const [data, setData] = useState<ReportData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/reports")
      .then(async (response) => {
        if (!response.ok) throw new Error((await response.json()).error ?? "Gagal memuat laporan.");
        return response.json();
      })
      .then(setData)
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "Gagal memuat laporan."));
  }, []);

  const summaryCards = data ? [
    [ClipboardList, "Total pekerjaan", data.summary.total, "text-blue-600", "bg-blue-50"],
    [Activity, "Sedang berjalan", data.summary.active, "text-amber-600", "bg-amber-50"],
    [CheckCircle2, "Selesai", data.summary.completed, "text-emerald-600", "bg-emerald-50"],
    [AlertTriangle, "Overdue", data.summary.overdue, "text-red-600", "bg-red-50"],
    [CheckCircle2, "Delivered", data.summary.delivered, "text-purple-600", "bg-purple-50"],
  ] as const : [];

  return (
    <main className="page-canvas">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-ink">Reports</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">Ringkasan performa pekerjaan dan kontrol operasional</p>
      </div>

      {error && <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}
      {!data && !error ? <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-24 rounded-xl" />)}</div> : data && (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {summaryCards.map(([Icon, label, value, iconColor, iconBg]) => (
              <Card key={label} className="gap-2 border-0 shadow-sm">
                <CardContent className="flex items-center gap-3 p-4">
                  <span className={`grid size-10 place-items-center rounded-lg ${iconBg}`}><Icon className={`size-5 ${iconColor}`} /></span>
                  <div><p className="text-xs text-slate-500">{label}</p><p className="text-2xl font-semibold text-slate-900">{value}</p></div>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="border-0 shadow-sm"><CardHeader><CardTitle>Lifecycle report</CardTitle></CardHeader><CardContent className="space-y-3">
              {data.lifecycle.map((item) => <div key={item.stage} className="flex items-center justify-between border-b border-slate-100 pb-2 text-sm"><span className="text-slate-600">{stageLabels[item.stage] ?? item.stage}</span><span className="font-semibold text-slate-900">{item.total}</span></div>)}
            </CardContent></Card>
            <Card className="border-0 shadow-sm"><CardHeader><CardTitle>Versi template</CardTitle></CardHeader><CardContent className="space-y-3">
              {data.versions.map((item) => <div key={item.version} className="flex items-center justify-between border-b border-slate-100 pb-2 text-sm"><span className="truncate text-slate-600">{item.version}</span><span className="font-semibold text-slate-900">{item.completed}/{item.total}</span></div>)}
            </CardContent></Card>
          </div>
          <Card className="border-0 shadow-sm"><CardHeader><CardTitle>Delivery</CardTitle></CardHeader><CardContent className="flex flex-wrap gap-6 text-sm"><span>Delivered: <strong>{data.summary.delivered}</strong></span><span>Menunggu delivery: <strong>{data.summary.pending_delivery}</strong></span><span>On-time rate: <strong>{data.summary.on_time_rate}%</strong></span></CardContent></Card>
        </div>
      )}
    </main>
  );
}
