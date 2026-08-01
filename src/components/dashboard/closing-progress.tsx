"use client";

import { useState } from "react";
import {
  CalendarClock,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  AlertCircle,
  CircleDot,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { ChildTask, ParentTask } from "@/hooks/use-dashboard";

type CheckStatus = "done" | "partial" | "danger";


const checkIcons: Record<CheckStatus, { icon: typeof CheckCircle2; color: string }> = {
  done: { icon: CheckCircle2, color: "text-[#20865a]" },
  partial: { icon: CircleDot, color: "text-[#9a6810]" },
  danger: { icon: AlertCircle, color: "text-[#c94040]" },
};

function ProgressBar({ value, className }: { value: number; className?: string }) {
  return (
    <div className={cn("h-1.5 bg-[#eef0ee] rounded-full overflow-hidden", className)}>
      <div
        className={cn(
          "h-full rounded-full transition-all duration-500",
          value >= 80 ? "bg-[#20865a]" : value >= 50 ? "bg-[#9a6810]" : "bg-[#c94040]"
        )}
        style={{ width: `${value}%` }}
      />
    </div>
  );
}

function ChildRow({ task }: { task: ChildTask }) {
  const ci = checkIcons[task.checkStatus];
  const CheckIcon = ci.icon;

  return (
    <div className="flex items-center gap-2 pl-7 pr-3 py-1.5">
      <CheckIcon className={cn("w-3.5 h-3.5 shrink-0", ci.color)} />
      <span className="text-[10px] font-medium text-[#1a2421] flex-1 min-w-0 truncate">
        {task.name}
      </span>
      <div className="w-20">
        <ProgressBar value={task.progress} className="h-1" />
      </div>
      <span className="text-[9px] text-[#8a9490] w-16 text-right shrink-0">
        {task.status}
      </span>
      <div className="w-5 h-5 rounded-full bg-[#e0e5e2] flex items-center justify-center text-[7px] font-bold text-[#4a5a55] shrink-0">
        {task.assigneeInitials}
      </div>
    </div>
  );
}

function ParentRow({ task }: { task: ParentTask }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div>
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 w-full px-3 py-2 hover:bg-[#f7f9f8] rounded-lg transition-colors text-left"
      >
        {expanded ? (
          <ChevronDown className="w-3.5 h-3.5 text-[#8a9490] shrink-0" />
        ) : (
          <ChevronRight className="w-3.5 h-3.5 text-[#8a9490] shrink-0" />
        )}
        <span className="text-[11px] font-semibold text-[#1a2421] flex-1 min-w-0 truncate">
          {task.name}
        </span>
        <div className="w-24">
          <ProgressBar value={task.progress} />
        </div>
        <span className="text-[10px] font-bold text-[#4a5a55] w-10 text-right shrink-0">
          {task.progress}%
        </span>
      </button>
      {expanded && (
        <div className="border-l-2 border-[#eef0ee] ml-5 mb-1">
          {task.children.map((c) => (
            <ChildRow key={c.id} task={c} />
          ))}
        </div>
      )}
    </div>
  );
}

export function ClosingProgress({ data = [], overallProgress = 0 }: { data?: ParentTask[]; overallProgress?: number }) {

  return (
    <div className="bg-white border border-[#dfe4e1] rounded-xl shadow-[0_1px_2px_rgba(24,32,31,.04),0_8px_30px_rgba(24,32,31,.045)]">
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#eef0ee]">
        <div className="flex items-center gap-2">
          <CalendarClock className="w-4 h-4 text-[#20865a]" />
          <h3 className="text-sm font-bold text-[#1a2421]">
            Closing Progress
          </h3>
        </div>
        <span className="text-sm font-bold text-[#20865a]">
          {overallProgress}%
        </span>
      </div>
      <div className="px-4 pt-3 pb-1">
        <ProgressBar value={overallProgress} className="h-2" />
      </div>
      <div className="p-2 space-y-0.5">
        {data.map((t) => (
          <ParentRow key={t.id} task={t} />
        ))}
      </div>
    </div>
  );
}
