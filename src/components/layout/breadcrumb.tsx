"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { getNavigationItem } from "@/lib/navigation";
import { useI18n } from "@/components/i18n-provider";

export function Breadcrumb() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { t } = useI18n();
  const segments = pathname.split("/").filter(Boolean);

  if (segments.length === 0) return null;

  const activeItem = getNavigationItem(pathname, searchParams.toString());
  const resourceLabels: Record<string, string> = {
    projects: "projects.title",
    "work-items": "work.title",
    templates: "templates.title",
  };
  const labels = segments.map((seg, i) => ({
    label:
      i === segments.length - 1 && i > 0 && resourceLabels[segments[i - 1]]
        ? t(resourceLabels[segments[i - 1]] as never)
        : i === segments.length - 1 && activeItem
          ? activeItem.labelKey
            ? t(activeItem.labelKey as never)
            : activeItem.label
          : resourceLabels[seg]
            ? t(resourceLabels[seg] as never)
            : decodeURIComponent(seg).replace(/-/g, " "),
    href: "/" + segments.slice(0, i + 1).join("/"),
    isLast: i === segments.length - 1,
  }));

  return (
    <nav aria-label={t("common.breadcrumb")} className="overflow-x-auto text-sm text-muted-foreground">
      <ol className="flex min-w-max items-center gap-1">
      <li>
      <Link href="/dashboard" className="transition-colors hover:text-ink">
        {t("common.home")}
      </Link>
      </li>
      {labels.map((crumb) => (
        <li key={crumb.href} className="flex items-center gap-1">
          <ChevronRight aria-hidden="true" className="size-3" />
          {crumb.isLast ? (
            <span aria-current="page" className="font-medium capitalize text-ink">
              {crumb.label}
            </span>
          ) : (
            <Link
              href={crumb.href}
              className="capitalize transition-colors hover:text-ink"
            >
              {crumb.label}
            </Link>
          )}
        </li>
      ))}
      </ol>
    </nav>
  );
}
