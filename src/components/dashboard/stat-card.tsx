"use client";

import { type LucideIcon } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

type Variant = "danger" | "warning" | "neutral" | "success";

interface StatCardProps {
  variant: Variant;
  icon: LucideIcon;
  label: string;
  value: string | number;
  description?: string;
  actionText?: string;
  actionHref?: string;
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
  actionHref,
}: StatCardProps) {
  const v = variantStyles[variant];

  return (
    <article className="surface-card rounded-xl p-4 flex items-start gap-3">
      <div
        className={cn(
          "flex items-center justify-center w-10 h-10 rounded-lg shrink-0",
          v.bg
        )}
      >
        <Icon className={cn("w-5 h-5", v.text)} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-muted-foreground">
          {label}
        </p>
        <p className={cn("text-2xl font-bold mt-0.5", v.text)} aria-live="polite">{value}</p>
        {description && (
          <p className="text-sm text-muted-foreground mt-0.5">{description}</p>
        )}
      </div>
      {actionText && actionHref && (
        <Link href={actionHref} className="control-interactive rounded px-1 text-sm font-semibold text-success whitespace-nowrap self-center">
          {actionText} <span aria-hidden="true">→</span>
        </Link>
      )}
    </article>
  );
}
