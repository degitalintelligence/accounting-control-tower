"use client";

import { useEffect, useState } from "react";
import { Bell, Info, Loader2, RefreshCw, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

const fields = [
  ["email_enabled", "Email notification aktif"],
  ["email_on_assignment", "Saat pekerjaan ditugaskan"],
  ["email_on_status_change", "Saat status berubah"],
  ["email_on_deadline", "Pengingat tenggat"],
  ["email_on_overdue", "Pekerjaan overdue"],
  ["email_on_review", "Saat ada review"],
] as const;

type Preferences = Record<(typeof fields)[number][0], boolean>;

export default function NotificationSettingsPage() {
  const [preferences, setPreferences] = useState<Preferences | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  async function loadPreferences() { setError(null); try { const response = await fetch("/api/settings/notifications", { cache: "no-store" }); const body = await response.json().catch(() => null); if (!response.ok) throw new Error(body?.error ?? "Preferensi gagal dimuat."); setPreferences(body.data); } catch (cause) { setError(cause instanceof Error ? cause.message : "Preferensi gagal dimuat."); } }
  useEffect(() => { const timer = window.setTimeout(() => { void loadPreferences(); }, 0); return () => window.clearTimeout(timer); }, []);
  async function save(event: React.FormEvent<HTMLFormElement>) { event.preventDefault(); if (!preferences) return; setSaving(true); setError(null); try { const response = await fetch("/api/settings/notifications", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(preferences) }); if (!response.ok) throw new Error("Preferensi gagal disimpan."); setMessage("Preferensi tersimpan."); } catch (cause) { setError(cause instanceof Error ? cause.message : "Preferensi gagal disimpan."); } finally { setSaving(false); } }
  return <main className="page-canvas text-slate-900"><div className="mx-auto w-full max-w-6xl space-y-6"><header><div className="flex items-center gap-2 text-xs font-semibold text-blue-600"><Settings2 className="size-4" /> Control Center <span className="text-slate-400">/</span> Pengaturan</div><h1 className="mt-3 text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">Preferensi notifikasi</h1><p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500">Atur sinyal operasional yang ingin Anda terima melalui email. Pengaturan ini berlaku untuk akun Anda.</p></header><div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]"><form onSubmit={save} className="surface-card rounded-2xl p-5 sm:p-6"><div className="mb-5 flex items-start gap-3 border-b border-slate-100 pb-5"><span className="rounded-xl bg-blue-50 p-2.5 text-blue-600"><Bell aria-hidden="true" className="size-5" /></span><div><h2 className="text-lg font-bold text-slate-950">Notifikasi email</h2><p className="mt-1 text-sm text-slate-500">Pilih kejadian yang perlu dikirim ke inbox Anda.</p></div></div>{error && <div role="alert" className="mb-4 flex flex-col gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 sm:flex-row sm:items-center sm:justify-between"><span>{error}</span><Button type="button" variant="outline" onClick={() => void loadPreferences()} className="w-fit gap-2 border-red-200 bg-white text-red-700"><RefreshCw className="size-4" />Coba lagi</Button></div>}{preferences ? <div className="divide-y divide-slate-100">{fields.map(([key, label]) => <label key={key} className="flex cursor-pointer items-center justify-between gap-4 py-3.5 text-sm text-slate-700"><span>{label}</span><input type="checkbox" aria-label={label} checked={preferences[key]} onChange={(event) => setPreferences({ ...preferences, [key]: event.target.checked })} className="size-4 accent-blue-600" /></label>)}</div> : <div className="space-y-3">{fields.map(([key]) => <div key={key} className="flex items-center justify-between"><Skeleton className="h-4 w-48" /><Skeleton className="size-4" /></div>)}</div>}<div className="mt-5 flex flex-wrap items-center gap-3 border-t border-slate-100 pt-5"><Button disabled={!preferences || saving} className="cta-primary">{saving && <Loader2 className="size-4 animate-spin" />}Simpan preferensi</Button>{message && <span role="status" className="text-sm font-medium text-emerald-700">{message}</span>}</div></form><aside className="surface-card h-fit rounded-2xl p-5"><div className="flex items-center gap-2"><Info className="size-5 text-blue-600" /><h3 className="font-bold text-slate-950">Sinyal yang penting</h3></div><p className="mt-2 text-sm leading-6 text-slate-500">Aktifkan notifikasi assignment, perubahan status, deadline, overdue, dan review agar tidak ada pekerjaan yang terlewat.</p></aside></div></div></main>;
}
