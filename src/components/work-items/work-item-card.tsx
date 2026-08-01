"use client";

import { useRouter } from "next/navigation";
import { Calendar, AlertCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { StatusBadge } from "./status-badge";
import { PriorityBadge } from "./priority-badge";
import { cn } from "@/lib/utils";
import type { WorkItemType, WorkItemStatus, WorkItemPriority, Assignment } from "@/types/work-item";

interface WorkItemCardProps {
  id: string;
  title: string;
  type: WorkItemType;
  status: WorkItemStatus;
  priority: WorkItemPriority;
  due_at: string | null;
  assignments?: Assignment[];
}

const TYPE_CONFIG: Record<WorkItemType, { label: string; className: string }> = {
  routine: { label: "Rutin", className: "bg-slate-100 text-slate-600" },
  project: { label: "Proyek", className: "bg-blue-50 text-blue-600" },
  ad_hoc: { label: "Ad Hoc", className: "bg-orange-50 text-orange-600" },
  report: { label: "Laporan", className: "bg-purple-50 text-purple-600" },
};

const ROLE_LABELS: Record<string, string> = {
  maker: "M",
  checker: "C",
  approver: "A",
};

function formatDueDate(iso: string): { label: string; isOverdue: boolean } {
  const date = new Date(iso);
  const now = new Date();
  const diffMs = date.getTime() - now.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  const formatted = date.toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
  });

  if (diffDays < 0) {
    return { label: `${Math.abs(diffDays)}h terlambat`, isOverdue: true };
  }
  if (diffDays === 0) {
    return { label: "Hari ini", isOverdue: false };
  }
  if (diffDays === 1) {
    return { label: "Besok", isOverdue: false };
  }
  return { label: formatted, isOverdue: false };
}

export function WorkItemCard({
  id,
  title,
  type,
  status,
  priority,
  due_at,
  assignments = [],
}: WorkItemCardProps) {
  const router = useRouter();
  const typeConfig = TYPE_CONFIG[type] ?? TYPE_CONFIG.routine;
  const dueInfo = due_at ? formatDueDate(due_at) : null;

  const terminalStatuses: WorkItemStatus[] = ["completed", "cancelled"];
  const isTerminal = terminalStatuses.includes(status);

  return (
    <button
      type="button"
      onClick={() => router.push(`/work-items/${id}`)}
      className={cn(
        "w-full text-left rounded-xl bg-white p-4 transition-all",
        "shadow-[0_1px_3px_rgba(0,0,0,.06)] hover:shadow-[0_4px_16px_rgba(0,0,0,.08)]",
        "border border-slate-100 hover:border-slate-200",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40",
        "active:scale-[0.995]",
        isTerminal && "opacity-70"
      )}
    >
      {/* Top row: badges */}
      <div className="flex items-center gap-2 flex-wrap mb-2">
        <Badge className={cn(typeConfig.className, "text-[10px]")}>
          {typeConfig.label}
        </Badge>
        <StatusBadge status={status} />
        <PriorityBadge priority={priority} />
      </div>

      {/* Title */}
      <h3 className="text-sm font-medium text-slate-900 line-clamp-2 mb-3">
        {title}
      </h3>

      {/* Bottom row: due date + assignees */}
      <div className="flex items-center justify-between gap-3">
        {/* Due date */}
        {dueInfo ? (
          <div
            className={cn(
              "flex items-center gap-1 text-[11px]",
              dueInfo.isOverdue ? "text-red-500 font-medium" : "text-slate-400"
            )}
          >
            {dueInfo.isOverdue ? (
              <AlertCircle className="size-3 shrink-0" />
            ) : (
              <Calendar className="size-3 shrink-0" />
            )}
            {dueInfo.label}
          </div>
        ) : (
          <span className="text-[11px] text-slate-300">Tanpa tenggat</span>
        )}

        {/* Assignee avatars */}
        {assignments.length > 0 && (
          <div className="flex items-center -space-x-1.5">
            {assignments.slice(0, 4).map((a) => (
              <Avatar key={a.id} size="sm">
                <AvatarFallback className="bg-slate-200 text-slate-600 text-[9px] font-bold">
                  {ROLE_LABELS[a.role] ?? "?"}
                </AvatarFallback>
              </Avatar>
            ))}
            {assignments.length > 4 && (
              <Avatar size="sm">
                <AvatarFallback className="bg-slate-100 text-slate-500 text-[9px] font-bold">
                  +{assignments.length - 4}
                </AvatarFallback>
              </Avatar>
            )}
          </div>
        )}
      </div>
    </button>
  );
}
