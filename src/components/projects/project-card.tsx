"use client";

import { useRouter } from "next/navigation";
import { Calendar, Target } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/work-items/status-badge";
import { cn } from "@/lib/utils";
import type { WorkItemStatus } from "@/types/work-item";

interface ProjectCardProps {
  id: string;
  title: string;
  objective: string | null;
  status: string;
  target_date: string | null;
  stats?: {
    total_milestones: number;
    completed_milestones: number;
  };
  client_name?: string;
}

function formatTargetDate(iso: string): { label: string; isPast: boolean } {
  const date = new Date(iso);
  const now = new Date();
  const diffMs = date.getTime() - now.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  const formatted = date.toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  if (diffDays < 0) {
    return { label: `${Math.abs(diffDays)}h terlambat`, isPast: true };
  }
  if (diffDays === 0) {
    return { label: "Hari ini", isPast: false };
  }
  return { label: formatted, isPast: false };
}

export function ProjectCard({
  id,
  title,
  objective,
  status,
  target_date,
  stats,
  client_name,
}: ProjectCardProps) {
  const router = useRouter();
  const targetInfo = target_date ? formatTargetDate(target_date) : null;

  const total = stats?.total_milestones ?? 0;
  const completed = stats?.completed_milestones ?? 0;
  const progress = total > 0 ? Math.round((completed / total) * 100) : 0;

  const terminalStatuses: WorkItemStatus[] = ["completed", "cancelled"];
  const isTerminal = terminalStatuses.includes(status as WorkItemStatus);

  return (
    <button
      type="button"
      onClick={() => router.push(`/projects/${id}`)}
      className={cn(
        "surface-card w-full rounded-xl p-5 text-left transition-all",
        "hover:-translate-y-0.5 hover:shadow-md",
        "border border-slate-100 hover:border-slate-200",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40",
        "active:scale-[0.995]",
        isTerminal && "opacity-70"
      )}
    >
      {/* Top row: status badge */}
      <div className="flex items-center gap-2 flex-wrap mb-2">
        <Badge className="bg-blue-50 text-xs text-blue-700">Proyek</Badge>
        <StatusBadge status={status as WorkItemStatus} />
      </div>

      {/* Title */}
      <h3 className="mb-0.5 line-clamp-2 text-base font-semibold text-slate-900">
        {title}
      </h3>

      {/* Client Name */}
      {client_name && (
        <p className="mb-3 text-[11px] font-medium text-slate-500">
          {client_name}
        </p>
      )}

      {/* Objective (truncated) */}
      {objective && (
        <p className="mb-3 line-clamp-2 text-sm text-slate-500">
          {objective}
        </p>
      )}

      {/* Progress bar */}
      {total > 0 && (
        <div className="mb-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-slate-500">Milestone</span>
            <span className="text-xs font-semibold text-slate-700">
              {completed}/{total}
            </span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
            <div
              className={cn(
                "h-full rounded-full transition-all duration-300",
                progress === 100 ? "bg-emerald-500" : "bg-blue-500"
              )}
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      {/* Bottom row: target date */}
      <div className="flex items-center justify-between gap-3">
        {targetInfo ? (
          <div
            className={cn(
              "flex items-center gap-1 text-xs",
              targetInfo.isPast ? "text-red-500 font-medium" : "text-slate-400"
            )}
          >
            {targetInfo.isPast ? (
              <Calendar className="size-3 shrink-0" />
            ) : (
              <Target className="size-3 shrink-0" />
            )}
            {targetInfo.label}
          </div>
        ) : (
          <span className="text-xs text-slate-400">Tanpa tenggat</span>
        )}
      </div>
    </button>
  );
}
