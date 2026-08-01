"use client";

import { useRouter } from "next/navigation";
import { FileText, ChevronRight, Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { WorkItemType, WorkItemPriority } from "@/types/work-item";
import type { TemplateVersion } from "@/types/template";

interface TemplateCardProps {
  id: string;
  name: string;
  description: string | null;
  type: WorkItemType;
  priority: WorkItemPriority;
  latest_version: TemplateVersion | null;
  onInstantiate?: (id: string) => void;
}

const TYPE_CONFIG: Record<WorkItemType, { label: string; className: string }> = {
  routine: { label: "Rutin", className: "bg-slate-100 text-slate-600" },
  project: { label: "Proyek", className: "bg-blue-50 text-blue-600" },
  ad_hoc: { label: "Ad Hoc", className: "bg-orange-50 text-orange-600" },
  report: { label: "Laporan", className: "bg-purple-50 text-purple-600" },
};

const PRIORITY_CONFIG: Record<WorkItemPriority, { label: string; dotClass: string; textClass: string }> = {
  low: { label: "Rendah", dotClass: "bg-slate-400", textClass: "text-slate-500" },
  medium: { label: "Sedang", dotClass: "bg-blue-500", textClass: "text-blue-600" },
  high: { label: "Tinggi", dotClass: "bg-amber-500", textClass: "text-amber-600" },
  critical: { label: "Kritis", dotClass: "bg-red-500", textClass: "text-red-600" },
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
  onInstantiate,
}: TemplateCardProps) {
  const router = useRouter();
  const typeConfig = TYPE_CONFIG[type] ?? TYPE_CONFIG.routine;
  const priorityConfig = PRIORITY_CONFIG[priority] ?? PRIORITY_CONFIG.medium;
  const stepCount = getStepCount(latest_version);

  return (
    <button
      type="button"
      onClick={() => router.push(`/templates/${id}`)}
      className={cn(
        "w-full text-left rounded-xl bg-white p-4 transition-all",
        "shadow-[0_1px_3px_rgba(0,0,0,.06)] hover:shadow-[0_4px_16px_rgba(0,0,0,.08)]",
        "border border-slate-100 hover:border-slate-200",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40",
        "active:scale-[0.995]"
      )}
    >
      {/* Top row: badges */}
      <div className="flex items-center gap-2 flex-wrap mb-2">
        <Badge className={cn(typeConfig.className, "text-[10px]")}>
          {typeConfig.label}
        </Badge>
        <span className={cn("inline-flex items-center gap-1.5 text-[11px] font-medium", priorityConfig.textClass)}>
          <span className={cn("size-1.5 rounded-full shrink-0", priorityConfig.dotClass)} />
          {priorityConfig.label}
        </span>
      </div>

      {/* Name */}
      <div className="flex items-start gap-2 mb-1.5">
        <FileText className="size-4 text-slate-400 mt-0.5 shrink-0" />
        <h3 className="text-sm font-medium text-slate-900 line-clamp-2">
          {name}
        </h3>
      </div>

      {/* Description */}
      {description && (
        <p className="text-[12px] text-slate-500 line-clamp-2 mb-3 ml-6">
          {description}
        </p>
      )}
      {!description && <div className="mb-3" />}

      {/* Bottom row: step count + action */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          {stepCount > 0 && (
            <div className="flex items-center gap-1 text-[11px] text-slate-400">
              <Clock className="size-3 shrink-0" />
              {stepCount} langkah
            </div>
          )}
          {latest_version && (
            <span className="text-[11px] text-slate-300">
              v{latest_version.version_number}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1">
          {onInstantiate && (
            <Button
              variant="ghost"
              size="sm"
              className="text-blue-600 hover:text-blue-700 hover:bg-blue-50 h-7 px-2 text-[11px]"
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
