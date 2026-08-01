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

type Severity = "critical" | "warning" | "blocked";

interface Exception {
  id: string;
  severity: Severity;
  tag: string;
  taskId: string;
  title: string;
  description: string;
  assignee: string;
  assigneeInitials: string;
  actionLabel: string;
}

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

const mockExceptions: Exception[] = [
  {
    id: "1",
    severity: "critical",
    tag: "CRITICAL",
    taskId: "WI-104",
    title: "Rekons Bank Mandiri",
    description: "3 hari overdue, belum ada submission dari Rina",
    assignee: "Rina",
    assigneeInitials: "RN",
    actionLabel: "Escalate",
  },
  {
    id: "2",
    severity: "warning",
    tag: "REJECTED \u00d72",
    taskId: "WI-112",
    title: "Laporan Pajak Bulanan",
    description: "Ditolak 2x oleh checker. Membutuhkan revisi segera",
    assignee: "Sari",
    assigneeInitials: "SR",
    actionLabel: "Inspect",
  },
  {
    id: "3",
    severity: "critical",
    tag: "CRITICAL",
    taskId: "WI-098",
    title: "Invoice Matching Q2",
    description: "Vendor ABC belum konfirmasi, deadline besok",
    assignee: "Budi",
    assigneeInitials: "BD",
    actionLabel: "Follow up",
  },
  {
    id: "4",
    severity: "blocked",
    tag: "BLOCKED",
    taskId: "WI-107",
    title: "Approval Budget Marketing",
    description: "Menunggu approval dari Direktur sejak 3 hari lalu",
    assignee: "Andi",
    assigneeInitials: "AD",
    actionLabel: "Escalate",
  },
];

function ExceptionRow({ exception }: { exception: Exception }) {
  const s = tagStyles[exception.severity];
  const TagIcon = s.icon;

  return (
    <div className="flex items-stretch gap-0 group hover:bg-[#f7f9f8] rounded-lg transition-colors">
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
            "inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[7px] font-extrabold uppercase tracking-wider shrink-0",
            s.bg,
            s.text
          )}
        >
          <TagIcon className="w-2.5 h-2.5" />
          {exception.tag}
        </span>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-semibold text-[#1a2421] truncate">
            <span className="text-[#8a9490] font-mono">{exception.taskId}</span>
            {" \u2014 "}
            {exception.title}
          </p>
          <p className="text-[10px] text-[#8a9490] truncate mt-0.5">
            {exception.description}
          </p>
        </div>

        {/* Assignee */}
        <div className="flex items-center gap-1.5 shrink-0">
          <div className="w-5 h-5 rounded-full bg-[#e0e5e2] flex items-center justify-center text-[7px] font-bold text-[#4a5a55]">
            {exception.assigneeInitials}
          </div>
          <span className="text-[10px] text-[#4a5a55] font-medium">
            {exception.assignee}
          </span>
        </div>

        {/* Action */}
        <button className="flex items-center gap-0.5 text-[10px] font-semibold text-[#20865a] hover:text-[#1a6e4a] shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
          {exception.actionLabel}
          <ArrowUpRight className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
}

export function ExceptionCenter() {
  return (
    <div className="bg-white border border-[#dfe4e1] rounded-xl shadow-[0_1px_2px_rgba(24,32,31,.04),0_8px_30px_rgba(24,32,31,.045)]">
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#eef0ee]">
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-[#c94040]" />
          <h3 className="text-sm font-bold text-[#1a2421]">
            Exception Center
          </h3>
          <span className="bg-[#fceded] text-[#c94040] text-[9px] font-bold px-1.5 py-0.5 rounded-full">
            9
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button className="flex items-center gap-1 text-[10px] text-[#8a9490] hover:text-[#1a2421] px-2 py-1 rounded hover:bg-[#f3f5f2]">
            <Search className="w-3 h-3" />
            Filter
          </button>
          <button className="flex items-center gap-1 text-[10px] font-semibold text-[#20865a] hover:text-[#1a6e4a] px-2 py-1 rounded hover:bg-[#e8f6ef]">
            <MessageSquareWarning className="w-3 h-3" />
            Escalate All
          </button>
        </div>
      </div>
      <div className="p-2 space-y-0.5">
        {mockExceptions.map((e) => (
          <ExceptionRow key={e.id} exception={e} />
        ))}
      </div>
    </div>
  );
}
