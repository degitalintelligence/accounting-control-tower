"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useState } from "react";
import Link from "next/link";
import { ChevronDown, Loader2,
  LogOut, Building2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/auth-store";
import { logout } from "@/app/actions/auth";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { isNavigationItemActive, navigationItems } from "@/lib/navigation";
import { useI18n } from "@/components/i18n-provider";

interface AppSidebarProps {
  open: boolean;
  onClose: () => void;
}

export function AppSidebar({ open, onClose }: AppSidebarProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const [switching, setSwitching] = useState(false);
  const [workspaceOpen, setWorkspaceOpen] = useState(false);
  const { t } = useI18n();

  const initials = user?.name
    ? user.name
        .split(" ")
        .map((w) => w[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : "U";

  const orgInitials = user?.organization_name
    ? user.organization_name
        .split(" ")
        .map((w) => w[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : "WS";

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-30 bg-slate-950/45 lg:hidden"
          onClick={onClose}
          aria-label="Tutup menu"
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-[min(86vw,280px)] flex-col bg-slate-900 px-4 py-5 text-white shadow-xl transition-transform duration-200 lg:w-64 lg:translate-x-0 lg:shadow-none",
          open ? "translate-x-0" : "-translate-x-full"
        )}
        aria-label="Navigasi utama"
      >
        <div className="flex items-center gap-2.5 px-2 pb-[18px]">
          <span className="grid size-9 place-items-center rounded-lg bg-cta text-lg font-extrabold text-white">
            O
          </span>
          <span className="font-heading text-xl font-extrabold">OpsControl</span>
        </div>

        <button type="button" onClick={() => setWorkspaceOpen((open) => !open)} aria-expanded={workspaceOpen} className="control-interactive mb-1 flex w-full items-center gap-[9px] rounded-[10px] border border-white/10 bg-white/[.07] p-2.5 text-left hover:bg-white/10 focus-visible:outline-white">
          <span className="flex size-[34px] shrink-0 items-center justify-center rounded-lg bg-[#c98f29] text-[11px] font-bold text-white">
            {orgInitials}
          </span>
          <div className="min-w-0 flex-1">
            <span className="block text-[8px] tracking-[.12em] text-[#9da6a4]">
              {t("nav.manage")}
            </span>
            {user?.organization_name && <strong className="block truncate text-[11px] font-semibold text-white">{user.organization_name}</strong>}
          </div>
          {switching ? <Loader2 className="size-3.5 animate-spin text-[#9da6a4]" /> : <ChevronDown className="size-3.5 text-[#9da6a4]" />}
        </button>
        {workspaceOpen && <div className="mb-3 rounded-lg border border-white/10 bg-slate-800 p-1.5">{user?.organizations?.map((organization) => <button key={organization.id} type="button" disabled={switching || organization.is_active} onClick={async () => { setSwitching(true); const organizationId = String(organization.id).trim(); const response = await fetch("/api/auth/organization", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ organization_id: organizationId }) }); if (response.ok) { const profile = await fetch("/api/auth/me", { cache: "no-store" }); if (profile.ok) setUser(await profile.json()); window.dispatchEvent(new Event("workspace-changed")); setWorkspaceOpen(false); window.location.reload(); } setSwitching(false); }} className="flex w-full items-center justify-between rounded-md px-2.5 py-2 text-left text-xs text-slate-200 hover:bg-white/10 disabled:cursor-default disabled:opacity-60"><span className="truncate">{organization.name}</span>{organization.is_active && <span className="ml-2 text-[10px] text-emerald-300">{t("common.active")}</span>}</button>)}</div>}

        {/* Navigation */}
        {user?.organization_id ? (
          <nav className="scrollbar-subtle flex flex-1 flex-col gap-0.5 overflow-y-auto">
            {navigationItems.filter((item) => item.section === "main").map((item) => <NavLink key={item.href} item={item} active={isNavigationItemActive(pathname, searchParams.toString(), item.href)} onClick={onClose} />)}

            <div className="px-2.5 pb-1.5 pt-[18px] text-[10px] font-bold tracking-[.14em] text-slate-400">
              {t("nav.control")}
            </div>
            {navigationItems.filter((item) => item.section === "control").map((item) => <NavLink key={item.href} item={item} active={isNavigationItemActive(pathname, searchParams.toString(), item.href)} onClick={onClose} />)}

            <div className="px-2.5 pb-1.5 pt-[18px] text-[10px] font-bold tracking-[.14em] text-slate-400">
              {t("nav.manage")}
            </div>
            {navigationItems.filter((item) => item.section === "manage").map((item) => <NavLink key={item.href} item={item} active={isNavigationItemActive(pathname, searchParams.toString(), item.href)} onClick={onClose} />)}
          </nav>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 px-4 text-center">
            <div className="grid size-12 place-items-center rounded-xl bg-white/[.08]">
              <Building2 className="size-6 text-slate-400" />
            </div>
            <p className="text-[13px] font-medium leading-relaxed text-slate-300">
              {t("nav.noOrganization")}
            </p>
            <Link
              href="/onboarding/organization"
              onClick={onClose}
              className="mt-1 rounded-lg bg-cta px-4 py-2 text-xs font-bold text-white hover:bg-orange-600"
            >
              {t("nav.createOrganization")}
            </Link>
          </div>
        )}

        <div className="mt-3.5 flex items-center gap-[9px] border-t border-white/[.08] pt-3.5">
          <span className="flex size-[34px] shrink-0 items-center justify-center rounded-full bg-[#324542] text-[11px] font-bold text-white">
            {initials}
          </span>
          <div className="min-w-0 flex-1">
            {user?.name && <strong className="block truncate text-[11px] font-medium text-white">{user.name}</strong>}
            {user?.role && <small className="block text-[9px] text-[#85908d]">{user.role}</small>}
          </div>
          <form action={logout}>
            <Tooltip>
              <TooltipTrigger
                type="submit"
                className="control-interactive grid size-9 place-items-center rounded-md text-slate-400 hover:bg-white/[.08] hover:text-white focus-visible:outline-white"
                aria-label={t("common.logout")}
              >
                <LogOut className="size-3.5" />
              </TooltipTrigger>
              <TooltipContent side="right">{t("common.logout")}</TooltipContent>
            </Tooltip>
          </form>
        </div>
      </aside>
    </>
  );
}

/* ---------- Helpers ---------- */

function NavLink({
  item,
  active,
  onClick,
}: {
  item: (typeof navigationItems)[number];
  active: boolean;
  onClick: () => void;
}) {
  const { t } = useI18n();

  return (
    <Link
      href={item.href}
      onClick={onClick}
      className={cn(
        "control-interactive relative flex items-center gap-[11px] rounded-lg px-2.5 py-2.5 text-sm font-medium text-slate-300 hover:bg-white/10 hover:text-white focus-visible:outline-white",
        active && "bg-white/10 text-white before:absolute before:left-0 before:top-1/2 before:h-7 before:w-1 before:-translate-y-1/2 before:rounded-r before:bg-cta"
      )}
    >
      <item.icon className="size-[18px] shrink-0" />
      <span className="flex-1">{item.labelKey ? t(item.labelKey as never) : item.label}</span>
      {item.badge !== undefined && (
        <span
          className={cn(
            "min-w-[20px] rounded-[9px] px-1.5 py-0.5 text-center text-[10px] font-semibold",
            item.badgeVariant === "amber"
              ? "bg-warning/20 text-warning"
              : "bg-white/10 text-slate-200"
          )}
        >
          {item.badge}
        </span>
      )}
    </Link>
  );
}

