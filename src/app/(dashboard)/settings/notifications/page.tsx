"use client";

import { useEffect, useState } from "react";
import { Bell, Loader2 } from "lucide-react";
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
  useEffect(() => { void fetch("/api/settings/notifications").then((response) => response.json()).then((body) => setPreferences(body.data)); }, []);
  async function save(event: React.FormEvent<HTMLFormElement>) { event.preventDefault(); if (!preferences) return; setSaving(true); const response = await fetch("/api/settings/notifications", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(preferences) }); setMessage(response.ok ? "Preferensi tersimpan." : "Preferensi gagal disimpan."); setSaving(false); }
  return <main className="page-canvas"><div className="mb-6"><h1 className="text-xl font-semibold text-[#18201f]">Preferensi notifikasi</h1><p className="mt-1 text-sm text-[#8b9492]">Atur sinyal operasional yang ingin Anda terima melalui email.</p></div><form onSubmit={save} className="max-w-2xl rounded-[14px] bg-white p-5 shadow-[0_2px_12px_rgba(0,0,0,.06)]"><div className="mb-4 flex items-center gap-2"><Bell className="size-5 text-blue-600" /><h2 className="text-[15px] font-semibold text-[#18201f]">Email notification</h2></div>{preferences ? <div className="divide-y divide-slate-100">{fields.map(([key, label]) => <label key={key} className="flex items-center justify-between gap-4 py-3 text-sm text-slate-700"><span>{label}</span><input type="checkbox" checked={preferences[key]} onChange={(event) => setPreferences({ ...preferences, [key]: event.target.checked })} className="size-4 accent-blue-600" /></label>)}</div> : <div className="space-y-3">{fields.map(([key]) => <div key={key} className="flex items-center justify-between"><Skeleton className="h-4 w-48" /><Skeleton className="size-4" /></div>)}</div>}<div className="mt-5 flex items-center gap-3"><button disabled={!preferences || saving} className="inline-flex items-center gap-2 rounded-lg bg-orange-500 px-3 py-2 text-xs font-semibold text-white hover:bg-orange-600">{saving && <Loader2 className="size-3.5 animate-spin" />}Simpan preferensi</button>{message && <span className="text-xs text-emerald-600">{message}</span>}</div></form></main>;
}
