"use client";

import { FileText, FileSpreadsheet, FileBarChart, Eye } from "lucide-react";
import { cn } from "@/lib/utils";

type FileIconType = "X" | "S" | "P";
type RiskLevel = "high" | "medium" | "low";

interface ReviewItem {
  id: string;
  fileIcon: FileIconType;
  title: string;
  submitter: string;
  submitterInitials: string;
  time: string;
  risk: RiskLevel;
  riskLabel: string;
}

const fileIconConfig: Record<
  FileIconType,
  { bg: string; text: string; icon: typeof FileText; label: string }
> = {
  X: { bg: "bg-[#f0ecff]", text: "text-[#7c4dff]", icon: FileSpreadsheet, label: "XLS" },
  S: { bg: "bg-[#e8f6ef]", text: "text-[#20865a]", icon: FileBarChart, label: "PDF" },
  P: { bg: "bg-[#fff4d8]", text: "text-[#9a6810]", icon: FileText, label: "DOC" },
};

const riskConfig: Record<RiskLevel, { bg: string; text: string }> = {
  high: { bg: "bg-[#fceded]", text: "text-[#c94040]" },
  medium: { bg: "bg-[#fff4d8]", text: "text-[#9a6810]" },
  low: { bg: "bg-[#e8f6ef]", text: "text-[#20865a]" },
};

const mockReviews: ReviewItem[] = [
  {
    id: "1",
    fileIcon: "X",
    title: "Rekons Bank Mandiri \u2014 Juli",
    submitter: "Rina",
    submitterInitials: "RN",
    time: "2 jam lalu",
    risk: "high",
    riskLabel: "High Risk",
  },
  {
    id: "2",
    fileIcon: "S",
    title: "Laporan Pajak Bulanan",
    submitter: "Sari",
    submitterInitials: "SR",
    time: "4 jam lalu",
    risk: "medium",
    riskLabel: "Needs Review",
  },
  {
    id: "3",
    fileIcon: "P",
    title: "Invoice Vendor ABC \u2014 Q2",
    submitter: "Budi",
    submitterInitials: "BD",
    time: "Kemarin",
    risk: "high",
    riskLabel: "High Risk",
  },
  {
    id: "4",
    fileIcon: "X",
    title: "Budget Marketing Agustus",
    submitter: "Andi",
    submitterInitials: "AD",
    time: "Kemarin",
    risk: "low",
    riskLabel: "Low Risk",
  },
];

function ReviewRow({ item }: { item: ReviewItem }) {
  const fc = fileIconConfig[item.fileIcon];
  const rc = riskConfig[item.risk];
  const FileIconComp = fc.icon;

  return (
    <div className="flex items-center gap-3 px-3 py-2.5 group hover:bg-[#f7f9f8] rounded-lg transition-colors">
      {/* File icon */}
      <div
        className={cn(
          "w-8 h-8 rounded-lg flex items-center justify-center shrink-0",
          fc.bg
        )}
      >
        <FileIconComp className={cn("w-4 h-4", fc.text)} />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p className="text-[11px] font-semibold text-[#1a2421] truncate">
          {item.title}
        </p>
        <p className="text-[10px] text-[#8a9490] mt-0.5">
          {item.submitter} \u00b7 {item.time}
        </p>
      </div>

      {/* Risk tag */}
      <span
        className={cn(
          "px-1.5 py-0.5 rounded text-[7px] font-extrabold uppercase tracking-wider shrink-0",
          rc.bg,
          rc.text
        )}
      >
        {item.riskLabel}
      </span>

      {/* Review button */}
      <button className="flex items-center gap-1 text-[10px] font-semibold text-[#20865a] hover:text-[#1a6e4a] shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
        <Eye className="w-3 h-3" />
        Review
      </button>
    </div>
  );
}

export function ReviewQueue() {
  return (
    <div className="bg-white border border-[#dfe4e1] rounded-xl shadow-[0_1px_2px_rgba(24,32,31,.04),0_8px_30px_rgba(24,32,31,.045)]">
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#eef0ee]">
        <div className="flex items-center gap-2">
          <Eye className="w-4 h-4 text-[#9a6810]" />
          <h3 className="text-sm font-bold text-[#1a2421]">
            Your Review Queue
          </h3>
          <span className="bg-[#fff4d8] text-[#9a6810] text-[9px] font-bold px-1.5 py-0.5 rounded-full">
            4
          </span>
        </div>
        <button className="text-[10px] font-semibold text-[#20865a] hover:text-[#1a6e4a]">
          View All &rarr;
        </button>
      </div>
      <div className="p-1.5 space-y-0.5">
        {mockReviews.map((r) => (
          <ReviewRow key={r.id} item={r} />
        ))}
      </div>
    </div>
  );
}
