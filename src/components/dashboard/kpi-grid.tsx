"use client";

import { Clock3, Gauge, ShieldCheck, TimerReset, TrendingUp } from "lucide-react";
import { StatCard } from "@/components/dashboard/stat-card";
import type { DashboardKpis } from "@/types/dashboard";

export function KpiGrid({ kpis }: { kpis: DashboardKpis | null }) {
  if (!kpis) return null;
  return <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-5">
    <StatCard variant="success" icon={Gauge} label="First-pass approval" value={`${kpis.first_pass_approval_rate}%`} description={`${kpis.first_pass_approved}/${kpis.reviewed_items} review`} />
    <StatCard variant="neutral" icon={Clock3} label="Rata-rata review" value={`${kpis.average_review_hours} jam`} description={`${kpis.reviewed_items_with_duration} item terukur`} />
    <StatCard variant="success" icon={ShieldCheck} label="SOP compliance" value={`${kpis.sop_compliance_rate}%`} description={`${kpis.sop_samples_compliant}/${kpis.sop_samples_audited} sample`} />
    <StatCard variant="success" icon={TrendingUp} label="Autonomous completion" value={`${kpis.autonomous_completion_rate}%`} description={`${kpis.autonomous_completed}/${kpis.eligible_completed} eligible`} />
    <StatCard variant="warning" icon={TimerReset} label="Intervensi manager" value={kpis.manager_intervention_count} description="event terukur" />
  </div>;
}
