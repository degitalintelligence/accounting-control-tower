"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { settingsTabs } from "@/lib/navigation";

export default function SettingsPage() {
  const pathname = usePathname();
  const [form, setForm] = React.useState({ name: "", slug: "", timezone: "Asia/Jakarta", currency: "IDR" });
  const [saving, setSaving] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);

  async function loadSettings() { setLoading(true); setError(null); try { const response = await fetch("/api/settings/organization", { cache: "no-store" }); const body = await response.json().catch(() => null); if (!response.ok) throw new Error(body?.error ?? "Pengaturan gagal dimuat."); const settings = body.data?.settings ?? {}; setForm({ name: body.data?.name ?? "", slug: body.data?.slug ?? "", timezone: settings.timezone ?? "Asia/Jakarta", currency: settings.currency ?? "IDR" }); } catch (cause) { setError(cause instanceof Error ? cause.message : "Pengaturan gagal dimuat."); } finally { setLoading(false); } }
  React.useEffect(() => { const timer = window.setTimeout(() => { void loadSettings(); }, 0); return () => window.clearTimeout(timer); }, []);

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setMessage(null); setError(null);
    try { const response = await fetch("/api/settings/organization", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) }); const body = await response.json().catch(() => null); if (!response.ok) throw new Error(body?.error ?? "Pengaturan gagal disimpan."); setMessage("Pengaturan tersimpan."); } catch (cause) { setError(cause instanceof Error ? cause.message : "Pengaturan gagal disimpan."); } finally { setSaving(false); }
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

      {/* General Settings Content */}
      <div className="max-w-2xl">
        <div className="rounded-[14px] bg-white p-5 shadow-[0_2px_12px_rgba(0,0,0,.06)]">
          <h2 className="text-[15px] font-semibold text-[#18201f] mb-4">
            Informasi Organisasi
          </h2>

          {error && <div role="alert" className="mb-4 flex flex-col gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 sm:flex-row sm:items-center sm:justify-between"><span>{error}</span><Button type="button" variant="outline" onClick={() => void loadSettings()} className="w-fit gap-2 border-red-200 bg-white text-red-700"><RefreshCw className="size-4" />Coba lagi</Button></div>}
          {loading ? <div className="py-8 text-sm text-slate-500">Memuat pengaturan…</div> : <form onSubmit={save} className="space-y-4">
            <div>
              <label htmlFor="organization-name" className="block text-[12px] font-medium text-[#8b9492] mb-1">
                Nama Organisasi
              </label>
              <input id="organization-name" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-[13px] text-[#18201f]" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required />
            </div>

            <div>
              <label htmlFor="organization-slug" className="block text-[12px] font-medium text-[#8b9492] mb-1">
                Slug
              </label>
              <input id="organization-slug" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-[13px] text-[#18201f]" value={form.slug} onChange={(event) => setForm({ ...form, slug: event.target.value })} required />
            </div>

            <div>
              <label htmlFor="organization-timezone" className="block text-[12px] font-medium text-[#8b9492] mb-1">
                Timezone
              </label>
              <input id="organization-timezone" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-[13px] text-[#18201f]" value={form.timezone} onChange={(event) => setForm({ ...form, timezone: event.target.value })} required />
            </div>
            <div><label htmlFor="organization-currency" className="block text-[12px] font-medium text-[#8b9492] mb-1">Mata uang</label><input id="organization-currency" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-[13px] text-[#18201f]" value={form.currency} onChange={(event) => setForm({ ...form, currency: event.target.value.toUpperCase() })} required /></div>
            <button disabled={saving} className="inline-flex items-center gap-2 rounded-lg bg-orange-500 px-3 py-2 text-xs font-semibold text-white hover:bg-orange-600">{saving && <Loader2 className="size-3.5 animate-spin" />}Simpan perubahan</button>
            {message && <p className="text-xs text-emerald-600">{message}</p>}
          </form>}

          <p className="mt-4 text-[11px] text-[#8b9492]">
            Perubahan nama dan konfigurasi berlaku untuk seluruh workspace.
          </p>
        </div>
      </div>
    </main>
  );
}
