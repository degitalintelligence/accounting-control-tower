"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { settingsTabs, canAccess } from "@/lib/navigation";
import { useI18n } from "@/components/i18n-provider";
import { usePermissions } from "@/hooks/use-permissions";

/**
 * Navigasi tab settings yang memfilter tab berdasarkan permission user.
 * Tab tanpa akses (mis. Peran & Permission untuk staff) disembunyikan.
 */
export function SettingsTabs() {
  const pathname = usePathname();
  const { t } = useI18n();
  const { has } = usePermissions();
  const visibleTabs = settingsTabs.filter((tab) => canAccess(tab.href, has));

  if (visibleTabs.length === 0) return null;

  return (
    <nav aria-label={t("settings.navigation")} className="flex max-w-full gap-2 overflow-x-auto border-b border-slate-200 pb-2">
      {visibleTabs.map((tab) => {
        const isActive = tab.href === "/settings" ? pathname === "/settings" : pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              "flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition-colors",
              isActive ? "bg-blue-600 text-white shadow-sm" : "text-slate-600 hover:bg-slate-100 hover:text-slate-950"
            )}
          >
            <tab.icon aria-hidden="true" className="size-3.5" />
            {t(tab.labelKey as never)}
          </Link>
        );
      })}
    </nav>
  );
}

/** Panel lembut yang tampil saat user membuka URL halaman tanpa permission yang diperlukan. */
export function AccessDenied({ title, description }: { title?: string; description?: string }) {
  const { t } = useI18n();
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-slate-200 bg-white px-6 py-14 text-center shadow-sm">
      <span className="grid size-12 place-items-center rounded-xl bg-slate-100 text-slate-500">
        <svg viewBox="0 0 24 24" fill="none" className="size-6" aria-hidden="true">
          <path d="M12 17h.01M12 11V6m8 6a8 8 0 11-16 0 8 8 0 0116 0z" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      </span>
      <h2 className="mt-4 text-lg font-bold text-slate-950">{title ?? t("settings.accessDeniedTitle")}</h2>
      <p className="mt-1 max-w-md text-sm leading-6 text-slate-500">{description ?? t("settings.accessDeniedDesc")}</p>
    </div>
  );
}
