"use client";

import { useRouter } from "next/navigation";
import { FileText, ChevronRight, Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { WorkItemType, WorkItemPriority } from "@/types/work-item";
import type { TemplateVersion } from "@/types/template";
import { useI18n } from "@/components/i18n-provider";

interface TemplateCardProps {
  id: string;
  name: string;
  description: string | null;
  type: WorkItemType;
  priority: WorkItemPriority;
  latest_version: TemplateVersion | null;
  client_name?: string;
  onInstantiate?: (id: string) => void;
}

const TYPE_CONFIG: Record<WorkItemType, { label: string; className: string }> = {
  routine: { label: "work.routine", className: "bg-slate-100 text-slate-600" },
  project: { label: "work.project", className: "bg-blue-50 text-blue-600" },
  ad_hoc: { label: "work.adHoc", className: "bg-orange-50 text-orange-600" },
  report: { label: "work.report", className: "bg-purple-50 text-purple-600" },
};

const PRIORITY_CONFIG: Record<WorkItemPriority, { label: string; dotClass: string; textClass: string }> = {
  low: { label: "priority.low", dotClass: "bg-slate-400", textClass: "text-slate-500" },
  medium: { label: "priority.medium", dotClass: "bg-blue-500", textClass: "text-blue-600" },
  high: { label: "priority.high", dotClass: "bg-amber-500", textClass: "text-amber-600" },
  critical: { label: "priority.critical", dotClass: "bg-red-500", textClass: "text-red-600" },
};

function getStepCount(version: TemplateVersion | null): number {
  if (!version?.child_blueprint) return 0;
  const bp = version.child_blueprint;
  if (Array.isArray(bp)) return bp.length;
  return 0;
}

export function TemplateCard({
  id,
  name,
  description,
  type,
  priority,
  latest_version,
  client_name,
  onInstantiate,
}: TemplateCardProps) {
  const router = useRouter();
  const { t } = useI18n();
  const typeConfig = TYPE_CONFIG[type] ?? TYPE_CONFIG.routine;
  const priorityConfig = PRIORITY_CONFIG[priority] ?? PRIORITY_CONFIG.medium;
  const stepCount = getStepCount(latest_version);

  return (
    <button
      type="button"
      onClick={() => router.push(`/templates/${id}`)}
      className={cn(
        "surface-card w-full rounded-xl p-5 text-left transition-all",
        "hover:-translate-y-0.5 hover:shadow-md",
        "border border-slate-100 hover:border-slate-200",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40",
        "active:scale-[0.995]"
      )}
    >
      {/* Top row: badges */}
      <div className="flex items-center gap-2 flex-wrap mb-2">
        <Badge className={cn(typeConfig.className, "text-xs")}>
          {t(typeConfig.label as never)}
        </Badge>
        <span className={cn("inline-flex items-center gap-1.5 text-xs font-medium", priorityConfig.textClass)}>
          <span className={cn("size-1.5 rounded-full shrink-0", priorityConfig.dotClass)} />
          {t(priorityConfig.label as never)}
        </span>
      </div>

      {/* Name */}
      <div className="flex items-start gap-2 mb-1.5">
        <FileText className="size-4 text-slate-400 mt-0.5 shrink-0" />
        <h3 className="text-base font-semibold text-slate-900 line-clamp-2">
          {name}
        </h3>
      </div>

      {/* Client Name */}
      {client_name && (
        <p className="mb-2 ml-6 text-[11px] font-medium text-slate-500">
          {client_name}
        </p>
      )}

      {/* Description */}
      {description && (
        <p className="mb-3 ml-6 line-clamp-2 text-sm text-slate-500">
          {description}
        </p>
      )}
      {!description && <div className="mb-3" />}

      {/* Bottom row: step count + action */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          {stepCount > 0 && (
            <div className="flex items-center gap-1 text-xs text-slate-500">
              <Clock className="size-3 shrink-0" />
              {stepCount} langkah
            </div>
          )}
          {latest_version && (
            <span className="text-xs text-slate-400">
              v{latest_version.version_number}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1">
          {onInstantiate && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 px-2 text-xs text-blue-600 hover:bg-blue-50 hover:text-blue-700"
              onClick={(e) => {
                e.stopPropagation();
                onInstantiate(id);
              }}
            >
              Gunakan
            </Button>
          )}
          <ChevronRight className="size-4 text-slate-300" />
        </div>
      </div>
    </button>
  );
}
