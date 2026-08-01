"use client";

import { type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type Variant = "danger" | "warning" | "neutral" | "success";

interface StatCardProps {
  variant: Variant;
  icon: LucideIcon;
  label: string;
  value: string | number;
  description?: string;
  actionText?: string;
}

const variantStyles: Record<Variant, { bg: string; text: string }> = {
  danger: { bg: "bg-[#fceded]", text: "text-[#c94040]" },
  warning: { bg: "bg-[#fff4d8]", text: "text-[#9a6810]" },
  neutral: { bg: "bg-[#eef1ee]", text: "text-[#4a5a55]" },
  success: { bg: "bg-[#e8f6ef]", text: "text-[#20865a]" },
};

export function StatCard({
  variant,
  icon: Icon,
  label,
  value,
  description,
  actionText,
}: StatCardProps) {
  const v = variantStyles[variant];

  return (
    <div className="bg-white border border-[#dfe4e1] rounded-xl shadow-[0_1px_2px_rgba(24,32,31,.04),0_8px_30px_rgba(24,32,31,.045)] p-4 flex items-start gap-3">
      <div
        className={cn(
          "flex items-center justify-center w-10 h-10 rounded-lg shrink-0",
          v.bg
        )}
      >
        <Icon className={cn("w-5 h-5", v.text)} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[11px] font-medium text-[#8a9490] uppercase tracking-wide">
          {label}
        </p>
        <p className={cn("text-2xl font-bold mt-0.5", v.text)}>{value}</p>
        {description && (
          <p className="text-xs text-[#8a9490] mt-0.5">{description}</p>
        )}
      </div>
      {actionText && (
        <button className="text-[11px] font-semibold text-[#20865a] hover:text-[#1a6e4a] whitespace-nowrap self-center">
          {actionText} &rarr;
        </button>
      )}
    </div>
  );
}
