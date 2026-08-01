"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Building2, Loader2, Pencil, Plus, Settings, Users, Archive } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { notifyClientsUpdated, type ClientOption } from "@/hooks/use-clients";
import { usePathname } from "next/navigation";

type Client = ClientOption & {
  timezone: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

const tabs = [
  { label: "General", href: "/settings", icon: Settings },
  { label: "Members", href: "/settings/members", icon: Users },
  { label: "Clients", href: "/settings/clients", icon: Building2 },
];

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
    const response = await fetch("/api/clients?include=details", { cache: "no-store" });
    const body = (await response.json().catch(() => null)) as { data?: Client[]; error?: string } | null;
    if (response.ok) setClients(body?.data ?? []);
    else setError(body?.error ?? "Daftar client belum dapat dimuat.");
    setLoading(false);
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
    const response = await fetch(editingId ? `/api/clients/${editingId}` : "/api/clients", {
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
    setSaving(false);
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
    <main className="min-h-screen flex-1 bg-[#f3f5f2] p-6">
      <div className="mb-6">
        <h1 className="text-[20px] font-semibold text-[#18201f]">Settings</h1>
        <p className="mt-0.5 text-[13px] text-[#8b9492]">Kelola pengaturan organisasi Anda</p>
      </div>
      <div className="mb-6 flex gap-1 overflow-x-auto border-b border-slate-200">
        {tabs.map((tab) => {
          const active = tab.href === "/settings" ? pathname === tab.href : pathname.startsWith(tab.href);
          return <Link key={tab.href} href={tab.href} className={cn("flex items-center gap-1.5 whitespace-nowrap border-b-2 px-4 py-2.5 text-[13px] font-medium", active ? "border-[#18201f] text-[#18201f]" : "border-transparent text-[#8b9492] hover:text-[#18201f]")}><tab.icon className="size-3.5" />{tab.label}</Link>;
        })}
      </div>
      <div className="grid max-w-5xl gap-5 xl:grid-cols-[1fr_340px]">
        <section className="overflow-hidden rounded-[14px] bg-white shadow-[0_2px_12px_rgba(0,0,0,.06)]">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
            <div><h2 className="text-[15px] font-semibold text-[#18201f]">Client aktif</h2><p className="text-[11px] text-[#8b9492]">{clients.length} client terdaftar</p></div>
            <Button onClick={startCreate} className="bg-orange-500 text-white hover:bg-orange-600"><Plus />Tambah client</Button>
          </div>
          {error && <p className="border-b border-red-100 bg-red-50 px-5 py-3 text-[12px] text-red-600">{error}</p>}
          <div className="divide-y divide-slate-100">
            {loading ? <div className="flex items-center gap-2 px-5 py-8 text-[13px] text-slate-500"><Loader2 className="size-4 animate-spin" />Memuat client...</div> : clients.length === 0 ? <div className="px-5 py-10 text-center text-[13px] text-[#8b9492]">Belum ada client aktif.</div> : clients.map((client) => <div key={client.id} className="flex items-center gap-3 px-5 py-4"><span className="grid size-9 shrink-0 place-items-center rounded-lg bg-blue-50 text-blue-600"><Building2 className="size-4" /></span><div className="min-w-0 flex-1"><strong className="block truncate text-[13px] font-medium text-[#18201f]">{client.name}</strong><span className="block truncate text-[11px] text-[#8b9492]">{client.slug} · {client.timezone}</span></div><Tooltip><TooltipTrigger render={<Button variant="ghost" size="icon-sm" onClick={() => startEdit(client)} aria-label={`Edit ${client.name}`} />}><Pencil /></TooltipTrigger><TooltipContent>Edit client</TooltipContent></Tooltip><Tooltip><TooltipTrigger render={<Button variant="ghost" size="icon-sm" onClick={() => void archiveClient(client)} aria-label={`Arsipkan ${client.name}`} />}><Archive className="text-red-500" /></TooltipTrigger><TooltipContent>Arsipkan client</TooltipContent></Tooltip></div>) }
          </div>
        </section>
        <section className="rounded-[14px] bg-white p-5 shadow-[0_2px_12px_rgba(0,0,0,.06)]">
          <h2 className="mb-1 text-[15px] font-semibold text-[#18201f]">{editingId ? "Edit client" : "Tambah client"}</h2>
          <p className="mb-4 text-[11px] text-[#8b9492]">Client menjadi scope pekerjaan, laporan, dan kontrol operasional.</p>
          <form className="space-y-4" onSubmit={saveClient}>
            <label className="block text-[12px] font-medium text-[#18201f]">Nama client<Input className="mt-1.5" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Contoh: PT Maju Jaya" required /></label>
            <p className="text-[11px] text-[#8b9492]">Slug dibuat otomatis dari nama client dan tetap aman terhadap konflik.</p>
            <label className="block text-[12px] font-medium text-[#18201f]">Timezone<Input className="mt-1.5" value={form.timezone} onChange={(event) => setForm({ ...form, timezone: event.target.value })} required /></label>
            <div className="flex gap-2 pt-1"><Button type="submit" disabled={saving} className="bg-orange-500 text-white hover:bg-orange-600">{saving && <Loader2 className="animate-spin" />}{editingId ? "Simpan perubahan" : "Buat client"}</Button>{editingId && <Button type="button" variant="outline" onClick={startCreate}>Batal</Button>}</div>
          </form>
        </section>
      </div>
    </main>
  );
}
