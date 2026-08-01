"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { UserPlus, Loader2, Power, Pencil, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { settingsTabs } from "@/lib/navigation";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

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
  admin: "Admin",
  finance_manager: "Finance Manager",
  finance_staff: "Finance Staff",
};

const roleColors: Record<string, string> = {
  admin: "bg-[#3b82f6] text-white",
  finance_manager: "bg-[#8b5cf6] text-white",
  finance_staff: "bg-[#6b7280] text-white",
};

export default function MembersPage() {
  const pathname = usePathname();
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ email: "", display_name: "", role: "finance_staff", client_id: "" });
  const [editingId, setEditingId] = useState<string | null>(null);

  async function fetchMembers() {
    setLoading(true); setError(null);
      try {
        const res = await fetch("/api/settings/members");
        const data = await res.json().catch(() => null);
        if (!res.ok) throw new Error(data?.error ?? "Daftar anggota gagal dimuat.");
        setMembers(data ?? []);
      } catch (cause) {
          setError(cause instanceof Error ? cause.message : "Daftar anggota gagal dimuat.");
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
    const response = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (!response.ok) { const result = await response.json().catch(() => null); setError(result?.error ?? "Perubahan gagal disimpan."); setSaving(false); return; }
    setForm({ email: "", display_name: "", role: "finance_staff", client_id: "" }); setEditingId(null);
    await fetchMembers(); setSaving(false);
  }

  async function toggleMember(member: Member) {
    const response = await fetch(`/api/settings/members/${member.id}`, { method: member.is_active ? "DELETE" : "PATCH", headers: { "Content-Type": "application/json" }, body: member.is_active ? undefined : JSON.stringify({ is_active: true }) });
    if (response.ok) await fetchMembers(); else setError("Status anggota gagal diperbarui.");
  }

  return (
    <main className="flex-1 min-h-screen bg-[#f3f5f2] p-4 sm:p-6">
      <div className="mb-6">
        <h1 className="text-[20px] font-semibold text-[#18201f]">Settings</h1>
        <p className="text-[13px] text-[#8b9492] mt-0.5">
          Kelola pengaturan organisasi Anda
        </p>
      </div>

      {/* Tabs */}
      <nav aria-label="Navigasi pengaturan" className="mb-6 flex max-w-full gap-1 overflow-x-auto border-b border-slate-200">
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
                "flex items-center gap-1.5 px-4 py-2.5 text-[13px] font-medium border-b-2 -mb-px transition-colors",
                isActive
                  ? "border-[#18201f] text-[#18201f]"
                  : "border-transparent text-[#8b9492] hover:text-[#18201f]"
              )}
            >
              <tab.icon aria-hidden="true" className="size-3.5" />
              {tab.label}
            </Link>
          );
        })}
      </nav>

      {/* Members List */}
      <div className="max-w-3xl">
        <div className="rounded-[14px] bg-white shadow-[0_2px_12px_rgba(0,0,0,.06)] overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100">
            <div>
              <h2 className="text-[15px] font-semibold text-[#18201f]">
                Anggota Organisasi
              </h2>
              <p className="text-[11px] text-[#8b9492]">
                {members.filter((member) => member.is_active).length} aktif dari {members.length} anggota
              </p>
            </div>
            <button type="button" onClick={() => { setEditingId(null); setForm({ email: "", display_name: "", role: "finance_staff", client_id: "" }); }} className="inline-flex items-center gap-1.5 rounded-lg bg-orange-500 px-3 py-2 text-xs font-semibold text-white hover:bg-orange-600"><UserPlus className="size-3.5" />Undang anggota</button>
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
              <div className="px-5 py-8 text-center text-[13px] text-[#8b9492]">
                Belum ada anggota.
              </div>
            ) : (
              members.map((member) => (
                <div
                  key={member.id}
                  className="flex flex-wrap items-center gap-3 px-5 py-3.5"
                >
                  {/* Avatar */}
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[#e5e7eb] text-[11px] font-bold text-[#374151]">
                    {member.initials}
                  </span>

                  {/* Info */}
                  <div className="min-w-0 flex-1">
                    <strong className="block text-[13px] font-medium text-[#18201f] truncate">
                      {member.name}
                    </strong>
                    {member.email && (
                      <span className="block text-[11px] text-[#8b9492] truncate">
                        {member.email}
                      </span>
                    )}
                  </div>

                  <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold", member.is_active ? "bg-emerald-50 text-emerald-600" : "bg-slate-100 text-slate-500")}>{member.is_active ? "Aktif" : "Nonaktif"}</span>
                  <span
                    className={cn(
                      "inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-semibold",
                      roleColors[member.role] ?? "bg-slate-200 text-slate-700"
                    )}
                  >
                    {roleLabels[member.role] ?? member.role}
                  </span>
                  <Tooltip><TooltipTrigger render={<button type="button" onClick={() => { setEditingId(member.id); setForm({ email: member.email ?? "", display_name: member.name, role: member.role, client_id: member.client_id ?? "" }); }} className="ml-2 rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-800" aria-label={`Edit anggota ${member.name}`} />}><Pencil className="size-3.5" /></TooltipTrigger><TooltipContent>Edit anggota</TooltipContent></Tooltip>
                  <Tooltip><TooltipTrigger render={<button type="button" onClick={() => void toggleMember(member)} className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-800" aria-label={member.is_active ? `Nonaktifkan anggota ${member.name}` : `Aktifkan anggota ${member.name}`} />}><Power className="size-3.5" /></TooltipTrigger><TooltipContent>{member.is_active ? "Nonaktifkan anggota" : "Aktifkan anggota"}</TooltipContent></Tooltip>
                </div>
              ))
            )}
          </div>
        </div>
        <form onSubmit={saveMember} className="mt-5 rounded-[14px] bg-white p-5 shadow-[0_2px_12px_rgba(0,0,0,.06)]">
          <h2 className="mb-4 text-[15px] font-semibold text-[#18201f]">{editingId ? "Edit anggota" : "Undang anggota baru"}</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <label htmlFor="member-name" className="text-xs font-medium text-slate-700">Nama<input id="member-name" className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={form.display_name} onChange={(event) => setForm({ ...form, display_name: event.target.value })} required /></label>
            {!editingId && <label htmlFor="member-email" className="text-xs font-medium text-slate-700">Email<input id="member-email" type="email" className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} required /></label>}
            <label htmlFor="member-role" className="text-xs font-medium text-slate-700">Peran<select id="member-role" className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value })}><option value="finance_staff">Staf keuangan</option><option value="finance_manager">Manajer keuangan</option><option value="admin">Admin</option></select></label>
          </div>
          <div className="mt-4 flex gap-2"><button disabled={saving} className="inline-flex items-center gap-2 rounded-lg bg-orange-500 px-3 py-2 text-xs font-semibold text-white hover:bg-orange-600">{saving && <Loader2 className="size-3.5 animate-spin" />}{editingId ? "Simpan" : "Kirim undangan"}</button>{editingId && <button type="button" onClick={() => setEditingId(null)} className="rounded-lg border border-slate-200 px-3 py-2 text-xs">Batal</button>}</div>
        </form>
      </div>
    </main>
  );
}
