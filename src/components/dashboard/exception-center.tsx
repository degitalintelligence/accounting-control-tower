"use client";

import {
  AlertTriangle,
  XCircle,
  Ban,
  ArrowUpRight,
  Search,
  MessageSquareWarning,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { ExceptionItem } from "@/hooks/use-dashboard";
import Link from "next/link";

type Severity = "critical" | "warning" | "blocked";

const severityBar: Record<Severity, string> = {
  critical: "bg-[#c94040]",
  warning: "bg-[#9a6810]",
  blocked: "bg-[#7c4dff]",
};

const tagStyles: Record<Severity, { bg: string; text: string; icon: typeof AlertTriangle }> = {
  critical: {
    bg: "bg-[#fceded]",
    text: "text-[#c94040]",
    icon: AlertTriangle,
  },
  warning: {
    bg: "bg-[#fff4d8]",
    text: "text-[#9a6810]",
    icon: XCircle,
  },
  blocked: {
    bg: "bg-[#f0ecff]",
    text: "text-[#7c4dff]",
    icon: Ban,
  },
};

function ExceptionRow({ exception }: { exception: ExceptionItem }) {
  const s = tagStyles[exception.severity];
  const TagIcon = s.icon;

  return (
    <Link href={`/work-items/${exception.id}`} className="flex items-stretch gap-0 group rounded-lg transition-colors hover:bg-muted">
      {/* Severity bar */}
      <div
        className={cn(
          "w-1 rounded-l-lg shrink-0 my-1",
          severityBar[exception.severity]
        )}
      />
      <div className="flex items-center gap-3 px-3 py-2.5 flex-1 min-w-0">
        {/* Tag */}
        <span
          className={cn(
            "inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-sm font-extrabold shrink-0",
            s.bg,
            s.text
          )}
        >
          <TagIcon className="w-2.5 h-2.5" />
          {exception.tag}
        </span>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-ink truncate">
            <span className="text-[#8a9490] font-mono">{exception.taskId}</span>
            {" \u2014 "}
            {exception.title}
          </p>
          <p className="text-sm text-muted-foreground truncate mt-0.5">
            {exception.description}
          </p>
        </div>

        {/* Assignee */}
        <div className="flex items-center gap-1.5 shrink-0">
          <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-xs font-bold text-muted-foreground" aria-label={`Penanggung jawab ${exception.assignee}`}>
            {exception.assigneeInitials}
          </div>
          <span className="text-sm text-muted-foreground font-medium">
            {exception.assignee}
          </span>
        </div>

        {/* Action */}
        <span aria-label={`${exception.actionLabel} ${exception.title}`} className="control-interactive flex items-center gap-0.5 rounded px-1 text-sm font-semibold text-success shrink-0 sm:opacity-0 sm:group-hover:opacity-100">
          {exception.actionLabel}
          <ArrowUpRight className="w-3 h-3" />
        </span>
      </div>
    </Link>
  );
}

export function ExceptionCenter({ data = [], count = 0 }: { data?: ExceptionItem[]; count?: number }) {
  return (
    <div className="bg-white border border-[#dfe4e1] rounded-xl shadow-[0_1px_2px_rgba(24,32,31,.04),0_8px_30px_rgba(24,32,31,.045)]">
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#eef0ee]">
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-[#c94040]" />
          <h3 className="text-base font-bold text-ink">
            Pusat Pengecualian
          </h3>
          <span className="bg-[#fceded] text-[#c94040] text-[9px] font-bold px-1.5 py-0.5 rounded-full">
            {count}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <Link href="/work-items?tab=overdue" aria-label="Buka daftar pengecualian" className="control-interactive flex items-center gap-1 rounded px-2 py-1 text-sm text-muted-foreground">
            <Search className="w-3 h-3" />
            Saring
          </Link>
          <Link href="/work-items?tab=overdue" className="control-interactive flex items-center gap-1 rounded px-2 py-1 text-sm font-semibold text-success">
            <MessageSquareWarning className="w-3 h-3" />
            Tindak lanjuti
          </Link>
        </div>
      </div>
      <div className="p-2 space-y-0.5">
        {data.map((e) => (
          <ExceptionRow key={e.id} exception={e} />
        ))}
      </div>
    </div>
  );
}
