"use client";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { WorkItemStatus } from "@/types/work-item";

const STATUS_CONFIG: Record<WorkItemStatus, { label: string; className: string }> = {
  draft: {
    label: "Draft",
    className: "bg-slate-100 text-slate-600",
  },
  assigned: {
    label: "Ditugaskan",
    className: "bg-blue-50 text-blue-700",
  },
  in_progress: {
    label: "Sedang Dikerjakan",
    className: "bg-blue-50 text-blue-700",
  },
  blocked: {
    label: "Terblokir",
    className: "bg-red-50 text-red-700",
  },
  submitted: {
    label: "Menunggu Review",
    className: "bg-purple-50 text-purple-700",
  },
  under_review: {
    label: "Sedang Direview",
    className: "bg-purple-50 text-purple-700",
  },
  revision_required: {
    label: "Perlu Revisi",
    className: "bg-amber-50 text-amber-700",
  },
  awaiting_approval: {
    label: "Menunggu Persetujuan",
    className: "bg-amber-50 text-amber-700",
  },
  approved: {
    label: "Disetujui",
    className: "bg-emerald-50 text-emerald-700",
  },
  completed: {
    label: "Selesai",
    className: "bg-emerald-50 text-emerald-700",
  },
  cancelled: {
    label: "Dibatalkan",
    className: "bg-slate-100 text-slate-500",
  },
};

interface StatusBadgeProps {
  status: WorkItemStatus;
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const config = STATUS_CONFIG[status] ?? STATUS_CONFIG.draft;

  return (
    <Badge className={cn(config.className, "text-[11px]", className)}>
      {config.label}
    </Badge>
  );
}
