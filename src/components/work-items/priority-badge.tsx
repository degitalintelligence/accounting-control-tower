"use client";

import { cn } from "@/lib/utils";
import type { WorkItemPriority } from "@/types/work-item";
import { useI18n } from "@/components/i18n-provider";

const PRIORITY_CONFIG: Record<WorkItemPriority, { label: string; dotClass: string; textClass: string }> = {
  low: {
    label: "priority.low",
    dotClass: "bg-slate-400",
    textClass: "text-slate-500",
  },
  medium: {
    label: "priority.medium",
    dotClass: "bg-blue-500",
    textClass: "text-blue-600",
  },
  high: {
    label: "priority.high",
    dotClass: "bg-amber-500",
    textClass: "text-amber-600",
  },
  critical: {
    label: "priority.critical",
    dotClass: "bg-red-500",
    textClass: "text-red-600",
  },
};

interface PriorityBadgeProps {
  priority: WorkItemPriority;
  className?: string;
}

export function PriorityBadge({ priority, className }: PriorityBadgeProps) {
  const config = PRIORITY_CONFIG[priority] ?? PRIORITY_CONFIG.medium;
  const { t } = useI18n();

  return (
    <span className={cn("inline-flex items-center gap-1.5 text-[11px] font-medium", config.textClass, className)}>
      <span className={cn("size-1.5 rounded-full shrink-0", config.dotClass)} />
      {t(config.label as never)}
    </span>
  );
}
