"use client";

import { BrainCircuit, CheckCircle2, Flag, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { DashboardInsights } from "@/hooks/use-dashboard";
import { useI18n } from "@/components/i18n-provider";

export function InsightsCard({ insights, loading, error, onGenerate }: { insights: DashboardInsights | null; loading: boolean; error: string | null; onGenerate: () => void }) {
  const { t } = useI18n();

  return (
    <section className="bg-white border border-[#dfe4e1] rounded-xl shadow-[0_1px_2px_rgba(24,32,31,.04),0_8px_30px_rgba(24,32,31,.045)]">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-[#eef0ee]">
        <BrainCircuit className="w-4 h-4 text-[#20865a]" />
        <div>
          <h2 className="text-sm font-bold text-[#1a2421]">{t("dashboard.weeklyInsight")}</h2>
          <p className="text-[10px] text-[#8a9490]">{t("dashboard.weeklyInsightDescription")}</p>
          {!insights && !loading && !error && <Button type="button" size="sm" variant="outline" onClick={onGenerate} className="mt-2 gap-2"><BrainCircuit className="size-3.5" />Generate insight</Button>}
        </div>
      </div>
      {loading && <div className="flex items-center gap-2 p-4 text-sm text-slate-500"><Loader2 className="size-4 animate-spin" />Generating insight...</div>}
      {error && <div role="alert" className="flex items-center justify-between gap-3 p-4 text-sm text-red-700"><span>{error}</span><Button type="button" size="sm" variant="outline" onClick={onGenerate} className="shrink-0 gap-2"><RefreshCw className="size-3.5" />Retry</Button></div>}
      {insights && <div className="p-4 space-y-4">
        <p className="text-sm leading-6 text-[#4a5a55]">{insights.summary}</p>
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Flag className="w-3.5 h-3.5 text-[#9a6810]" />
            <h3 className="text-xs font-bold uppercase tracking-wide text-[#1a2421]">{t("dashboard.priority")}</h3>
          </div>
          <ul className="space-y-2">
            {insights.priorities.map((priority, index) => (
              <li key={`${priority}-${index}`} className="flex gap-2 text-xs leading-5 text-[#4a5a55]">
                <span className="text-[#9a6810]">{index + 1}.</span>
                <span>{priority}</span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle2 className="w-3.5 h-3.5 text-[#20865a]" />
            <h3 className="text-xs font-bold uppercase tracking-wide text-[#1a2421]">{t("dashboard.signals")}</h3>
          </div>
          <ul className="space-y-2">
            {insights.signals.map((signal, index) => (
              <li key={`${signal}-${index}`} className="text-xs leading-5 text-[#4a5a55]">{signal}</li>
            ))}
          </ul>
        </div>
      </div>}
    </section>
  );
}
