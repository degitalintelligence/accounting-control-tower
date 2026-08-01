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
    <nav className="flex items-center gap-1 text-[12px] text-[#8b9492]">
      <Link href="/dashboard" className="hover:text-[#18201f] transition-colors">
        Home
      </Link>
      {crumbs.map((crumb) => (
        <span key={crumb.href} className="flex items-center gap-1">
          <ChevronRight className="size-3" />
          {crumb.isLast ? (
            <span className="font-medium text-[#18201f] capitalize">
              {crumb.label}
            </span>
          ) : (
            <Link
              href={crumb.href}
              className="hover:text-[#18201f] transition-colors capitalize"
            >
              {crumb.label}
            </Link>
          )}
        </span>
      ))}
    </nav>
  );
}
