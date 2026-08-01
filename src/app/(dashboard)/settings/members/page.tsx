"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Building2, Settings, Users, UserPlus, Loader2, Power, Pencil } from "lucide-react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

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

const tabs = [
  { label: "General", href: "/settings", icon: Settings },
  { label: "Members", href: "/settings/members", icon: Users },
  { label: "Clients", href: "/settings/clients", icon: Building2 },
];

export default function MembersPage() {
  const pathname = usePathname();
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ email: "", display_name: "", role: "finance_staff", client_id: "" });
  const [editingId, setEditingId] = useState<string | null>(null);

  useEffect(() => {
    async function fetchMembers() {
      try {
        const res = await fetch("/api/settings/members");
        if (res.ok) {
          const data = await res.json();
          setMembers(data);
        }
      } catch {
          setError("Daftar anggota gagal dimuat.");
      } finally {
        setLoading(false);
      }
    }
    fetchMembers();
  }, []);

  async function saveMember(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true); setError(null);
    const url = editingId ? `/api/settings/members/${editingId}` : "/api/settings/members";
    const method = editingId ? "PATCH" : "POST";
    const body = editingId ? { display_name: form.display_name, role: form.role, client_id: form.client_id || null } : { ...form, client_id: form.client_id || null };
    const response = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (!response.ok) { const result = await response.json().catch(() => null); setError(result?.error ?? "Perubahan gagal disimpan."); setSaving(false); return; }
    setForm({ email: "", display_name: "", role: "finance_staff", client_id: "" }); setEditingId(null);
    const refreshed = await fetch("/api/settings/members"); setMembers(await refreshed.json()); setSaving(false);
  }

  async function toggleMember(member: Member) {
    const response = await fetch(`/api/settings/members/${member.id}`, { method: member.is_active ? "DELETE" : "PATCH", headers: { "Content-Type": "application/json" }, body: member.is_active ? undefined : JSON.stringify({ is_active: true }) });
    if (response.ok) { const refreshed = await fetch("/api/settings/members"); setMembers(await refreshed.json()); }
  }

  return (
    <main className="flex-1 p-6 bg-[#f3f5f2] min-h-screen">
      <div className="mb-6">
        <h1 className="text-[20px] font-semibold text-[#18201f]">Settings</h1>
        <p className="text-[13px] text-[#8b9492] mt-0.5">
          Kelola pengaturan organisasi Anda
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-slate-200 mb-6">
        {tabs.map((tab) => {
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
              <tab.icon className="size-3.5" />
              {tab.label}
            </Link>
          );
        })}
      </div>

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
          {error && <p className="border-b border-red-100 bg-red-50 px-5 py-3 text-xs text-red-600">{error}</p>}

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
                  className="flex items-center gap-3 px-5 py-3.5"
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

                  <span className={cn("mr-2 rounded-full px-2 py-0.5 text-[10px] font-semibold", member.is_active ? "bg-emerald-50 text-emerald-600" : "bg-slate-100 text-slate-500")}>{member.is_active ? "Aktif" : "Nonaktif"}</span>
                  <span
                    className={cn(
                      "inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-semibold",
                      roleColors[member.role] ?? "bg-slate-200 text-slate-700"
                    )}
                  >
                    {roleLabels[member.role] ?? member.role}
                  </span>
                  <button type="button" onClick={() => { setEditingId(member.id); setForm({ email: member.email ?? "", display_name: member.name, role: member.role, client_id: member.client_id ?? "" }); }} className="ml-2 rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-800" aria-label="Edit anggota"><Pencil className="size-3.5" /></button>
                  <button type="button" onClick={() => void toggleMember(member)} className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-800" aria-label={member.is_active ? "Nonaktifkan anggota" : "Aktifkan anggota"}><Power className="size-3.5" /></button>
                </div>
              ))
            )}
          </div>
        </div>
        <form onSubmit={saveMember} className="mt-5 rounded-[14px] bg-white p-5 shadow-[0_2px_12px_rgba(0,0,0,.06)]">
          <h2 className="mb-4 text-[15px] font-semibold text-[#18201f]">{editingId ? "Edit anggota" : "Undang anggota baru"}</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs font-medium text-slate-700">Nama<input className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={form.display_name} onChange={(event) => setForm({ ...form, display_name: event.target.value })} required /></label>
            {!editingId && <label className="text-xs font-medium text-slate-700">Email<input type="email" className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} required /></label>}
            <label className="text-xs font-medium text-slate-700">Role<select className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value })}><option value="finance_staff">Finance Staff</option><option value="finance_manager">Finance Manager</option><option value="admin">Admin</option></select></label>
          </div>
          <div className="mt-4 flex gap-2"><button disabled={saving} className="inline-flex items-center gap-2 rounded-lg bg-orange-500 px-3 py-2 text-xs font-semibold text-white hover:bg-orange-600">{saving && <Loader2 className="size-3.5 animate-spin" />}{editingId ? "Simpan" : "Kirim undangan"}</button>{editingId && <button type="button" onClick={() => setEditingId(null)} className="rounded-lg border border-slate-200 px-3 py-2 text-xs">Batal</button>}</div>
        </form>
      </div>
    </main>
  );
}
