"use client";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { WorkItemStatus } from "@/types/work-item";
import { useI18n } from "@/components/i18n-provider";

const STATUS_CONFIG: Record<WorkItemStatus, { label: string; className: string }> = {
  draft: {
    label: "status.draft",
    className: "bg-slate-100 text-slate-600",
  },
  assigned: {
    label: "status.assigned",
    className: "bg-blue-50 text-blue-700",
  },
  in_progress: {
    label: "status.inProgress",
    className: "bg-blue-50 text-blue-700",
  },
  blocked: {
    label: "status.blocked",
    className: "bg-red-50 text-red-700",
  },
  submitted: {
    label: "status.submitted",
    className: "bg-purple-50 text-purple-700",
  },
  under_review: {
    label: "status.underReview",
    className: "bg-purple-50 text-purple-700",
  },
  revision_required: {
    label: "status.revisionRequired",
    className: "bg-amber-50 text-amber-700",
  },
  awaiting_approval: {
    label: "status.awaitingApproval",
    className: "bg-amber-50 text-amber-700",
  },
  approved: {
    label: "status.approved",
    className: "bg-emerald-50 text-emerald-700",
  },
  completed: {
    label: "status.completed",
    className: "bg-emerald-50 text-emerald-700",
  },
  cancelled: {
    label: "status.cancelled",
    className: "bg-slate-100 text-slate-500",
  },
};

interface StatusBadgeProps {
  status: WorkItemStatus;
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const config = STATUS_CONFIG[status] ?? STATUS_CONFIG.draft;
  const { t } = useI18n();

  return (
    <Badge className={cn(config.className, "text-[11px]", className)}>
      {t(config.label as never)}
    </Badge>
  );
}
