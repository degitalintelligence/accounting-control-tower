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
  Settings,
  ChevronDown,
  LogOut,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/auth-store";
import { logout } from "@/app/actions/auth";

interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: number;
  badgeVariant?: "default" | "amber";
}

const mainNav: NavItem[] = [
  { label: "Overview", href: "/dashboard", icon: LayoutDashboard },
  { label: "My Work", href: "/work-items", icon: CheckSquare, badge: 7 },
  { label: "Routine Tasks", href: "/work-items?type=routine", icon: RotateCcw },
  { label: "Projects", href: "/projects", icon: Grid3X3 },
  { label: "Reports", href: "/reports", icon: FileText },
];

const controlNav: NavItem[] = [
  { label: "Review Queue", href: "/work-items?filter=review", icon: Eye, badge: 4 },
  { label: "SOP Audit", href: "/templates", icon: Shield },
  { label: "WhatsApp Inbox", href: "/wa-inbox", icon: MessageCircle, badge: 3, badgeVariant: "amber" },
];

const manageNav: NavItem[] = [
  { label: "Team & Workload", href: "/settings?tab=team", icon: Users },
  { label: "Settings", href: "/settings", icon: Settings },
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
      {/* Mobile overlay */}
      {open && (
        <div
          className="fixed inset-0 z-30 bg-black/40 lg:hidden"
          onClick={onClose}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-[244px] flex-col bg-[#18201f] px-3.5 py-5 text-white transition-transform duration-200 lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {/* Brand */}
        <div className="flex items-center gap-2.5 px-2 pb-[18px]">
          <span className="grid size-[31px] place-items-center rounded-lg bg-[#f4b63e] text-[17px] font-extrabold text-[#18201f]">
            O
          </span>
          <span className="text-[19px] font-extrabold">OpsControl</span>
        </div>

        {/* Workspace Switcher */}
        <button className="mb-3.5 flex items-center gap-[9px] rounded-[10px] border border-white/[.09] bg-white/[.07] p-2.5 text-left">
          <span className="flex size-[34px] shrink-0 items-center justify-center rounded-lg bg-[#c98f29] text-[11px] font-bold text-white">
            {orgInitials}
          </span>
          <div className="min-w-0 flex-1">
            <span className="block text-[8px] tracking-[.12em] text-[#9da6a4]">
              WORKSPACE
            </span>
            <strong className="block truncate text-[11px] font-semibold text-white">
              {user?.organization_name || "Workspace"}
            </strong>
          </div>
          <ChevronDown className="size-3.5 text-[#9da6a4]" />
        </button>

        {/* Navigation */}
        <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto">
          {/* Main section */}
          {mainNav.map((item) => (
            <NavLink
              key={item.href}
              item={item}
              active={isActive(pathname, item.href)}
              onClick={onClose}
            />
          ))}

          {/* Control section */}
          <div className="px-2.5 pt-[18px] pb-1.5 text-[9px] font-bold tracking-[.14em] text-[#707a78]">
            CONTROL
          </div>
          {controlNav.map((item) => (
            <NavLink
              key={item.href}
              item={item}
              active={isActive(pathname, item.href)}
              onClick={onClose}
            />
          ))}

          {/* Manage section */}
          <div className="px-2.5 pt-[18px] pb-1.5 text-[9px] font-bold tracking-[.14em] text-[#707a78]">
            MANAGE
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

        {/* Health Indicator */}
        <div className="mt-auto rounded-lg bg-white/[.055] p-[11px]">
          <div className="flex items-center gap-[7px]">
            <span className="size-[7px] rounded-full bg-[#4ec88d] shadow-[0_0_0_3px_rgba(78,200,141,.14)]" />
            <strong className="text-[11px] font-medium">WhatsApp connected</strong>
          </div>
          <small className="ml-[14px] text-[10px] text-[#85908d]">
            Last sync 2 minutes ago
          </small>
        </div>

        {/* User Card */}
        <div className="mt-3.5 flex items-center gap-[9px] border-t border-white/[.08] pt-3.5">
          <span className="flex size-[34px] shrink-0 items-center justify-center rounded-full bg-[#324542] text-[11px] font-bold text-white">
            {initials}
          </span>
          <div className="min-w-0 flex-1">
            <strong className="block truncate text-[11px] font-medium text-white">
              {user?.name || "User"}
            </strong>
            <small className="block text-[9px] text-[#85908d]">
              {user?.role || "Member"}
            </small>
          </div>
          <form action={logout}>
            <button
              type="submit"
              className="grid size-7 place-items-center rounded-md text-[#85908d] hover:bg-white/[.08] hover:text-white transition-colors"
              aria-label="Keluar"
              title="Keluar"
            >
              <LogOut className="size-3.5" />
            </button>
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
        "relative flex items-center gap-[11px] rounded-lg px-2.5 py-[9px] text-[13px] font-medium text-[#b6bfbd] transition-colors hover:bg-[#2d3836] hover:text-white",
        active && "bg-[#2d3836] text-white before:absolute before:left-0 before:top-1/2 before:h-[25px] before:w-[3px] before:-translate-y-1/2 before:rounded-r-[3px] before:bg-[#f4b63e]"
      )}
    >
      <item.icon className="size-[18px] shrink-0" />
      <span className="flex-1">{item.label}</span>
      {item.badge !== undefined && (
        <span
          className={cn(
            "min-w-[20px] rounded-[9px] px-1.5 py-0.5 text-center text-[10px] font-semibold",
            item.badgeVariant === "amber"
              ? "bg-[#6c5429] text-[#ffca63]"
              : "bg-[#38423f] text-[#dce2e0]"
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
