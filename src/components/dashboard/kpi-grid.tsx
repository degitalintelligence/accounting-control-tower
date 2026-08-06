"use client";

import { Clock3, Gauge, ShieldCheck, TimerReset, TrendingUp } from "lucide-react";
import { StatCard } from "@/components/dashboard/stat-card";
import type { DashboardKpis } from "@/types/dashboard";
import { useI18n } from "@/components/i18n-provider";

export function KpiGrid({ kpis }: { kpis: DashboardKpis | null }) {
  if (!kpis) return null;
  const { locale } = useI18n();
  const text = locale === "id-ID" ? {
    approval: "First-pass approval", reviews: "review", average: "Rata-rata review", hours: "jam", measured: "item terukur", compliance: "SOP compliance", sample: "sample", autonomous: "Autonomous completion", eligible: "eligible", intervention: "Intervensi manager", event: "event terukur",
  } : {
    approval: "First-pass approval", reviews: "reviews", average: "Average review", hours: "hours", measured: "measured items", compliance: "SOP compliance", sample: "samples", autonomous: "Autonomous completion", eligible: "eligible", intervention: "Manager interventions", event: "measured events",
  };
  return <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-5">
    <StatCard variant="success" icon={Gauge} label={text.approval} value={`${kpis.first_pass_approval_rate}%`} description={`${kpis.first_pass_approved}/${kpis.reviewed_items} ${text.reviews}`} />
    <StatCard variant="neutral" icon={Clock3} label={text.average} value={`${kpis.average_review_hours} ${text.hours}`} description={`${kpis.reviewed_items_with_duration} ${text.measured}`} />
    <StatCard variant="success" icon={ShieldCheck} label={text.compliance} value={`${kpis.sop_compliance_rate}%`} description={`${kpis.sop_samples_compliant}/${kpis.sop_samples_audited} ${text.sample}`} />
    <StatCard variant="success" icon={TrendingUp} label={text.autonomous} value={`${kpis.autonomous_completion_rate}%`} description={`${kpis.autonomous_completed}/${kpis.eligible_completed} ${text.eligible}`} />
    <StatCard variant="warning" icon={TimerReset} label={text.intervention} value={kpis.manager_intervention_count} description={text.event} />
  </div>;
}
