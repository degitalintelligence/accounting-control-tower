"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { UserPlus, Loader2, Power, Pencil, RefreshCw, Settings2, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { settingsTabs } from "@/lib/navigation";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useI18n } from "@/components/i18n-provider";

interface Member {
  id: string;
  profile_id: string;
  name: string;
  email: string | null;
  avatar_url: string | null;
  role: string;
  initials: string;
  joined_at: string;
  is_active: boolean;
  client_id?: string | null;
}

const roleLabels: Record<string, string> = {
  admin: "settings.admin",
  finance_manager: "settings.financeManager",
  finance_staff: "settings.financeStaff",
};

const roleColors: Record<string, string> = {
  admin: "bg-blue-50 text-blue-700",
  finance_manager: "bg-purple-50 text-purple-700",
  finance_staff: "bg-slate-100 text-slate-700",
};

export default function MembersPage() {
  const pathname = usePathname();
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ email: "", display_name: "", role: "finance_staff", client_id: "" });
  const [editingId, setEditingId] = useState<string | null>(null);
  const { t } = useI18n();

  async function fetchMembers() {
    setLoading(true); setError(null);
      try {
        const res = await fetch("/api/settings/members");
        const data = await res.json().catch(() => null);
        if (!res.ok) throw new Error(data?.error ?? t("settings.memberLoadFailed"));
        setMembers(data ?? []);
      } catch (cause) {
          setError(cause instanceof Error ? cause.message : t("settings.memberLoadFailed"));
      } finally {
        setLoading(false);
      }
  }

  useEffect(() => { const timer = window.setTimeout(() => { void fetchMembers(); }, 0); return () => window.clearTimeout(timer); }, []);

  async function saveMember(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true); setError(null);
    const url = editingId ? `/api/settings/members/${editingId}` : "/api/settings/members";
    const method = editingId ? "PATCH" : "POST";
    const body = editingId ? { display_name: form.display_name, role: form.role, client_id: form.client_id || null } : { ...form, client_id: form.client_id || null };
    try {
      const response = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!response.ok) { const result = await response.json().catch(() => null); throw new Error(result?.error ?? t("common.saveFailed")); }
      setForm({ email: "", display_name: "", role: "finance_staff", client_id: "" }); setEditingId(null);
      await fetchMembers();
    } catch (cause) { setError(cause instanceof Error ? cause.message : t("common.saveFailed")); } finally { setSaving(false); }
  }

  async function toggleMember(member: Member) {
    setError(null);
    try { const response = await fetch(`/api/settings/members/${member.id}`, { method: member.is_active ? "DELETE" : "PATCH", headers: { "Content-Type": "application/json" }, body: member.is_active ? undefined : JSON.stringify({ is_active: true }) }); if (!response.ok) throw new Error(t("settings.memberStatusFailed")); await fetchMembers(); } catch (cause) { setError(cause instanceof Error ? cause.message : t("settings.memberStatusFailed")); }
  }

  return (
    <main className="page-canvas text-slate-900"><div className="mx-auto w-full max-w-6xl space-y-6">
      <header><div className="flex items-center gap-2 text-xs font-semibold text-blue-600"><Settings2 className="size-4" /> {t("settings.controlCenter")} <span className="text-slate-400">/</span> {t("nav.settings")}</div><h1 className="mt-3 text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">{t("settings.membersAccess")}</h1><p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500">{t("settings.membersDescription")}</p></header>

      {/* Tabs */}
      <nav aria-label={t("nav.settings")} className="flex max-w-full gap-2 overflow-x-auto border-b border-slate-200 pb-2">
        {settingsTabs.map((tab) => {
          const isActive =
            tab.href === "/settings"
              ? pathname === "/settings"
              : pathname.startsWith(tab.href);

          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                "flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition-colors",
                isActive
                  ? "bg-blue-600 text-white shadow-sm"
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-950"
              )}
            >
              <tab.icon aria-hidden="true" className="size-3.5" />
              {t(tab.labelKey as never)}
            </Link>
          );
        })}
      </nav>

      {/* Members List */}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-6">
          <div className="surface-card overflow-hidden rounded-2xl">
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100">
            <div>
              <h2 className="text-lg font-bold text-slate-950">
                {t("settings.workspaceMembers")}
              </h2>
              <p className="text-sm text-slate-500">
                {members.filter((member) => member.is_active).length} {t("settings.activeOfMembers")} {members.length} {t("settings.memberCountLabel")}
              </p>
            </div>
            <Button type="button" onClick={() => { setEditingId(null); setForm({ email: "", display_name: "", role: "finance_staff", client_id: "" }); }} className="cta-primary"><UserPlus className="size-4" />{t("settings.inviteMember")}</Button>
          </div>
          {error && <div role="alert" className="flex flex-col gap-2 border-b border-red-100 bg-red-50 px-5 py-3 text-sm text-red-600 sm:flex-row sm:items-center sm:justify-between"><span>{error}</span><Button type="button" variant="outline" onClick={() => void fetchMembers()} className="w-fit gap-2 border-red-200 bg-white text-red-700"><RefreshCw className="size-4" />Coba lagi</Button></div>}

          {/* List */}
          <div className="divide-y divide-slate-50">
            {loading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 px-5 py-3.5">
                  <Skeleton className="size-9 rounded-full" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-3 w-[140px]" />
                    <Skeleton className="h-2.5 w-[180px]" />
                  </div>
                  <Skeleton className="h-5 w-[80px] rounded-full" />
                </div>
              ))
            ) : members.length === 0 ? (
              <div className="px-5 py-10 text-center text-sm text-slate-500">
                {t("settings.noMembers")}
              </div>
            ) : (
              members.map((member) => (
                <div
                  key={member.id}
                  className="flex flex-wrap items-center gap-3 px-5 py-3.5"
                >
                  {/* Avatar */}
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-blue-50 text-sm font-bold text-blue-700">
                    {member.initials}
                  </span>

                  {/* Info */}
                  <div className="min-w-0 flex-1">
                    <strong className="block truncate text-sm font-semibold text-slate-900">
                      {member.name}
                    </strong>
                    {member.email && (
                      <span className="block truncate text-sm text-slate-500">
                        {member.email}
                      </span>
                    )}
                  </div>

                  <span className={cn("rounded-full px-2.5 py-1 text-xs font-semibold", member.is_active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500")}>{member.is_active ? t("settings.active") : t("settings.inactive")}</span>
                  <span
                    className={cn(
                      "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold",
                      roleColors[member.role] ?? "bg-slate-200 text-slate-700"
                    )}
                  >
                    {roleLabels[member.role] ? t(roleLabels[member.role] as never) : member.role}
                  </span>
                  <Tooltip><TooltipTrigger render={<button type="button" onClick={() => { setEditingId(member.id); setForm({ email: member.email ?? "", display_name: member.name, role: member.role, client_id: member.client_id ?? "" }); }} className="ml-2 rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-800" aria-label={`Edit anggota ${member.name}`} />}><Pencil className="size-3.5" /></TooltipTrigger><TooltipContent>Edit anggota</TooltipContent></Tooltip>
                  <Tooltip><TooltipTrigger render={<button type="button" onClick={() => void toggleMember(member)} className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-800" aria-label={member.is_active ? `Nonaktifkan anggota ${member.name}` : `Aktifkan anggota ${member.name}`} />}><Power className="size-3.5" /></TooltipTrigger><TooltipContent>{member.is_active ? "Nonaktifkan anggota" : "Aktifkan anggota"}</TooltipContent></Tooltip>
                </div>
              ))
            )}
          </div>
          </div>
          <form onSubmit={saveMember} className="surface-card rounded-2xl p-5 sm:p-6">
          <h2 className="mb-1 text-lg font-bold text-slate-950">{editingId ? t("common.edit") : t("settings.inviteNewMember")}</h2><p className="mb-5 text-sm text-slate-500">{t("settings.memberFormDescription")}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label htmlFor="member-name" className="text-sm font-semibold text-slate-700">{t("settings.name")}<input id="member-name" className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm" value={form.display_name} onChange={(event) => setForm({ ...form, display_name: event.target.value })} required /></label>
            {!editingId && <label htmlFor="member-email" className="text-sm font-semibold text-slate-700">{t("settings.email")}<input id="member-email" type="email" className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} required /></label>}
            <label htmlFor="member-role" className="text-sm font-semibold text-slate-700">{t("settings.role")}<select id="member-role" className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm" value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value })}><option value="finance_staff">{t("settings.financeStaff")}</option><option value="finance_manager">{t("settings.financeManager")}</option><option value="admin">{t("settings.admin")}</option></select></label>
          </div>
          <div className="mt-5 flex gap-2"><Button disabled={saving} className="cta-primary">{saving && <Loader2 className="size-4 animate-spin" />}{editingId ? t("common.save") : t("settings.sendInvite")}</Button>{editingId && <Button type="button" variant="outline" onClick={() => setEditingId(null)}>{t("common.cancel")}</Button>}</div>
          </form>
        </div>
      <aside className="surface-card h-fit rounded-2xl p-5"><div className="flex items-center gap-2"><Users className="size-5 text-blue-600" /><h3 className="font-bold text-slate-950">{t("settings.accessControl")}</h3></div><p className="mt-2 text-sm leading-6 text-slate-500">{t("settings.accessControlDescription")}</p></aside>
      </div>
    </div>
    </main>
  );
}
