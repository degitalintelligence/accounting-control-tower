"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Building2, Clock3, Coins, Info, Loader2, RefreshCw, Settings2 } from "lucide-react";
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
    <main className="page-canvas text-slate-900">
      <div className="mx-auto w-full max-w-6xl space-y-6">
        <header>
          <div className="flex items-center gap-2 text-xs font-semibold text-blue-600"><Settings2 className="size-4" /> Control Center <span className="text-slate-400">/</span> Pengaturan</div>
          <div className="mt-3 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">Pengaturan workspace</h1>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500">Kelola identitas organisasi, anggota, klien, dan preferensi operasional dari satu tempat.</p>
            </div>
            <div className="hidden items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-500 shadow-sm sm:flex"><Building2 className="size-4 text-blue-600" /> Berlaku untuk workspace</div>
          </div>
        </header>

      <nav aria-label="Navigasi pengaturan" className="flex max-w-full gap-2 overflow-x-auto border-b border-slate-200 pb-2">
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
              {tab.label}
            </Link>
          );
        })}
      </nav>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="surface-card rounded-2xl p-5 sm:p-6">
          <div className="mb-6 flex items-start justify-between gap-3 border-b border-slate-100 pb-5">
            <div><h2 className="text-lg font-bold text-slate-950">Informasi organisasi</h2><p className="mt-1 text-sm text-slate-500">Identitas dan preferensi dasar yang digunakan di seluruh workspace.</p></div>
            <Building2 className="size-5 text-blue-600" />
          </div>

          {error && <div role="alert" className="mb-4 flex flex-col gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 sm:flex-row sm:items-center sm:justify-between"><span>{error}</span><Button type="button" variant="outline" onClick={() => void loadSettings()} className="w-fit gap-2 border-red-200 bg-white text-red-700"><RefreshCw className="size-4" />Coba lagi</Button></div>}
          {loading ? <div className="space-y-4 py-4"><div className="h-10 animate-pulse rounded-lg bg-slate-100" /><div className="h-10 animate-pulse rounded-lg bg-slate-100" /><div className="h-10 animate-pulse rounded-lg bg-slate-100" /></div> : <form onSubmit={save} className="space-y-5">
            <div>
              <label htmlFor="organization-name" className="mb-1.5 block text-sm font-semibold text-slate-700">
                Nama Organisasi
              </label>
              <input id="organization-name" className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required />
              <p className="mt-1.5 text-xs text-slate-500">Nama ini tampil pada navigasi dan dokumen operasional.</p>
            </div>

            <div>
              <label htmlFor="organization-slug" className="mb-1.5 block text-sm font-semibold text-slate-700">
                Slug
              </label>
              <input id="organization-slug" className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100" value={form.slug} onChange={(event) => setForm({ ...form, slug: event.target.value })} required />
              <p className="mt-1.5 text-xs text-slate-500">Identifier workspace untuk kebutuhan integrasi dan URL internal.</p>
            </div>

            <div>
              <label htmlFor="organization-timezone" className="mb-1.5 block text-sm font-semibold text-slate-700">
                Timezone
              </label>
              <div className="relative"><Clock3 className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" /><input id="organization-timezone" className="w-full rounded-lg border border-slate-200 bg-white py-2.5 pl-10 pr-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100" value={form.timezone} onChange={(event) => setForm({ ...form, timezone: event.target.value })} required /></div>
            </div>
            <div><label htmlFor="organization-currency" className="mb-1.5 block text-sm font-semibold text-slate-700">Mata uang</label><div className="relative"><Coins className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" /><input id="organization-currency" className="w-full rounded-lg border border-slate-200 bg-white py-2.5 pl-10 pr-3 text-sm uppercase text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100" value={form.currency} onChange={(event) => setForm({ ...form, currency: event.target.value.toUpperCase() })} required /></div></div>
            <div className="flex flex-wrap items-center gap-3 border-t border-slate-100 pt-5"><Button disabled={saving} className="cta-primary">{saving && <Loader2 className="size-4 animate-spin" />}Simpan perubahan</Button>{message && <p role="status" className="text-sm font-medium text-emerald-700">{message}</p>}</div>
          </form>}

          <div className="mt-5 flex gap-2 rounded-xl border border-blue-100 bg-blue-50 p-3 text-xs leading-5 text-blue-900"><Info className="mt-0.5 size-4 shrink-0 text-blue-600" />Perubahan nama dan konfigurasi berlaku untuk seluruh workspace. Pastikan timezone dan mata uang sesuai kebutuhan operasional.</div>
        </div>
        <aside className="space-y-4"><div className="surface-card rounded-2xl p-5"><h3 className="font-bold text-slate-950">Tentang pengaturan</h3><p className="mt-2 text-sm leading-6 text-slate-500">Gunakan navigasi di atas untuk mengelola akses tim, data klien, dan preferensi notifikasi.</p><div className="mt-5 space-y-3 text-sm"><QuickLink icon={Building2} label="Anggota dan akses" text="Kelola role pengguna" href="/settings/members" /><QuickLink icon={Info} label="Klien" text="Atur scope client" href="/settings/clients" /><QuickLink icon={Settings2} label="Notifikasi" text="Atur preferensi akun" href="/settings/notifications" /></div></div><div className="rounded-2xl border border-amber-200 bg-amber-50 p-5"><p className="text-sm font-bold text-amber-950">Butuh kontrol lanjutan?</p><p className="mt-1 text-sm leading-6 text-amber-900">Buka Administrasi untuk integrasi WhatsApp, audit, antrean gagal, dan kesehatan worker.</p><Link href="/settings/administration" className="mt-4 inline-flex items-center text-sm font-bold text-amber-950 hover:underline">Buka administrasi <span aria-hidden="true">→</span></Link></div></aside>
      </section>
      </div>
    </main>
  );
}

function QuickLink({ icon: Icon, label, text, href }: { icon: typeof Building2; label: string; text: string; href: string }) { return <Link href={href} className="flex items-center gap-3 rounded-xl border border-slate-200 p-3 transition hover:border-blue-200 hover:bg-blue-50/50"><span className="rounded-lg bg-blue-50 p-2 text-blue-600"><Icon className="size-4" /></span><span className="min-w-0"><span className="block font-semibold text-slate-900">{label}</span><span className="block text-xs text-slate-500">{text}</span></span><span className="ml-auto text-slate-400">→</span></Link>; }
