"use client";

import { FileText, FileSpreadsheet, FileBarChart, Eye } from "lucide-react";
import { cn } from "@/lib/utils";
import Link from "next/link";
import type { ReviewItem as DashboardReviewItem } from "@/hooks/use-dashboard";

type FileIconType = "X" | "S" | "P";
type RiskLevel = "high" | "medium" | "low";

interface ReviewItem extends DashboardReviewItem {
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

function ReviewRow({ item }: { item: ReviewItem }) {
  const fc = fileIconConfig[item.fileIcon];
  const rc = riskConfig[item.risk];
  const FileIconComp = fc.icon;

  return (
    <Link href={`/work-items/${item.id}`} className="flex items-center gap-3 px-3 py-2.5 group hover:bg-muted rounded-lg transition-colors">
      {/* File icon */}
      <div
        className={cn(
          "w-9 h-9 rounded-lg flex items-center justify-center shrink-0",
          fc.bg
        )}
      >
        <FileIconComp className={cn("w-4 h-4", fc.text)} />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-ink truncate">
          {item.title}
        </p>
        <p className="text-sm text-muted-foreground mt-0.5">
          {item.submitter} \u00b7 {item.time}
        </p>
      </div>

      {/* Risk tag */}
      <span
        className={cn(
          "px-1.5 py-0.5 rounded text-sm font-extrabold shrink-0",
          rc.bg,
          rc.text
        )}
      >
        {item.riskLabel}
      </span>

      {/* Review button */}
      <span aria-label={`Tinjau ${item.title}`} className="control-interactive flex items-center gap-1 rounded px-1 text-sm font-semibold text-success shrink-0 sm:opacity-0 sm:group-hover:opacity-100">
        <Eye className="w-3 h-3" />
          Tinjau
      </span>
    </Link>
  );
}

export function ReviewQueue({ data = [], count = 0 }: { data?: ReviewItem[]; count?: number }) {
  return (
    <div className="bg-white border border-[#dfe4e1] rounded-xl shadow-[0_1px_2px_rgba(24,32,31,.04),0_8px_30px_rgba(24,32,31,.045)]">
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#eef0ee]">
        <div className="flex items-center gap-2">
          <Eye className="w-4 h-4 text-[#9a6810]" />
          <h3 className="text-base font-bold text-ink">
            Antrean Review Anda
          </h3>
          <span className="bg-[#fff4d8] text-[#9a6810] text-[9px] font-bold px-1.5 py-0.5 rounded-full">
            {count}
          </span>
        </div>
        <Link href="/work-items?filter=review" className="control-interactive rounded px-1 text-sm font-semibold text-success">
          Lihat semua <span aria-hidden="true">→</span>
        </Link>
      </div>
      <div className="p-1.5 space-y-0.5">
        {data.map((r) => (
          <ReviewRow key={r.id} item={r} />
        ))}
      </div>
    </div>
  );
}
