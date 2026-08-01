"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import {
  LayoutDashboard,
  CheckSquare,
  RotateCcw,
  Grid3X3,
  FileText,
  Eye,
  Shield,
  MessageCircle,
  Users,
  Building2,
  Settings,
  ChevronDown,
  LogOut,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/auth-store";
import { logout } from "@/app/actions/auth";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: number;
  badgeVariant?: "default" | "amber";
}

const mainNav: NavItem[] = [
  { label: "Ringkasan", href: "/dashboard", icon: LayoutDashboard },
  { label: "Pekerjaan saya", href: "/work-items", icon: CheckSquare },
  { label: "Pekerjaan rutin", href: "/work-items?type=routine", icon: RotateCcw },
  { label: "Proyek", href: "/projects", icon: Grid3X3 },
  { label: "Laporan", href: "/reports", icon: FileText },
];

const controlNav: NavItem[] = [
  { label: "Antrean review", href: "/work-items?filter=review", icon: Eye },
  { label: "Audit SOP", href: "/templates", icon: Shield },
  { label: "Checklist", href: "/checklists", icon: CheckSquare },
  { label: "Kotak masuk WhatsApp", href: "/wa-inbox", icon: MessageCircle, badgeVariant: "amber" },
];

const manageNav: NavItem[] = [
  { label: "Tim & beban kerja", href: "/settings/workload", icon: Users },
  { label: "Klien", href: "/settings/clients", icon: Building2 },
  { label: "Pengaturan", href: "/settings", icon: Settings },
  { label: "Administrasi", href: "/settings/administration", icon: Shield },
];

interface AppSidebarProps {
  open: boolean;
  onClose: () => void;
}

export function AppSidebar({ open, onClose }: AppSidebarProps) {
  const pathname = usePathname();
  const user = useAuthStore((s) => s.user);

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

        <button type="button" className="control-interactive mb-3.5 flex w-full items-center gap-[9px] rounded-[10px] border border-white/10 bg-white/[.07] p-2.5 text-left hover:bg-white/10 focus-visible:outline-white">
          <span className="flex size-[34px] shrink-0 items-center justify-center rounded-lg bg-[#c98f29] text-[11px] font-bold text-white">
            {orgInitials}
          </span>
          <div className="min-w-0 flex-1">
            <span className="block text-[8px] tracking-[.12em] text-[#9da6a4]">
              RUANG KERJA
            </span>
            {user?.organization_name && <strong className="block truncate text-[11px] font-semibold text-white">{user.organization_name}</strong>}
          </div>
          <ChevronDown className="size-3.5 text-[#9da6a4]" />
        </button>

        {/* Navigation */}
        <nav className="scrollbar-subtle flex flex-1 flex-col gap-0.5 overflow-y-auto">
          {mainNav.map((item) => (
            <NavLink
              key={item.href}
              item={item}
              active={isActive(pathname, item.href)}
              onClick={onClose}
            />
          ))}

          <div className="px-2.5 pb-1.5 pt-[18px] text-[10px] font-bold tracking-[.14em] text-slate-400">
            KONTROL
          </div>
          {controlNav.map((item) => (
            <NavLink
              key={item.href}
              item={item}
              active={isActive(pathname, item.href)}
              onClick={onClose}
            />
          ))}

          <div className="px-2.5 pb-1.5 pt-[18px] text-[10px] font-bold tracking-[.14em] text-slate-400">
            KELOLA
          </div>
          {manageNav.map((item) => (
            <NavLink
              key={item.href}
              item={item}
              active={isActive(pathname, item.href)}
              onClick={onClose}
            />
          ))}
        </nav>

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
                aria-label="Keluar dari akun"
              >
                <LogOut className="size-3.5" />
              </TooltipTrigger>
              <TooltipContent side="right">Keluar dari akun</TooltipContent>
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
  item: NavItem;
  active: boolean;
  onClick: () => void;
}) {
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
      <span className="flex-1">{item.label}</span>
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

function isActive(pathname: string, href: string) {
  const cleanHref = href.split("?")[0];
  return pathname === cleanHref || pathname.startsWith(cleanHref + "/");
}
