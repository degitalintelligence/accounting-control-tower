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
  description?: string;
  href: string;
  icon: NavigationIcon;
  section: "main" | "control" | "manage";
  badge?: number;
  badgeVariant?: "default" | "amber";
}

export const navigationItems: NavigationItem[] = [
  { label: "Ringkasan", description: "Lihat ringkasan operasi", href: "/dashboard", icon: LayoutDashboard, section: "main" },
  { label: "Pekerjaan saya", description: "Kelola work item yang ditugaskan kepada Anda", href: "/work-items?tab=mine", icon: CheckSquare, section: "main" },
  { label: "Pekerjaan rutin", description: "Lihat pekerjaan rutin", href: "/work-items?type=routine", icon: RotateCcw, section: "main" },
  { label: "Proyek", description: "Lihat dan kelola proyek", href: "/projects", icon: Grid3X3, section: "main" },
  { label: "Laporan", description: "Buka laporan operasi", href: "/reports", icon: FileText, section: "main" },
  { label: "Antrean review", description: "Tinjau pekerjaan yang menunggu review", href: "/work-items?filter=review", icon: Eye, section: "control" },
  { label: "Template SOP", description: "Kelola template dan SOP", href: "/templates", icon: Shield, section: "control" },
  { label: "Checklist", description: "Kelola checklist operasional", href: "/checklists", icon: CheckSquare, section: "control" },
  { label: "Kotak masuk WhatsApp", description: "Lihat pesan operasional", href: "/wa-inbox", icon: MessageCircle, section: "control", badgeVariant: "amber" },
  { label: "Inbox AI", description: "Tinjau saran dari AI", href: "/ai-inbox", icon: Bot, section: "control" },
  { label: "Meeting & Notulen", description: "Kelola meeting dan notulen", href: "/meetings", icon: Video, section: "control" },
  { label: "Tim & beban kerja", description: "Pantau kapasitas tim", href: "/settings/workload", icon: Users, section: "manage" },
  { label: "Klien", description: "Kelola client organisasi", href: "/settings/clients", icon: Building2, section: "manage" },
  { label: "Pengaturan", description: "Kelola konfigurasi workspace", href: "/settings", icon: Settings, section: "manage" },
  { label: "Administrasi", description: "Kelola kontrol administrasi", href: "/settings/administration", icon: Shield, section: "manage" },
];

export const quickActions = [
  { label: "Buat work item baru", description: "Buka formulir pekerjaan baru", href: "/work-items?new=1", icon: Plus, shortcut: "N" },
  { label: "Cari work item", description: "Cari berdasarkan judul atau deskripsi", href: "/work-items?focus=search", icon: Search, shortcut: "/" },
];

export const settingsTabs = [
  { label: "Umum", href: "/settings", icon: Settings },
  { label: "Anggota", href: "/settings/members", icon: Users },
  { label: "Peran & Permission", href: "/settings/roles", icon: Shield },
  { label: "Klien", href: "/settings/clients", icon: Building2 },
  { label: "Notifikasi", href: "/settings/notifications", icon: Bell },
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
