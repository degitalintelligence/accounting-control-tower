"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Policy = { id: string; name: string; description: string | null; client_id: string | null; rules: unknown; is_active: boolean };
type WhatsAppData = { connections: { id: string; provider: string; session_id: string | null; status: string; last_health_check_at: string | null }[]; groups: { id: string; connection_id: string; provider_group_id: string; group_name: string | null; is_active: boolean }[]; mappings: { id: string; wa_group_id: string; provider_participant_id: string; display_name: string | null; profile_id: string | null; is_verified: boolean }[] };
type AuditData = { samples: { id: string; work_item_id: string; rating: string | null; notes: string | null; sampled_at: string }[]; findings: { id: string; audit_sample_id: string; finding_type: string; severity: string; description: string }[] };
type DeadLetter = { id: string; event_type: string; error_message: string | null; retry_count: number; created_at: string };

export default function AdministrationPage() {
  const [tab, setTab] = useState("whatsapp");
  const [wa, setWa] = useState<WhatsAppData>({ connections: [], groups: [], mappings: [] });
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [audits, setAudits] = useState<AuditData>({ samples: [], findings: [] });
  const [deadLetters, setDeadLetters] = useState<DeadLetter[]>([]);
  const [name, setName] = useState("");
  const [session, setSession] = useState("");
  const [message, setMessage] = useState("");

  async function load() {
    const [waResponse, policyResponse, auditResponse, deadResponse] = await Promise.all([fetch("/api/admin/whatsapp"), fetch("/api/admin/escalations"), fetch("/api/admin/audits"), fetch("/api/admin/dead-letters")]);
    if (waResponse.ok) setWa(await waResponse.json());
    if (policyResponse.ok) setPolicies(await policyResponse.json());
    if (auditResponse.ok) setAudits(await auditResponse.json());
    if (deadResponse.ok) setDeadLetters(await deadResponse.json());
  }

  useEffect(() => { void Promise.resolve().then(load); }, []);

  async function createConnection() {
    const response = await fetch("/api/admin/whatsapp", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "connection", session_id: session, status: "connected" }) });
    setMessage(response.ok ? "Connection tersimpan." : "Connection gagal disimpan.");
    if (response.ok) { setSession(""); await load(); }
  }

  async function createPolicy() {
    const response = await fetch("/api/admin/escalations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, rules: [] }) });
    setMessage(response.ok ? "Policy tersimpan." : "Policy gagal disimpan.");
    if (response.ok) { setName(""); await load(); }
  }

  async function retry(id: string) {
    const response = await fetch("/api/admin/dead-letters", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
    setMessage(response.ok ? "Retry dicatat." : "Retry gagal.");
    if (response.ok) await load();
  }

  return <main className="page-canvas text-slate-900"><div className="mb-6"><h1 className="text-2xl font-bold">Administrasi Operasional</h1><p className="text-sm text-slate-500">Kelola integrasi, kontrol eskalasi, audit sampling, dan event gagal.</p></div><div className="mb-6 flex flex-wrap gap-2">{[["whatsapp", "WhatsApp"], ["escalation", "Escalation policy"], ["audit", "Audit sampling"], ["dead", "Dead-letter"]].map(([value, label]) => <Button key={value} variant={tab === value ? "default" : "outline"} onClick={() => setTab(value)}>{label}</Button>)}</div>{message && <p className="mb-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700">{message}</p>}{tab === "whatsapp" && <section className="grid gap-5 lg:grid-cols-3"><Panel title="Connection"><Input placeholder="WAHA session" value={session} onChange={(event) => setSession(event.target.value)} /><Button className="mt-3" onClick={createConnection}>Simpan connection</Button><List items={wa.connections.map((item) => `${item.provider} · ${item.session_id || "tanpa session"} · ${item.status}`)} /></Panel><Panel title="Whitelist groups"><p className="text-sm text-slate-500">{wa.groups.length} group terdaftar, {wa.groups.filter((item) => item.is_active).length} aktif.</p><List items={wa.groups.map((item) => `${item.group_name || item.provider_group_id} · ${item.is_active ? "aktif" : "nonaktif"}`)} /></Panel><Panel title="Participant mapping"><p className="text-sm text-slate-500">{wa.mappings.filter((item) => item.is_verified).length} mapping terverifikasi.</p><List items={wa.mappings.map((item) => `${item.display_name || item.provider_participant_id} · ${item.is_verified ? "verified" : "pending"}`)} /></Panel></section>}{tab === "escalation" && <Panel title="Escalation policies"><div className="flex gap-2"><Input placeholder="Nama policy" value={name} onChange={(event) => setName(event.target.value)} /><Button onClick={createPolicy}>Tambah</Button></div><List items={policies.map((item) => `${item.name} · ${item.is_active ? "aktif" : "nonaktif"}`)} /></Panel>}{tab === "audit" && <Panel title="Audit samples & findings"><p className="text-sm text-slate-500">{audits.samples.length} sample dan {audits.findings.length} finding tercatat.</p><List items={audits.samples.map((item) => `${item.work_item_id} · ${item.rating || "belum dinilai"} · ${new Date(item.sampled_at).toLocaleDateString("id-ID")}`)} /><h3 className="mt-5 font-semibold">Finding terbaru</h3><List items={audits.findings.map((item) => `${item.severity} · ${item.finding_type} · ${item.description}`)} /></Panel>}{tab === "dead" && <Panel title="Dead-letter inspection"><List items={deadLetters.map((item) => `${item.event_type} · retry ${item.retry_count} · ${item.error_message || "tanpa pesan"}`)} actions={deadLetters.map((item) => <Button key={item.id} size="sm" variant="outline" onClick={() => retry(item.id)}>Retry</Button>)} /></Panel>}</main>;
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) { return <div className="rounded-xl bg-white p-5 shadow-sm"><h2 className="mb-4 text-base font-semibold">{title}</h2>{children}</div>; }
function List({ items, actions }: { items: string[]; actions?: React.ReactNode[] }) { return <div className="mt-4 divide-y divide-slate-100">{items.length ? items.map((item, index) => <div key={`${item}-${index}`} className="flex items-center justify-between gap-3 py-3 text-sm"><span>{item}</span>{actions?.[index]}</div>) : <p className="py-3 text-sm text-slate-500">Belum ada data.</p>}</div>; }
