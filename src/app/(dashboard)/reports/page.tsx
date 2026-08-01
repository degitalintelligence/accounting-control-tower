"use client";

import { useEffect, useState } from "react";
import { Activity, AlertTriangle, CheckCircle2, ClipboardList } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

type ReportData = {
  summary: { total: number; active: number; completed: number; overdue: number; on_time_rate: number };
  byType: { type: string; total: number; completed: number }[];
  byStatus: { status: string; total: number }[];
  monthly: { month: string; created: number; completed: number }[];
};

const typeLabels: Record<string, string> = { routine: "Routine", project: "Project", ad_hoc: "Ad Hoc", report: "Deliverable" };
const statusLabels: Record<string, string> = {
  assigned: "Ditugaskan", in_progress: "Sedang dikerjakan", blocked: "Terblokir", submitted: "Dikirim",
  under_review: "Dalam review", revision_required: "Perlu revisi", awaiting_approval: "Menunggu persetujuan",
  approved: "Disetujui", completed: "Selesai",
};

function formatMonth(value: string) {
  return new Intl.DateTimeFormat("id-ID", { month: "short" }).format(new Date(`${value}-01T00:00:00`));
}

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
            <Card className="border-0 shadow-sm"><CardHeader><CardTitle>Jenis pekerjaan</CardTitle></CardHeader><CardContent className="space-y-4">
              {data.byType.map((item) => <div key={item.type}><div className="mb-1 flex justify-between text-sm"><span>{typeLabels[item.type]}</span><span className="text-slate-500">{item.completed}/{item.total} selesai</span></div><div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-blue-500" style={{ width: `${item.total ? (item.completed / item.total) * 100 : 0}%` }} /></div></div>)}
            </CardContent></Card>
            <Card className="border-0 shadow-sm"><CardHeader><CardTitle>Status pekerjaan</CardTitle></CardHeader><CardContent className="grid grid-cols-2 gap-x-6 gap-y-3">
              {data.byStatus.filter((item) => item.total > 0).map((item) => <div key={item.status} className="flex items-center justify-between border-b border-slate-100 pb-2 text-sm"><span className="text-slate-600">{statusLabels[item.status] ?? item.status}</span><span className="font-semibold text-slate-900">{item.total}</span></div>)}
            </CardContent></Card>
          </div>

          <Card className="border-0 shadow-sm"><CardHeader><CardTitle>Tren enam bulan</CardTitle></CardHeader><CardContent><div className="overflow-x-auto pb-2"><div className="grid min-w-[30rem] grid-cols-6 items-end gap-3 sm:min-w-0 sm:gap-6">{data.monthly.map((item) => { const max = Math.max(...data.monthly.flatMap((month) => [month.created, month.completed]), 1); return <div key={item.month} className="flex min-w-0 flex-col items-center gap-2"><div className="flex h-36 w-full items-end justify-center gap-1"><div className="w-1/3 rounded-t bg-sentinel-blue/60" style={{ height: `${(item.created / max) * 100}%` }} /><div className="w-1/3 rounded-t bg-sentinel-green" style={{ height: `${(item.completed / max) * 100}%` }} /></div><span className="text-xs text-muted-foreground">{formatMonth(item.month)}</span></div>; })}</div></div><div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted-foreground"><span><i className="mr-1 inline-block size-2 rounded-full bg-sentinel-blue/60" />Dibuat</span><span><i className="mr-1 inline-block size-2 rounded-full bg-sentinel-green" />Selesai</span><span className="sm:ml-auto">On-time rate: <strong className="text-ink">{data.summary.on_time_rate}%</strong></span></div></CardContent></Card>
        </div>
      )}
    </main>
  );
}
