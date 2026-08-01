"use client";

import { cn } from "@/lib/utils";
import type { WorkItemPriority } from "@/types/work-item";

const PRIORITY_CONFIG: Record<WorkItemPriority, { label: string; dotClass: string; textClass: string }> = {
  low: {
    label: "Rendah",
    dotClass: "bg-slate-400",
    textClass: "text-slate-500",
  },
  medium: {
    label: "Sedang",
    dotClass: "bg-blue-500",
    textClass: "text-blue-600",
  },
  high: {
    label: "Tinggi",
    dotClass: "bg-amber-500",
    textClass: "text-amber-600",
  },
  critical: {
    label: "Kritis",
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

  return (
    <span className={cn("inline-flex items-center gap-1.5 text-[11px] font-medium", config.textClass, className)}>
      <span className={cn("size-1.5 rounded-full shrink-0", config.dotClass)} />
      {config.label}
    </span>
  );
}
