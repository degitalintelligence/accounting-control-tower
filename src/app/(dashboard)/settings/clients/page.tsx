"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Archive, Building2, CheckCircle2, Info, Loader2, Pencil, Plus, Search, Settings2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { notifyClientsUpdated, type ClientOption } from "@/hooks/use-clients";
import { usePathname } from "next/navigation";
import { settingsTabs } from "@/lib/navigation";
import { useI18n } from "@/components/i18n-provider";

type Client = ClientOption & { timezone: string; created_at: string; updated_at: string; deleted_at: string | null };
const emptyForm = { name: "", timezone: "Asia/Jakarta" };

export default function ClientsPage() {
  const pathname = usePathname();
  const { t } = useI18n();
  const [clients, setClients] = useState<Client[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<Client | null>(null);
  const [archiveReason, setArchiveReason] = useState("");
  const [archiving, setArchiving] = useState(false);

  async function loadClients() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/clients", { cache: "no-store" });
      const body = (await response.json().catch(() => null)) as { data?: Client[]; error?: string } | null;
      if (!response.ok) throw new Error(body?.error ?? "Daftar client belum dapat dimuat.");
      setClients(body?.data ?? []);
      setSelectedId((current) => current && body?.data?.some((client) => client.id === current) ? current : body?.data?.[0]?.id ?? null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Daftar client belum dapat dimuat.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void loadClients(); }, []);

  const filteredClients = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return clients;
    return clients.filter((client) => `${client.name} ${client.slug} ${client.timezone}`.toLowerCase().includes(query));
  }, [clients, search]);
  const selectedClient = clients.find((client) => client.id === selectedId) ?? null;

  function startCreate() {
    setEditingId(null);
    setForm(emptyForm);
    setError(null);
  }

  function startEdit(client: Client) {
    setSelectedId(client.id);
    setEditingId(client.id);
    setForm({ name: client.name, timezone: client.timezone });
    setError(null);
  }

  async function saveClient(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(editingId ? `/api/clients/${editingId}` : "/api/clients", { method: editingId ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const body = (await response.json().catch(() => null)) as { data?: Client; error?: string } | null;
      if (!response.ok) throw new Error(body?.error ?? "Gagal menyimpan client.");
      await loadClients();
      if (body?.data?.id) setSelectedId(body.data.id);
      startCreate();
      notifyClientsUpdated();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Gagal menyimpan client.");
    } finally {
      setSaving(false);
    }
  }

  async function archiveClient() {
    if (!archiveTarget || !archiveReason.trim()) return;
    setArchiving(true);
    setError(null);
    try {
      const response = await fetch(`/api/clients/${archiveTarget.id}`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason: archiveReason.trim() }) });
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) throw new Error(body?.error ?? "Gagal mengarsipkan client.");
      setArchiveTarget(null);
      setArchiveReason("");
      await loadClients();
      notifyClientsUpdated();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Gagal mengarsipkan client.");
    } finally {
      setArchiving(false);
    }
  }

  return (
    <main className="page-canvas text-slate-900">
      <div className="mx-auto w-full max-w-6xl space-y-6">
        <header>
          <div className="flex items-center gap-2 text-xs font-semibold text-blue-600"><Settings2 className="size-4" /> Pusat Pengaturan <span className="text-slate-400">/</span> Client</div>
          <div className="mt-3 flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><h1 className="text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">Client workspace</h1><p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500">Kelola daftar client, timezone operasional, dan status akses dalam satu tempat.</p></div><Button onClick={startCreate} className="cta-primary"><Plus className="size-4" />Tambah client</Button></div>
        </header>
        <div className="flex gap-2 overflow-x-auto border-b border-slate-200 pb-2">{settingsTabs.map((tab) => { const active = tab.href === "/settings" ? pathname === tab.href : pathname.startsWith(tab.href); return <Link key={tab.href} href={tab.href} className={cn("flex shrink-0 items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-semibold", active ? "bg-blue-600 text-white shadow-sm" : "text-slate-600 hover:bg-slate-100")}><tab.icon className="size-4" />{t(tab.labelKey as never)}</Link>; })}</div>
        {error && <div className="flex items-center justify-between rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"><span>{error}</span><Button variant="ghost" size="icon-sm" onClick={() => setError(null)} aria-label="Tutup pesan"><X /></Button></div>}
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
          <section className="surface-card overflow-hidden rounded-2xl">
            <div className="border-b border-slate-100 px-5 py-4"><div className="flex items-center justify-between gap-3"><div><h2 className="text-lg font-bold text-slate-950">Daftar client</h2><p className="text-sm text-slate-500">{clients.length} client aktif</p></div><Badge variant="secondary" className="hidden sm:inline-flex">Data tersimpan aman</Badge></div><div className="relative mt-4"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" /><Input value={search} onChange={(event) => setSearch(event.target.value)} className="pl-9" placeholder="Cari nama, slug, atau timezone..." /></div></div>
            <div className="divide-y divide-slate-100">
              {loading ? <div className="flex items-center gap-2 px-5 py-10 text-sm text-slate-500"><Loader2 className="size-4 animate-spin" />Memuat daftar client...</div> : filteredClients.length === 0 ? <div className="px-5 py-12 text-center"><Building2 className="mx-auto size-10 text-slate-300" /><h3 className="mt-3 font-semibold text-slate-800">{clients.length ? "Client tidak ditemukan" : "Belum ada client"}</h3><p className="mt-1 text-sm text-slate-500">{clients.length ? "Coba ubah kata kunci pencarian." : "Tambahkan client pertama untuk mulai mengelola pekerjaan."}</p>{!clients.length && <Button onClick={startCreate} className="cta-primary mt-4"><Plus className="size-4" />Tambah client</Button>}</div> : filteredClients.map((client) => <button type="button" key={client.id} onClick={() => setSelectedId(client.id)} className={cn("flex w-full items-center gap-3 px-5 py-4 text-left transition hover:bg-slate-50", selectedId === client.id && "bg-blue-50/60")}><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-blue-50 text-blue-600"><Building2 className="size-5" /></span><span className="min-w-0 flex-1"><strong className="block truncate text-sm font-semibold text-slate-900">{client.name}</strong><span className="mt-1 block truncate text-xs text-slate-500">{client.slug} · {client.timezone}</span></span><Badge variant="outline" className="hidden sm:inline-flex"><CheckCircle2 className="size-3 text-emerald-500" />Aktif</Badge><Button type="button" variant="ghost" size="icon-sm" onClick={(event) => { event.stopPropagation(); startEdit(client); }} aria-label={`Edit ${client.name}`}><Pencil /></Button></button>)}
            </div>
          </section>
          <aside className="space-y-6">
            <section className="surface-card rounded-2xl p-5 sm:p-6"><div className="flex items-center justify-between gap-3"><div><h2 className="text-lg font-bold text-slate-950">{editingId ? "Edit client" : "Tambah client"}</h2><p className="mt-1 text-sm text-slate-500">Nama dan timezone dipakai sebagai konteks operasional.</p></div>{editingId && <Button variant="ghost" size="icon-sm" onClick={startCreate} aria-label="Batalkan edit"><X /></Button>}</div><form className="mt-5 space-y-4" onSubmit={saveClient}><div className="space-y-1.5"><Label htmlFor="client-name">Nama client</Label><Input id="client-name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Contoh: PT Maju Jaya" required /></div><p className="text-xs text-slate-500">Slug dibuat otomatis dari nama dan tidak perlu diisi manual.</p><div className="space-y-1.5"><Label htmlFor="client-timezone">Timezone IANA</Label><Input id="client-timezone" value={form.timezone} onChange={(event) => setForm({ ...form, timezone: event.target.value })} placeholder="Asia/Jakarta" required /><p className="text-xs text-slate-500">Gunakan format IANA, misalnya Asia/Jakarta atau Asia/Singapore.</p></div><div className="flex gap-2 pt-1"><Button type="submit" disabled={saving} className="cta-primary">{saving && <Loader2 className="animate-spin" />}{editingId ? "Simpan perubahan" : "Buat client"}</Button>{editingId && <Button type="button" variant="outline" onClick={startCreate}>Batal</Button>}</div></form></section>
            {selectedClient ? <section className="surface-card rounded-2xl p-5 sm:p-6"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wide text-blue-600">Ringkasan client</p><h2 className="mt-1 text-lg font-bold text-slate-950">{selectedClient.name}</h2></div><Button variant="ghost" size="icon-sm" onClick={() => setArchiveTarget(selectedClient)} aria-label={`Arsipkan ${selectedClient.name}`}><Archive className="text-red-500" /></Button></div><dl className="mt-5 space-y-3 text-sm"><div className="flex justify-between gap-4"><dt className="text-slate-500">Status</dt><dd className="font-medium text-emerald-600">Aktif</dd></div><div className="flex justify-between gap-4"><dt className="text-slate-500">Timezone</dt><dd className="font-medium text-slate-800">{selectedClient.timezone}</dd></div><div className="flex justify-between gap-4"><dt className="text-slate-500">Slug</dt><dd className="max-w-[190px] truncate font-medium text-slate-800">{selectedClient.slug}</dd></div><div className="flex justify-between gap-4"><dt className="text-slate-500">Dibuat</dt><dd className="font-medium text-slate-800">{new Intl.DateTimeFormat("id-ID", { dateStyle: "medium" }).format(new Date(selectedClient.created_at))}</dd></div></dl><Button variant="outline" className="mt-5 w-full" onClick={() => startEdit(selectedClient)}><Pencil className="size-4" />Edit detail</Button></section> : <section className="surface-card rounded-2xl p-5"><Info className="size-5 text-blue-600" /><p className="mt-2 text-sm leading-6 text-slate-500">Pilih client untuk melihat detail ringkas dan aksi pengelolaan.</p></section>}
          </aside>
        </div>
      </div>
      <Dialog open={Boolean(archiveTarget)} onOpenChange={(open) => { if (!open && !archiving) { setArchiveTarget(null); setArchiveReason(""); } }}><DialogContent><DialogHeader><DialogTitle>Arsipkan client?</DialogTitle><DialogDescription>{archiveTarget?.name} tidak akan muncul di daftar aktif. Data historis tidak dihapus. Tindakan ini dicatat dalam audit log.</DialogDescription></DialogHeader><div className="space-y-1.5"><Label htmlFor="archive-reason">Alasan pengarsipan <span className="text-red-500">*</span></Label><textarea id="archive-reason" rows={4} value={archiveReason} onChange={(event) => setArchiveReason(event.target.value)} placeholder="Jelaskan alasan pengarsipan..." className="w-full rounded-lg border border-slate-200 p-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" /></div><DialogFooter><Button variant="outline" disabled={archiving} onClick={() => setArchiveTarget(null)}>Batal</Button><Button variant="destructive" disabled={archiving || !archiveReason.trim()} onClick={() => void archiveClient()}>{archiving && <Loader2 className="animate-spin" />}Arsipkan client</Button></DialogFooter></DialogContent></Dialog>
    </main>
  );
}
