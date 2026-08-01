"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, Building2, Loader2, Settings, Users } from "lucide-react";
import { cn } from "@/lib/utils";

const tabs = [
  { label: "General", href: "/settings", icon: Settings },
  { label: "Members", href: "/settings/members", icon: Users },
  { label: "Clients", href: "/settings/clients", icon: Building2 },
  { label: "Notifikasi", href: "/settings/notifications", icon: Bell },
];

export default function SettingsPage() {
  const pathname = usePathname();
  const [form, setForm] = React.useState({ name: "", slug: "", timezone: "Asia/Jakarta", currency: "IDR" });
  const [saving, setSaving] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);

  React.useEffect(() => { void fetch("/api/settings/organization").then((response) => response.json()).then((body) => { const settings = body.data?.settings ?? {}; setForm({ name: body.data?.name ?? "", slug: body.data?.slug ?? "", timezone: settings.timezone ?? "Asia/Jakarta", currency: settings.currency ?? "IDR" }); }); }, []);

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setMessage(null);
    const response = await fetch("/api/settings/organization", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    setMessage(response.ok ? "Pengaturan tersimpan." : "Pengaturan gagal disimpan."); setSaving(false);
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

      {/* General Settings Content */}
      <div className="max-w-2xl">
        <div className="rounded-[14px] bg-white p-5 shadow-[0_2px_12px_rgba(0,0,0,.06)]">
          <h2 className="text-[15px] font-semibold text-[#18201f] mb-4">
            Informasi Organisasi
          </h2>

          <form onSubmit={save} className="space-y-4">
            <div>
              <label className="block text-[12px] font-medium text-[#8b9492] mb-1">
                Nama Organisasi
              </label>
              <input className="w-full rounded-lg border border-slate-200 px-3 py-2 text-[13px] text-[#18201f]" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required />
            </div>

            <div>
              <label className="block text-[12px] font-medium text-[#8b9492] mb-1">
                Slug
              </label>
              <input className="w-full rounded-lg border border-slate-200 px-3 py-2 text-[13px] text-[#18201f]" value={form.slug} onChange={(event) => setForm({ ...form, slug: event.target.value })} required />
            </div>

            <div>
              <label className="block text-[12px] font-medium text-[#8b9492] mb-1">
                Timezone
              </label>
              <input className="w-full rounded-lg border border-slate-200 px-3 py-2 text-[13px] text-[#18201f]" value={form.timezone} onChange={(event) => setForm({ ...form, timezone: event.target.value })} required />
            </div>
            <div><label className="block text-[12px] font-medium text-[#8b9492] mb-1">Mata uang</label><input className="w-full rounded-lg border border-slate-200 px-3 py-2 text-[13px] text-[#18201f]" value={form.currency} onChange={(event) => setForm({ ...form, currency: event.target.value.toUpperCase() })} required /></div>
            <button disabled={saving} className="inline-flex items-center gap-2 rounded-lg bg-orange-500 px-3 py-2 text-xs font-semibold text-white hover:bg-orange-600">{saving && <Loader2 className="size-3.5 animate-spin" />}Simpan perubahan</button>
            {message && <p className="text-xs text-emerald-600">{message}</p>}
          </form>

          <p className="mt-4 text-[11px] text-[#8b9492]">
            Perubahan nama dan konfigurasi berlaku untuk seluruh workspace.
          </p>
        </div>
      </div>
    </main>
  );
}
