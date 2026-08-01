"use client";

import { MessageCircle, X, Pencil, Check, Users, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

interface WaAction {
  id: string;
  group: string;
  time: string;
  message: string;
  sender: string;
  taskTitle: string;
  maker: string;
  checker: string;
  due: string;
  confidence: number;
}

const mockActions: WaAction[] = [
  {
    id: "1",
    group: "Tim Accounting",
    time: "09:15",
    message:
      "Tolong buatkan laporan rekons bank mandiri bulan juli, deadline jumat ya",
    sender: "Rina",
    taskTitle: "Laporan Rekons Bank Mandiri \u2014 Juli",
    maker: "Rina",
    checker: "Sari",
    due: "Jumat, 8 Agt",
    confidence: 92,
  },
  {
    id: "2",
    group: "Tim Pajak",
    time: "10:32",
    message:
      "Invoice vendor ABC sudah masuk, bisa di-match sama PO yang kemarin?",
    sender: "Budi",
    taskTitle: "Invoice Matching Vendor ABC",
    maker: "Budi",
    checker: "Andi",
    due: "Kamis, 7 Agt",
    confidence: 78,
  },
];

function ConfidenceBar({ value }: { value: number }) {
  const color =
    value >= 85 ? "bg-[#20865a]" : value >= 60 ? "bg-[#9a6810]" : "bg-[#c94040]";

  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-[#eef0ee] rounded-full overflow-hidden">
        <div
          className={cn("h-full rounded-full", color)}
          style={{ width: `${value}%` }}
        />
      </div>
      <span className="text-[10px] font-bold text-[#4a5a55] w-8 text-right">
        {value}%
      </span>
    </div>
  );
}

function WaActionCard({ action }: { action: WaAction }) {
  return (
    <div className="border border-[#eef0ee] rounded-lg p-3 space-y-2.5">
      {/* WhatsApp header */}
      <div className="flex items-center gap-2">
        <div className="w-5 h-5 rounded bg-[#e8f6ef] flex items-center justify-center">
          <MessageCircle className="w-3 h-3 text-[#20865a]" />
        </div>
        <div className="flex items-center gap-1.5 flex-1 min-w-0">
          <Users className="w-3 h-3 text-[#8a9490]" />
          <span className="text-[10px] font-semibold text-[#4a5a55] truncate">
            {action.group}
          </span>
          <span className="text-[9px] text-[#8a9490]">\u00b7</span>
          <span className="text-[9px] text-[#8a9490]">{action.sender}</span>
        </div>
        <div className="flex items-center gap-0.5 text-[9px] text-[#8a9490]">
          <Clock className="w-2.5 h-2.5" />
          {action.time}
        </div>
      </div>

      {/* Message content */}
      <blockquote className="text-[10px] text-[#4a5a55] italic border-l-2 border-[#dfe4e1] pl-2">
        &ldquo;{action.message}&rdquo;
      </blockquote>

      {/* Extracted task grid */}
      <div className="bg-[#f7f9f8] rounded-lg p-2.5 space-y-1.5">
        <p className="text-[10px] font-bold text-[#1a2421]">
          {action.taskTitle}
        </p>
        <div className="grid grid-cols-4 gap-2 text-[9px]">
          <div>
            <span className="text-[#8a9490] block">Task</span>
            <span className="text-[#1a2421] font-medium">
              {action.taskTitle.split(" ").slice(0, 3).join(" ")}
            </span>
          </div>
          <div>
            <span className="text-[#8a9490] block">Maker</span>
            <span className="text-[#1a2421] font-medium">{action.maker}</span>
          </div>
          <div>
            <span className="text-[#8a9490] block">Checker</span>
            <span className="text-[#1a2421] font-medium">{action.checker}</span>
          </div>
          <div>
            <span className="text-[#8a9490] block">Due</span>
            <span className="text-[#1a2421] font-medium">{action.due}</span>
          </div>
        </div>
      </div>

      {/* Confidence */}
      <div>
        <p className="text-[9px] text-[#8a9490] mb-1">
          AI Confidence
        </p>
        <ConfidenceBar value={action.confidence} />
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-1.5 pt-0.5">
        <button className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-[#dfe4e1] text-[10px] font-medium text-[#8a9490] hover:bg-[#f3f5f2] transition-colors">
          <X className="w-3 h-3" />
          Dismiss
        </button>
        <button className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-[#dfe4e1] text-[10px] font-medium text-[#9a6810] hover:bg-[#fff4d8] transition-colors">
          <Pencil className="w-3 h-3" />
          Edit
        </button>
        <button className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#20865a] text-[10px] font-bold text-white hover:bg-[#1a6e4a] transition-colors ml-auto">
          <Check className="w-3 h-3" />
          Confirm task
        </button>
      </div>
    </div>
  );
}

export function WhatsappInbox() {
  return (
    <div className="bg-white border border-[#dfe4e1] rounded-xl shadow-[0_1px_2px_rgba(24,32,31,.04),0_8px_30px_rgba(24,32,31,.045)]">
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#eef0ee]">
        <div className="flex items-center gap-2">
          <MessageCircle className="w-4 h-4 text-[#20865a]" />
          <h3 className="text-sm font-bold text-[#1a2421]">
            WhatsApp Action Inbox
          </h3>
          <span className="bg-[#e8f6ef] text-[#20865a] text-[9px] font-bold px-1.5 py-0.5 rounded-full">
            2
          </span>
        </div>
        <button className="text-[10px] font-semibold text-[#20865a] hover:text-[#1a6e4a]">
          View All &rarr;
        </button>
      </div>
      <div className="p-3 space-y-3">
        {mockActions.map((a) => (
          <WaActionCard key={a.id} action={a} />
        ))}
      </div>
    </div>
  );
}
