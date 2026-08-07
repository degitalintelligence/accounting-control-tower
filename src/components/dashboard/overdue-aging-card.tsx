"use client";

import Link from "next/link";
import type { OverdueAgingBucket } from "@/types/dashboard";
import { useI18n } from "@/components/i18n-provider";

export function OverdueAgingCard({ buckets }: { buckets: OverdueAgingBucket[] }) {
  const total = buckets.reduce((sum, bucket) => sum + bucket.count, 0);
  const { t } = useI18n();
  return <section className="surface-card rounded-xl p-4" aria-labelledby="overdue-aging-title">
    <div className="flex items-start justify-between gap-3">
      <div>
        <h2 id="overdue-aging-title" className="text-base font-semibold text-slate-900">{t("dashboard.overdueAging")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("dashboard.overdueAgingDescription")}</p>
      </div>
      <Link href="/work-items?tab=overdue" className="text-sm font-semibold text-blue-600 hover:text-blue-700">{t("common.viewItems")}</Link>
    </div>
    {total === 0 ? <p className="mt-5 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700">{t("common.noOverdue")} (Tidak ada item overdue)</p> : <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-5">{buckets.map((bucket) => <Link key={bucket.bucket} href={`/work-items?tab=overdue&aging=${bucket.bucket}`} className="rounded-lg border border-slate-200 p-3 transition hover:border-blue-300 hover:bg-blue-50"><p className="text-xs text-muted-foreground">{bucket.label}</p><p className="mt-1 text-xl font-bold text-slate-900">{bucket.count}</p><p className="text-xs text-muted-foreground">{t("common.weight")} {bucket.weight}</p></Link>)}</div>}
  </section>;
}
