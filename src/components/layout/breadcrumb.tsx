"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight } from "lucide-react";

const labelMap: Record<string, string> = {
  dashboard: "Overview",
  "work-items": "Work Items",
  projects: "Projects",
  reports: "Reports",
  templates: "Templates",
  settings: "Settings",
  "wa-inbox": "WhatsApp Inbox",
};

export function Breadcrumb() {
  const pathname = usePathname();
  const segments = pathname.split("/").filter(Boolean);

  if (segments.length === 0) return null;

  const crumbs = segments.map((seg, i) => ({
    label: labelMap[seg] ?? decodeURIComponent(seg).replace(/-/g, " "),
    href: "/" + segments.slice(0, i + 1).join("/"),
    isLast: i === segments.length - 1,
  }));

  return (
    <nav aria-label="Breadcrumb" className="overflow-x-auto text-sm text-muted-foreground">
      <ol className="flex min-w-max items-center gap-1">
      <li>
      <Link href="/dashboard" className="transition-colors hover:text-ink">
        Home
      </Link>
      </li>
      {crumbs.map((crumb) => (
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
