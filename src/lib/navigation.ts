import type { ComponentType } from "react";
import {
  Bell,
  Bot,
  Building2,
  CheckSquare,
  Eye,
  FileText,
  Grid3X3,
  LayoutDashboard,
  MessageCircle,
  Plus,
  RotateCcw,
  Search,
  Settings,
  Shield,
  Users,
  Video,
} from "lucide-react";

export type NavigationIcon = ComponentType<{ className?: string }>;

export interface NavigationItem {
  label: string;
  labelKey?: string;
  description?: string;
  href: string;
  icon: NavigationIcon;
  section: "main" | "control" | "manage";
  badge?: number;
  badgeVariant?: "default" | "amber";
}

export const navigationItems: NavigationItem[] = [
  { label: "Ringkasan", labelKey: "nav.summary", href: "/dashboard", icon: LayoutDashboard, section: "main" },
  { label: "Pekerjaan saya", labelKey: "nav.myWork", href: "/work-items?tab=mine", icon: CheckSquare, section: "main" },
  { label: "Pekerjaan rutin", labelKey: "nav.routine", href: "/work-items?type=routine", icon: RotateCcw, section: "main" },
  { label: "Proyek", labelKey: "nav.projects", href: "/projects", icon: Grid3X3, section: "main" },
  { label: "Laporan", labelKey: "nav.reports", href: "/reports", icon: FileText, section: "main" },
  { label: "Antrean review", labelKey: "nav.reviewQueue", href: "/work-items?filter=review", icon: Eye, section: "control" },
  { label: "Template SOP", labelKey: "nav.sop", href: "/templates", icon: Shield, section: "control" },
  { label: "Checklist", labelKey: "nav.checklists", href: "/checklists", icon: CheckSquare, section: "control" },
  { label: "Kotak masuk WhatsApp", labelKey: "nav.whatsapp", href: "/wa-inbox", icon: MessageCircle, section: "control", badgeVariant: "amber" },
  { label: "Inbox AI", labelKey: "nav.aiInbox", href: "/ai-inbox", icon: Bot, section: "control" },
  { label: "Meeting & Notulen", labelKey: "nav.meetings", href: "/meetings", icon: Video, section: "control" },
  { label: "Tim & beban kerja", labelKey: "nav.workload", href: "/settings/workload", icon: Users, section: "manage" },
  { label: "Klien", labelKey: "nav.clients", href: "/settings/clients", icon: Building2, section: "manage" },
  { label: "Pengaturan", labelKey: "nav.settings", href: "/settings", icon: Settings, section: "manage" },
  { label: "Administrasi", labelKey: "nav.administration", href: "/settings/administration", icon: Shield, section: "manage" },
];

export const quickActions = [
  { label: "Buat work item baru", description: "Buka formulir pekerjaan baru", href: "/work-items?new=1", icon: Plus, shortcut: "N" },
  { label: "Cari work item", description: "Cari berdasarkan judul atau deskripsi", href: "/work-items?focus=search", icon: Search, shortcut: "/" },
];

export const settingsTabs = [
  { label: "Umum", labelKey: "settings.general", href: "/settings", icon: Settings },
  { label: "Anggota", labelKey: "settings.members", href: "/settings/members", icon: Users },
  { label: "Peran & Permission", labelKey: "settings.roles", href: "/settings/roles", icon: Shield },
  { label: "Klien", labelKey: "settings.clients", href: "/settings/clients", icon: Building2 },
  { label: "Notifikasi", labelKey: "settings.notifications", href: "/settings/notifications", icon: Bell },
];

export function isNavigationItemActive(pathname: string, search: string, href: string) {
  const target = new URL(href, "http://localhost");
  const pathMatches = pathname === target.pathname || pathname.startsWith(`${target.pathname}/`);
  if (!pathMatches) return false;

  const currentQuery = new URLSearchParams(search);
  const targetQuery = target.searchParams;
  for (const [key, value] of targetQuery) {
    if (currentQuery.get(key) !== value) return false;
  }
  return targetQuery.size > 0 || currentQuery.size === 0;
}

export function getNavigationItem(pathname: string, search: string) {
  return navigationItems
    .filter((item) => isNavigationItemActive(pathname, search, item.href))
    .sort((a, b) => b.href.length - a.href.length)[0];
}
