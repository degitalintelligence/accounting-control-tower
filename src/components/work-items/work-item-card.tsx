"use client";

import { useRouter } from "next/navigation";
import { Calendar, AlertCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { StatusBadge } from "./status-badge";
import { PriorityBadge } from "./priority-badge";
import { cn } from "@/lib/utils";
import type { WorkItemType, WorkItemStatus, WorkItemPriority, Assignment } from "@/types/work-item";
import { useI18n } from "@/components/i18n-provider";
import { formatDate } from "@/lib/i18n";

interface WorkItemCardProps {
  id: string;
  title: string;
  type: WorkItemType;
  status: WorkItemStatus;
  priority: WorkItemPriority;
  due_at: string | null;
  assignments?: Assignment[];
  clientName?: string;
}

const TYPE_CONFIG: Record<WorkItemType, { label: string; className: string }> = {
  routine: { label: "work.routine", className: "bg-slate-100 text-slate-600" },
  project: { label: "work.project", className: "bg-blue-50 text-blue-600" },
  ad_hoc: { label: "work.adHoc", className: "bg-orange-50 text-orange-600" },
  report: { label: "work.report", className: "bg-purple-50 text-purple-600" },
};

const ROLE_LABELS: Record<string, string> = {
  maker: "M",
  checker: "C",
  approver: "A",
};

function formatDueDate(iso: string, locale: "id-ID" | "en-US", today: string, tomorrow: string, overdueHours: string): { label: string; isOverdue: boolean } {
  const date = new Date(iso);
  const now = new Date();
  const diffMs = date.getTime() - now.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  const formatted = formatDate(date, locale, {
    day: "numeric",
    month: "short",
  });

  if (diffDays < 0) {
    return { label: `${Math.abs(diffDays)}${overdueHours}`, isOverdue: true };
  }
  if (diffDays === 0) {
    return { label: today, isOverdue: false };
  }
  if (diffDays === 1) {
    return { label: tomorrow, isOverdue: false };
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
  clientName,
}: WorkItemCardProps) {
  const router = useRouter();
  const { locale, t } = useI18n();
  const typeConfig = TYPE_CONFIG[type] ?? TYPE_CONFIG.routine;
  const dueInfo = due_at ? formatDueDate(due_at, locale, t("work.today"), t("work.tomorrow"), t("work.overdueHours")) : null;

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
          {t(typeConfig.label as never)}
        </Badge>
        <StatusBadge status={status} />
        <PriorityBadge priority={priority} />
      </div>

      {/* Title */}
      <h3 className="text-sm font-medium text-slate-900 line-clamp-2 mb-1">
        {title}
      </h3>

      {/* Client Name */}
      {clientName && (
        <p className="text-[11px] text-slate-500 mb-3 font-medium">
          {clientName}
        </p>
      )}

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
          <span className="text-[11px] text-slate-300">{t("work.noDueDate")}</span>
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
