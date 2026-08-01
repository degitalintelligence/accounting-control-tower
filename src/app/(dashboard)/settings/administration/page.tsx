"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";
import { Input } from "@/components/ui/input";

type Policy = { id: string; name: string; description: string | null; client_id: string | null; rules: unknown; is_active: boolean };
type Connection = { id: string; provider: string; session_id: string | null; status: string; last_health_check_at: string | null };
type WhatsAppData = { connections: Connection[]; groups: { id: string; connection_id: string; provider_group_id: string; group_name: string | null; is_active: boolean }[]; mappings: { id: string; wa_group_id: string; provider_participant_id: string; display_name: string | null; profile_id: string | null; is_verified: boolean }[] };
type AuditData = { samples: { id: string; work_item_id: string; rating: string | null; notes: string | null; sampled_at: string }[]; findings: { id: string; audit_sample_id: string; finding_type: string; severity: string; description: string; status: string }[] };
type DeadLetter = { id: string; event_type: string; error_message: string | null; retry_count: number; created_at: string };
type JobHealth = { name: string; status: string; pending: number; processing: number; failed: number; last_activity_at: string | null };

export default function AdministrationPage() {
  const [tab, setTab] = useState("whatsapp");
  const [wa, setWa] = useState<WhatsAppData>({ connections: [], groups: [], mappings: [] });
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [aiPolicies, setAiPolicies] = useState<Policy[]>([]);
  const [audits, setAudits] = useState<AuditData>({ samples: [], findings: [] });
  const [deadLetters, setDeadLetters] = useState<DeadLetter[]>([]);
  const [jobHealth, setJobHealth] = useState<JobHealth[]>([]);
  const [name, setName] = useState("");
  const [session, setSession] = useState("");
  const [message, setMessage] = useState("");
  const [qrUrl] = useState<string | null>(null);
  const [sampling, setSampling] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [partialFailures, setPartialFailures] = useState<string[]>([]);

  async function load() {
    setLoading(true); setLoadError(null); setPartialFailures([]);
    const responses = await Promise.allSettled([fetch("/api/admin/whatsapp"), fetch("/api/admin/escalations"), fetch("/api/admin/audits"), fetch("/api/admin/dead-letters"), fetch("/api/admin/job-health"), fetch("/api/admin/ai-policies")]);
    const names = ["WhatsApp", "eskalasi", "audit", "antrean gagal", "kesehatan pekerjaan", "kebijakan AI"];
    const failed = responses.flatMap((result, index) => result.status === "rejected" || (result.value && !result.value.ok) ? [names[index]] : []);
    setPartialFailures(failed);
    if (failed.length === responses.length) setLoadError("Data administrasi belum dapat dimuat.");
    const body = await Promise.all(responses.map(async (result) => result.status === "fulfilled" && result.value.ok ? result.value.json() : null));
    if (body[0]) setWa(body[0]);
    if (body[1]) setPolicies(body[1]);
    if (body[2]) setAudits(body[2]);
    if (body[3]) setDeadLetters(body[3]);
    if (body[4]) setJobHealth(body[4].workers ?? []);
    if (body[5]) setAiPolicies(body[5]);
    setLoading(false);
  }

  useEffect(() => { const timer = window.setTimeout(() => { void load(); }, 0); return () => window.clearTimeout(timer); }, []);

  useEffect(() => () => { if (qrUrl) URL.revokeObjectURL(qrUrl); }, [qrUrl]);

  async function createConnection() {
    const response = await fetch("/api/admin/whatsapp", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "connection", session_id: session, status: "disconnected" }) });
    setMessage(response.ok ? "Connection tersimpan." : "Connection gagal disimpan.");
    if (response.ok) { setSession(""); await load(); }
  }

  async function retireConnection(id: string) {
    const confirmed = window.confirm("Retire koneksi ini? Semua grup terkait akan dinonaktifkan dan koneksi tidak dapat diaktifkan kembali.");
    if (!confirmed) return;
    const response = await fetch("/api/admin/whatsapp", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "retire", id }) });
    const body = await response.json().catch(() => null) as { error?: string } | null;
    setMessage(response.ok ? "Connection retired dan grup terkait dinonaktifkan." : body?.error ?? "Connection gagal di-retire.");
    if (response.ok) await load();
  }

  async function createPolicy() {
    const response = await fetch("/api/admin/escalations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, rules: [] }) });
    setMessage(response.ok ? "Policy tersimpan." : "Policy gagal disimpan.");
    if (response.ok) { setName(""); await load(); }
  }

  async function createAiPolicy() {
    const response = await fetch("/api/admin/ai-policies", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, require_human_confirmation: true, allow_sensitive_data: false, no_training_required: true }) });
    setMessage(response.ok ? "AI policy tersimpan." : "AI policy gagal disimpan.");
    if (response.ok) { setName(""); await load(); }
  }

  async function updateFinding(id: string, status: string) {
    const response = await fetch("/api/admin/audits", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "update_finding", id, status, resolution: status === "closed" ? "Ditutup oleh administrator." : null }) });
    setMessage(response.ok ? "Lifecycle finding diperbarui." : "Lifecycle finding gagal diperbarui.");
    if (response.ok) await load();
  }

  async function retry(id: string) {
    const response = await fetch("/api/admin/dead-letters", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
    setMessage(response.ok ? "Retry dicatat." : "Retry gagal.");
    if (response.ok) await load();
  }

  async function autoSample() {
    setSampling(true);
    const response = await fetch("/api/admin/audits", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "auto_sample" }) });
    const body = await response.json().catch(() => null) as { inserted?: number } | null;
    setSampling(false);
    setMessage(response.ok ? `${body?.inserted ?? 0} audit sample otomatis dibuat.` : "Sampling otomatis gagal.");
    if (response.ok) await load();
  }

  return <main className="page-canvas min-w-0 text-slate-900"><div className="mb-6"><h1 className="text-2xl font-bold">Administrasi Operasional</h1><p className="text-sm text-slate-500">Kelola integrasi, kebijakan AI, audit, antrean gagal, dan kesehatan pekerjaan.</p></div><div role="tablist" aria-label="Bagian administrasi" className="mb-6 flex max-w-full gap-2 overflow-x-auto pb-1">{[["whatsapp", "WhatsApp"], ["escalation", "Kebijakan eskalasi"], ["ai", "Kebijakan AI"], ["audit", "Pengambilan sampel audit"], ["dead", "Antrean gagal"], ["health", "Kesehatan pekerjaan"]].map(([value, label]) => <Button key={value} role="tab" aria-selected={tab === value} variant={tab === value ? "default" : "outline"} onClick={() => setTab(value)}>{label}</Button>)}</div>{loadError && <div role="alert" className="mb-4 flex flex-col gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 sm:flex-row sm:items-center sm:justify-between"><span>{loadError}</span><Button type="button" variant="outline" onClick={() => void load()} className="w-fit gap-2 border-red-200 bg-white text-red-700"><RefreshCw className="size-4" />Coba lagi</Button></div>}{partialFailures.length > 0 && !loadError && <p role="status" className="mb-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">Sebagian data belum tersedia: {partialFailures.join(", ")}.</p>}{message && <p role="status" className="mb-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700">{message}</p>}{loading ? <Panel title="Memuat administrasi"><p className="text-sm text-slate-500">Mengambil data terbaru…</p></Panel> : <>{tab === "whatsapp" && <section className="grid gap-5 lg:grid-cols-3"><Panel title="Koneksi"><Input aria-label="ID sesi WAHA" placeholder="ID sesi WAHA" value={session} onChange={(event) => setSession(event.target.value)} /><Button className="mt-3" onClick={createConnection}>Simpan koneksi</Button><List items={wa.connections.map((item) => `${item.provider} · ${item.session_id ? "ID sesi terdaftar" : "tanpa sesi"} · ${item.status}`)} actions={wa.connections.map((item) => item.status !== "retired" ? <Button key={item.id} size="sm" variant="outline" onClick={() => void retireConnection(item.id)}>Retire</Button> : null)} /></Panel><Panel title="Pindai QR & kesehatan"><div className="flex min-h-64 items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50 p-4">{qrUrl ? <Image src={qrUrl} alt="QR WhatsApp untuk dipindai" width={224} height={224} unoptimized /> : <p className="text-center text-sm text-slate-500">Pilih koneksi lalu tampilkan QR.</p>}</div></Panel><Panel title="Grup whitelist"><p className="text-sm text-slate-500">{wa.groups.length} grup terdaftar, {wa.groups.filter((item) => item.is_active).length} aktif.</p><List items={wa.groups.map((item) => `${item.group_name || "Grup tanpa nama"} · ${item.is_active ? "aktif" : "nonaktif"}`)} /></Panel></section>}{tab === "escalation" && <Panel title="Kebijakan eskalasi"><div className="flex flex-col gap-2 sm:flex-row"><Input aria-label="Nama kebijakan eskalasi" placeholder="Nama kebijakan" value={name} onChange={(event) => setName(event.target.value)} /><Button onClick={createPolicy}>Tambah</Button></div><List items={policies.map((item) => `${item.name} · ${item.is_active ? "aktif" : "nonaktif"}`)} /></Panel>}{tab === "ai" && <Panel title="Kebijakan AI"><div className="flex flex-col gap-2 sm:flex-row"><Input aria-label="Nama kebijakan AI" placeholder="Nama kebijakan AI" value={name} onChange={(event) => setName(event.target.value)} /><Button onClick={createAiPolicy}>Tambah</Button></div><p className="mt-3 text-sm text-slate-500">Konfirmasi manusia wajib, data sensitif dilarang, dan pelatihan model eksternal dinonaktifkan sebagai default.</p><List items={aiPolicies.map((item) => `${item.name} · ${item.client_id ? "berlaku untuk klien" : "berlaku untuk organisasi"} · ${item.is_active ? "aktif" : "nonaktif"}`)} /></Panel>}{tab === "audit" && <Panel title="Sampel audit & temuan"><div className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-slate-500">{audits.samples.length} sampel dan {audits.findings.length} temuan tercatat.</p><Button size="sm" onClick={autoSample} disabled={sampling}>{sampling ? "Memproses…" : "Ambil sampel otomatis"}</Button></div><List items={audits.samples.map((item) => `Item kerja tersamarkan · ${item.rating || "belum dinilai"} · ${new Date(item.sampled_at).toLocaleDateString("id-ID")}`)} /><h3 className="mt-5 font-semibold">Temuan terbaru</h3><List items={audits.findings.map((item) => `${item.severity} · ${item.finding_type} · ${item.status}`)} actions={audits.findings.map((item) => item.status !== "closed" ? <Button key={item.id} size="sm" variant="outline" onClick={() => updateFinding(item.id, "closed")}>Tutup</Button> : null)} /></Panel>}{tab === "dead" && <Panel title="Antrean gagal"><List items={deadLetters.map((item) => `${item.event_type} · percobaan ${item.retry_count} · detail disembunyikan`)} actions={deadLetters.map((item) => <Button key={item.id} size="sm" variant="outline" onClick={() => retry(item.id)}>Coba ulang</Button>)}/></Panel>}{tab === "health" && <Panel title="Kesehatan pekerjaan"><List items={jobHealth.map((item) => `${item.name} · ${item.status} · antrean ${item.pending} · diproses ${item.processing} · gagal ${item.failed}`)} /></Panel>}</>}</main>;
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) { return <div className="rounded-xl bg-white p-5 shadow-sm"><h2 className="mb-4 text-base font-semibold">{title}</h2>{children}</div>; }
function List({ items, actions }: { items: string[]; actions?: React.ReactNode[] }) { return <div className="mt-4 divide-y divide-slate-100">{items.length ? items.map((item, index) => <div key={`${item}-${index}`} className="flex items-center justify-between gap-3 py-3 text-sm"><span>{item}</span>{actions?.[index]}</div>) : <p className="py-3 text-sm text-slate-500">Belum ada data.</p>}</div>; }
