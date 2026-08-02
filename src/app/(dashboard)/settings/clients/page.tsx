"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Building2, Info, Loader2, Pencil, Plus, Settings2, Archive } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { notifyClientsUpdated, type ClientOption } from "@/hooks/use-clients";
import { usePathname } from "next/navigation";
import { settingsTabs } from "@/lib/navigation";

type Client = ClientOption & {
  timezone: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

const emptyForm = { name: "", timezone: "Asia/Jakarta" };

export default function ClientsPage() {
  const pathname = usePathname();
  const [clients, setClients] = useState<Client[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadClients() {
    setLoading(true);
    try { const response = await fetch("/api/clients?include=details", { cache: "no-store" }); const body = (await response.json().catch(() => null)) as { data?: Client[]; error?: string } | null; if (!response.ok) throw new Error(body?.error ?? "Daftar client belum dapat dimuat."); setClients(body?.data ?? []); } catch (cause) { setError(cause instanceof Error ? cause.message : "Daftar client belum dapat dimuat."); } finally { setLoading(false); }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => void loadClients(), 0);
    return () => window.clearTimeout(timer);
  }, []);

  function startCreate() {
    setEditingId(null);
    setForm(emptyForm);
    setError(null);
  }

  function startEdit(client: Client) {
    setEditingId(client.id);
    setForm({ name: client.name, timezone: client.timezone });
    setError(null);
  }

  async function saveClient(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try { const response = await fetch(editingId ? `/api/clients/${editingId}` : "/api/clients", {
      method: editingId ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    if (!response.ok) {
      setError(body?.error ?? "Perubahan client gagal disimpan.");
      setSaving(false);
      return;
    }
    startCreate();
    await loadClients();
    notifyClientsUpdated();
    setSaving(false); } catch (cause) { setError(cause instanceof Error ? cause.message : "Perubahan client gagal disimpan."); setSaving(false); }
  }

  async function archiveClient(client: Client) {
    if (!window.confirm(`Arsipkan client ${client.name}?`)) return;
    const response = await fetch(`/api/clients/${client.id}`, { method: "DELETE" });
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    if (!response.ok) {
      setError(body?.error ?? "Client gagal diarsipkan.");
      return;
    }
    await loadClients();
    notifyClientsUpdated();
  }

  return (
    <main className="page-canvas text-slate-900"><div className="mx-auto w-full max-w-6xl space-y-6"><header><div className="flex items-center gap-2 text-xs font-semibold text-blue-600"><Settings2 className="size-4" /> Control Center <span className="text-slate-400">/</span> Pengaturan</div><h1 className="mt-3 text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">Klien workspace</h1><p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500">Kelola scope klien yang digunakan untuk pekerjaan, laporan, dan kontrol operasional.</p></header>
      <div className="flex gap-2 overflow-x-auto border-b border-slate-200 pb-2">
        {settingsTabs.map((tab) => {
          const active = tab.href === "/settings" ? pathname === tab.href : pathname.startsWith(tab.href);
          return <Link key={tab.href} href={tab.href} className={cn("flex shrink-0 items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-semibold", active ? "bg-blue-600 text-white shadow-sm" : "text-slate-600 hover:bg-slate-100") }><tab.icon className="size-4" />{tab.label}</Link>;
        })}
      </div>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]"><section className="surface-card overflow-hidden rounded-2xl">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
            <div><h2 className="text-lg font-bold text-slate-950">Klien aktif</h2><p className="text-sm text-slate-500">{clients.length} klien terdaftar</p></div>
            <Button onClick={startCreate} className="cta-primary"><Plus className="size-4" />Tambah klien</Button>
          </div>
          {error && <p className="border-b border-red-100 bg-red-50 px-5 py-3 text-[12px] text-red-600">{error}</p>}
          <div className="divide-y divide-slate-100">
            {loading ? <div className="flex items-center gap-2 px-5 py-8 text-[13px] text-slate-500"><Loader2 className="size-4 animate-spin" />Memuat client...</div> : clients.length === 0 ? <div className="px-5 py-10 text-center text-[13px] text-[#8b9492]">Belum ada client aktif.</div> : clients.map((client) => <div key={client.id} className="flex items-center gap-3 px-5 py-4"><span className="grid size-9 shrink-0 place-items-center rounded-lg bg-blue-50 text-blue-600"><Building2 className="size-4" /></span><div className="min-w-0 flex-1"><strong className="block truncate text-[13px] font-medium text-[#18201f]">{client.name}</strong><span className="block truncate text-[11px] text-[#8b9492]">{client.slug} · {client.timezone}</span></div><Tooltip><TooltipTrigger render={<Button variant="ghost" size="icon-sm" onClick={() => startEdit(client)} aria-label={`Edit ${client.name}`} />}><Pencil /></TooltipTrigger><TooltipContent>Edit client</TooltipContent></Tooltip><Tooltip><TooltipTrigger render={<Button variant="ghost" size="icon-sm" onClick={() => void archiveClient(client)} aria-label={`Arsipkan ${client.name}`} />}><Archive className="text-red-500" /></TooltipTrigger><TooltipContent>Arsipkan client</TooltipContent></Tooltip></div>) }
          </div>
        </section>
        <section className="surface-card rounded-2xl p-5 sm:p-6">
          <h2 className="mb-1 text-lg font-bold text-slate-950">{editingId ? "Edit klien" : "Tambah klien"}</h2>
          <p className="mb-5 text-sm text-slate-500">Klien menjadi scope pekerjaan, laporan, dan kontrol operasional.</p>
          <form className="space-y-4" onSubmit={saveClient}>
            <label className="block text-sm font-semibold text-slate-700">Nama klien<Input className="mt-1.5" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Contoh: PT Maju Jaya" required /></label>
            <p className="text-xs text-slate-500">Slug dibuat otomatis dari nama klien dan aman terhadap konflik.</p>
            <label className="block text-sm font-semibold text-slate-700">Timezone<Input className="mt-1.5" value={form.timezone} onChange={(event) => setForm({ ...form, timezone: event.target.value })} required /></label>
            <div className="flex gap-2 pt-1"><Button type="submit" disabled={saving} className="cta-primary">{saving && <Loader2 className="animate-spin" />}{editingId ? "Simpan perubahan" : "Buat klien"}</Button>{editingId && <Button type="button" variant="outline" onClick={startCreate}>Batal</Button>}</div>
          </form>
        </section>
        <aside className="surface-card h-fit rounded-2xl p-5"><div className="flex items-center gap-2"><Info className="size-5 text-blue-600" /><h3 className="font-bold text-slate-950">Scope klien</h3></div><p className="mt-2 text-sm leading-6 text-slate-500">Setiap klien menjadi batas data untuk pekerjaan, laporan, dan kontrol yang dikelola tim.</p></aside>
      </div>
    </div></main>
  );
}
