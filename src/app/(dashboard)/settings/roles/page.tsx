"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { KeyRound, Loader2, Plus, RefreshCw, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { settingsTabs } from "@/lib/navigation";

type Role = { id: string; role_key: string; name: string; description: string | null; is_system: boolean; is_active: boolean };
type Permission = { id: string; permission_key: string; name: string; description: string | null; category: string };
type RolePermission = { role_id: string; permission_id: string };

export default function RolesPage() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [rolePermissions, setRolePermissions] = useState<RolePermission[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [form, setForm] = useState({ role_key: "", name: "", description: "" });
  const [createForm, setCreateForm] = useState({ role_key: "", name: "", description: "" });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function load() {
    setLoading(true); setError(null);
    try {
      const response = await fetch("/api/settings/roles", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error ?? "Data akses gagal dimuat.");
      const nextRoles = (body.roles ?? []) as Role[];
      setRoles(nextRoles);
      setPermissions(body.permissions ?? []);
      setRolePermissions(body.rolePermissions ?? []);
      setSelected((current) => {
        const nextSelected = current && nextRoles.some((role) => role.id === current) ? current : nextRoles[0]?.id ?? null;
        const nextRole = nextRoles.find((role) => role.id === nextSelected);
        if (nextRole) setForm({ role_key: nextRole.role_key, name: nextRole.name, description: nextRole.description ?? "" });
        return nextSelected;
      });
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Data akses gagal dimuat."); } finally { setLoading(false); }
  }
  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, []);
  const current = roles.find((role) => role.id === selected) ?? null;
  const selectedPermissions = useMemo(() => new Set(rolePermissions.filter((item) => item.role_id === selected).map((item) => item.permission_id)), [rolePermissions, selected]);
  const grouped = permissions.reduce<Record<string, Permission[]>>((result, permission) => { (result[permission.category] ??= []).push(permission); return result; }, {});
  function choose(role: Role) { setSelected(role.id); setForm({ role_key: role.role_key, name: role.name, description: role.description ?? "" }); setMessage(null); }
  async function save() {
    if (!current) return;
    setSaving(true); setError(null); setMessage(null);
    try { const response = await fetch("/api/settings/roles", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ role_id: current.id, name: form.name, description: form.description || null, permission_ids: [...selectedPermissions] }) }); const body = await response.json(); if (!response.ok) throw new Error(body?.error ?? "Peran gagal disimpan."); setMessage("Peran dan permission tersimpan."); await load(); } catch (cause) { setError(cause instanceof Error ? cause.message : "Peran gagal disimpan."); } finally { setSaving(false); }
  }
  async function createRole(event: React.FormEvent) { event.preventDefault(); setSaving(true); setError(null); try { const response = await fetch("/api/settings/roles", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(createForm) }); const body = await response.json(); if (!response.ok) throw new Error(body?.error ?? "Peran gagal dibuat."); setCreateForm({ role_key: "", name: "", description: "" }); await load(); choose(body.data); } catch (cause) { setError(cause instanceof Error ? cause.message : "Peran gagal dibuat."); } finally { setSaving(false); } }
  function toggle(permissionId: string) { setRolePermissions((items) => selectedPermissions.has(permissionId) ? items.filter((item) => !(item.role_id === selected && item.permission_id === permissionId)) : [...items, { role_id: selected as string, permission_id: permissionId }]); }

  return <main className="page-canvas text-slate-900"><div className="mx-auto w-full max-w-6xl space-y-6"><header><div className="flex items-center gap-2 text-xs font-semibold text-blue-600"><KeyRound className="size-4" /> Control Center <span className="text-slate-400">/</span> Pengaturan</div><h1 className="mt-3 text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">Peran dan permission</h1><p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500">Atur akses workspace berdasarkan peran tanpa mengubah histori keanggotaan.</p></header><nav aria-label="Navigasi pengaturan" className="flex max-w-full gap-2 overflow-x-auto border-b border-slate-200 pb-2">{settingsTabs.map((tab) => <Link key={tab.href} href={tab.href} className={cn("flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold", tab.href === "/settings/roles" ? "bg-blue-600 text-white shadow-sm" : "text-slate-600 hover:bg-slate-100")}><tab.icon className="size-3.5" />{tab.label}</Link>)}</nav>{error && <div role="alert" className="flex items-center justify-between rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}<Button variant="outline" onClick={() => void load()}><RefreshCw className="size-4" /> Coba lagi</Button></div>}{message && <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{message}</div>}{loading ? <div className="h-80 animate-pulse rounded-2xl bg-white shadow-sm" /> : <div className="grid gap-6 xl:grid-cols-[280px_minmax(0,1fr)]"><section className="surface-card rounded-2xl p-4"><div className="mb-3 flex items-center justify-between"><h2 className="font-bold">Peran workspace</h2><Shield className="size-5 text-blue-600" /></div><div className="space-y-1">{roles.map((role) => <button key={role.id} type="button" onClick={() => choose(role)} className={cn("w-full rounded-lg px-3 py-2 text-left text-sm", selected === role.id ? "bg-blue-50 font-semibold text-blue-800" : "hover:bg-slate-50")}>{role.name}<span className="mt-0.5 block text-xs font-normal text-slate-500">{role.role_key}</span></button>)}</div><form onSubmit={createRole} className="mt-5 space-y-2 border-t border-slate-100 pt-4"><p className="text-sm font-bold">Tambah peran custom</p><input className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" placeholder="key_peran" value={createForm.role_key} onChange={(event) => setCreateForm({ ...createForm, role_key: event.target.value })} /><input className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" placeholder="Nama peran" value={createForm.name} onChange={(event) => setCreateForm({ ...createForm, name: event.target.value })} /><Button className="w-full cta-primary" disabled={saving}><Plus className="size-4" /> Buat peran</Button></form></section><section className="surface-card rounded-2xl p-5 sm:p-6"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-lg font-bold">{current?.name ?? "Pilih peran"}</h2><p className="mt-1 text-sm text-slate-500">{current?.description ?? "Permission menentukan kemampuan anggota pada workspace."}</p></div><Button onClick={() => void save()} disabled={saving || !current} className="cta-primary">{saving && <Loader2 className="size-4 animate-spin" />}Simpan perubahan</Button></div>{current && <div className="mt-6 space-y-5">{Object.entries(grouped).map(([category, items]) => <div key={category}><h3 className="mb-2 text-sm font-bold text-slate-700">{category}</h3><div className="grid gap-2 sm:grid-cols-2">{items.map((permission) => <label key={permission.id} className="flex cursor-pointer gap-3 rounded-xl border border-slate-200 p-3 hover:border-blue-200"><input type="checkbox" checked={selectedPermissions.has(permission.id)} onChange={() => toggle(permission.id)} className="mt-1 size-4 accent-blue-600" /><span><span className="block text-sm font-semibold">{permission.name}</span><span className="block text-xs text-slate-500">{permission.description}</span></span></label>)}</div></div>)}</div>}</section></div>}</div></main>;
}
