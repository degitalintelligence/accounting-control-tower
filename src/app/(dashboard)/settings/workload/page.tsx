"use client";

import { useEffect, useState } from "react";
import { Loader2, Users } from "lucide-react";

export default function WorkloadPage() {
  const [rows, setRows] = useState<Array<{ profile_id: string; total: number; active: number; overdue: number; capacity_utilization: number | null; over_capacity: boolean; profile: { display_name: string; email: string | null; max_active_work_items: number } | null }>>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => { void fetch("/api/settings/workload").then((response) => response.json()).then((body) => setRows(body.data ?? [])).finally(() => setLoading(false)); }, []);
  return (
    <main className="page-canvas">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-ink">Tim &amp; beban kerja</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">Pantau pekerjaan tim dari antrean work item.</p>
      </div>
      <section className="surface-card max-w-4xl rounded-xl p-6">
        <Users className="mb-3 size-8 text-blue-600" />
        <h2 className="text-base font-semibold text-ink">Distribusi pekerjaan</h2>
        {loading ? <Loader2 className="mt-5 size-4 animate-spin text-slate-500" /> : rows.length === 0 ? <p className="mt-3 text-sm text-muted-foreground">Belum ada pekerjaan yang ditugaskan.</p> : <div className="mt-5 overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b text-xs text-muted-foreground"><th className="pb-2">Anggota</th><th className="pb-2">Total</th><th className="pb-2">Aktif</th><th className="pb-2">Kapasitas</th><th className="pb-2">Overdue</th></tr></thead><tbody>{rows.map((row) => <tr key={row.profile_id} className="border-b last:border-0"><td className="py-3 font-medium text-ink">{row.profile?.display_name ?? row.profile?.email ?? row.profile_id}</td><td className="py-3">{row.total}</td><td className="py-3">{row.active}</td><td className={row.over_capacity ? "py-3 font-semibold text-red-600" : "py-3"}>{row.capacity_utilization === null ? "—" : `${row.capacity_utilization}%`}</td><td className="py-3 text-red-500">{row.overdue}</td></tr>)}</tbody></table></div>}
      </section>
    </main>
  );
}
