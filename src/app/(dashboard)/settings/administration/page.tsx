"use client";

import { useEffect, useState, type ReactNode } from "react";
import Image from "next/image";
import { Activity, CheckCircle2, ChevronRight, Cpu, Database, KeyRound, Loader2, MessageCircle, Plus, QrCode, RefreshCw, RotateCcw, ShieldCheck, Wifi, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { WhatsAppWhitelistWizard } from "@/components/whatsapp/whitelist-wizard";
import { useI18n } from "@/components/i18n-provider";

type Policy = { id: string; name: string; description: string | null; client_id: string | null; is_active: boolean };
type Connection = { id: string; provider: string; session_id: string | null; status: string; retired_at?: string | null; last_health_check_at: string | null };
type Group = { id: string; connection_id: string; client_id: string | null; provider_group_id: string; group_name: string | null; is_active: boolean };
type Mapping = { id: string; wa_group_id: string; provider_participant_id: string; phone: string | null; display_name: string | null; profile_id: string | null; is_verified: boolean };
type DiscoveredGroup = { id?: string | { _serialized?: string; user?: string; server?: string }; name?: string; subject?: string; groupId?: string | { _serialized?: string; user?: string; server?: string }; groupMetadata?: { id?: { _serialized?: string; user?: string; server?: string }; subject?: string } };
type DiscoveredParticipant = { id?: string | { _serialized?: string; user?: string; server?: string }; lid?: string | { _serialized?: string; user?: string; server?: string }; phone?: string; displayName?: string; name?: string };
type Member = { profile_id: string; name: string; is_active: boolean };
type Client = { id: string; name: string };
type WhatsAppData = { connections: Connection[]; groups: Group[]; mappings: Mapping[] };
type AuditData = { samples: { id: string; rating: string | null; sampled_at: string }[]; findings: { id: string; finding_type: string; severity: string; status: string }[] };
type DeadLetter = { id: string; event_type: string; retry_count: number; created_at: string };
type JobHealth = { name: string; status: string; pending: number; processing: number; failed: number; last_activity_at: string | null };
type Capabilities = Record<"integrations" | "escalations" | "ai" | "audit" | "dead" | "health", boolean>;

export default function AdministrationPage() {
  const { t } = useI18n();
  const tabs = [
    ["whatsapp", t("admin.whatsapp"), MessageCircle],
    ["escalation", t("admin.escalation"), ShieldCheck],
    ["ai", t("admin.aiPolicy"), Cpu],
    ["audit", t("admin.audit"), CheckCircle2],
    ["dead", t("admin.deadQueue"), RotateCcw],
    ["health", t("admin.health"), Activity],
  ] as const;
  const [tab, setTab] = useState("whatsapp");
  const [capabilities, setCapabilities] = useState<Capabilities>({ integrations: false, escalations: false, ai: false, audit: false, dead: false, health: false });
  const [wa, setWa] = useState<WhatsAppData>({ connections: [], groups: [], mappings: [] });
  const [members, setMembers] = useState<Member[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [aiPolicies, setAiPolicies] = useState<Policy[]>([]);
  const [audits, setAudits] = useState<AuditData>({ samples: [], findings: [] });
  const [deadLetters, setDeadLetters] = useState<DeadLetter[]>([]);
  const [jobHealth, setJobHealth] = useState<JobHealth[]>([]);
  const [policyName, setPolicyName] = useState("");
  const [aiPolicyName, setAiPolicyName] = useState("");
  const [session, setSession] = useState("");
  const [selectedConnection, setSelectedConnection] = useState<string | null>(null);
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [partialFailures, setPartialFailures] = useState<string[]>([]);
  const [retirementTarget, setRetirementTarget] = useState<Connection | null>(null);
  const [groupId, setGroupId] = useState("");
  const [providerGroupId, setProviderGroupId] = useState("");
  const [groupName, setGroupName] = useState("");
  const [participantId, setParticipantId] = useState("");
  const [participantName, setParticipantName] = useState("");
  const [participantProfile, setParticipantProfile] = useState("");
  const [discoveredGroups, setDiscoveredGroups] = useState<DiscoveredGroup[]>([]);
  const [discoveredParticipants, setDiscoveredParticipants] = useState<DiscoveredParticipant[]>([]);

  async function load() {
    setLoading(true);
    const capabilityResponse = await fetch("/api/auth/capabilities", { cache: "no-store" });
    const capabilityBody = capabilityResponse.ok ? await capabilityResponse.json() : null;
    const nextCapabilities: Capabilities = capabilityBody?.administration ?? capabilities;
    setCapabilities(nextCapabilities);
    const requests = [
      nextCapabilities.integrations ? fetch("/api/admin/whatsapp") : Promise.resolve(null),
      nextCapabilities.escalations ? fetch("/api/admin/escalations") : Promise.resolve(null),
      nextCapabilities.audit ? fetch("/api/admin/audits") : Promise.resolve(null),
      nextCapabilities.dead ? fetch("/api/admin/dead-letters") : Promise.resolve(null),
      nextCapabilities.health ? fetch("/api/admin/job-health") : Promise.resolve(null),
      nextCapabilities.ai ? fetch("/api/admin/ai-policies") : Promise.resolve(null),
      fetch("/api/settings/members"),
      fetch("/api/clients"),
    ];
    const responses = await Promise.allSettled(requests);
    const names = ["WhatsApp", "eskalasi", "audit", "antrean gagal", "kesehatan pekerjaan", "kebijakan AI", "anggota", "client"];
    const failed = responses.flatMap((result, index) => result.status === "rejected" || (result.value && !result.value.ok) ? [names[index]] : []);
    setPartialFailures(failed);
    const body = await Promise.all(responses.map(async (result) => result.status === "fulfilled" && result.value?.ok ? result.value.json() : null));
    if (body[0]) setWa({ connections: body[0].connections ?? [], groups: body[0].groups ?? [], mappings: body[0].mappings ?? [] });
    if (body[1]) setPolicies(body[1]);
    if (body[2]) setAudits(body[2]);
    if (body[3]) setDeadLetters(body[3]);
    if (body[4]) setJobHealth(body[4].workers ?? []);
    if (body[5]) setAiPolicies(body[5]);
    if (body[6]) setMembers((body[6] as Member[]).filter((item) => item.is_active));
    if (body[7]) setClients((body[7].data ?? []).map((item: Client) => ({ id: item.id, name: item.name })));
    setLoading(false);
  }

  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, []);
  useEffect(() => () => { if (qrUrl) URL.revokeObjectURL(qrUrl); }, [qrUrl]);

  function notify(type: "success" | "error", text: string) { setMessage({ type, text }); window.setTimeout(() => setMessage(null), 4500); }

  async function action(key: string, request: () => Promise<Response>, success: string) {
    setBusy(key); setMessage(null);
    try { const response = await request(); const body = await response.json().catch(() => null); if (!response.ok) throw new Error(body?.error ?? "Aksi gagal diproses."); notify("success", success); await load(); } catch (error) { notify("error", error instanceof Error ? error.message : "Aksi gagal diproses."); } finally { setBusy(null); }
  }

  async function createConnection() {
    if (!session.trim()) return notify("error", "ID sesi WAHA wajib diisi.");
    await action("create", () => fetch("/api/admin/whatsapp", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "connection", session_id: session.trim(), status: "disconnected" }) }), "Koneksi WAHA berhasil disimpan.");
    setSession("");
  }

  async function showQr(connection: Connection) {
    if (connection.status === "retired") return notify("error", "Connection sudah retired dan tidak dapat digunakan.");
    setBusy(`qr-${connection.id}`); setSelectedConnection(connection.id); setQrUrl(null);
    try { const response = await fetch(`/api/admin/whatsapp?action=qr&id=${connection.id}`); if (!response.ok) { const body = await response.json().catch(() => null); throw new Error([body?.error, body?.action].filter(Boolean).join(" ") || "QR belum tersedia."); } setQrUrl(URL.createObjectURL(await response.blob())); } catch (error) { notify("error", error instanceof Error ? error.message : "QR belum tersedia."); } finally { setBusy(null); }
  }

  async function retireConnection() {
    if (!retirementTarget) return;
    const target = retirementTarget;
    setRetirementTarget(null);
    await action(`retire-${target.id}`, () => fetch("/api/admin/whatsapp", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "retire", id: target.id }) }), "Connection WhatsApp berhasil di-retire.");
    if (selectedConnection === target.id) {
      setSelectedConnection(null);
      setQrUrl(null);
    }
  }

  async function createGroup() {
    if (!selectedConnection || !providerGroupId.trim()) return notify("error", "Pilih koneksi dan isi ID grup WhatsApp.");
    await action("group", () => fetch("/api/admin/whatsapp", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "group", connection_id: selectedConnection, client_id: selectedClientId, provider_group_id: providerGroupId.trim(), group_name: groupName.trim() || null, is_verified: true }) }), "Grup berhasil ditambahkan ke whitelist.");
    setProviderGroupId(""); setGroupName("");
  }

  async function createMapping() {
    if (!groupId || !participantId.trim() || !participantProfile) return notify("error", "Pilih grup, isi participant ID, dan pilih anggota.");
    await action("mapping", () => fetch("/api/admin/whatsapp", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "mapping", wa_group_id: groupId, provider_participant_id: participantId.trim(), display_name: participantName.trim() || null, profile_id: participantProfile, is_verified: true }) }), "Kontak berhasil diverifikasi.");
    setParticipantId(""); setParticipantName(""); setParticipantProfile("");
  }

  async function discoverGroups() {
    if (!selectedConnection) return notify("error", "Pilih koneksi WAHA terlebih dahulu.");
    setBusy("discover-groups");
    try {
      const response = await fetch(`/api/admin/whatsapp?action=discover-groups&id=${selectedConnection}`, { cache: "no-store" });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error ?? "Discovery grup gagal.");
      setDiscoveredGroups(body.groups ?? []);
      setDiscoveredParticipants([]);
      notify("success", "Daftar grup dari WAHA berhasil dimuat.");
    } catch (error) { notify("error", error instanceof Error ? error.message : "Discovery grup gagal."); } finally { setBusy(null); }
  }

  async function discoverParticipants(providerId: string) {
    if (!selectedConnection || !providerId) return;
    setBusy("discover-participants");
    try {
      const response = await fetch(`/api/admin/whatsapp?action=discover-participants&id=${selectedConnection}&group_id=${encodeURIComponent(providerId)}`, { cache: "no-store" });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error ?? "Discovery peserta gagal.");
      setDiscoveredParticipants(body.participants ?? []);
    } catch (error) { notify("error", error instanceof Error ? error.message : "Discovery peserta gagal."); } finally { setBusy(null); }
  }

  async function createPolicy(kind: "escalation" | "ai") {
    const value = kind === "ai" ? aiPolicyName : policyName;
    if (!value.trim()) return notify("error", "Nama kebijakan wajib diisi.");
    await action(`policy-${kind}`, () => fetch(kind === "ai" ? "/api/admin/ai-policies" : "/api/admin/escalations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(kind === "ai" ? { name: value.trim(), require_human_confirmation: true, allow_sensitive_data: false, no_training_required: true } : { name: value.trim(), rules: [] }) }), "Kebijakan berhasil disimpan.");
    if (kind === "ai") setAiPolicyName("");
    else setPolicyName("");
  }

  if (loading) return <main className="page-canvas"><div className="mx-auto max-w-6xl space-y-5"><Skeleton /><Skeleton /><Skeleton /></div></main>;

  return <main className="page-canvas text-slate-900"><div className="mx-auto w-full max-w-6xl space-y-6">
    <header><div className="flex flex-wrap items-center gap-2 text-xs font-medium text-blue-600"><KeyRound className="size-4" /> Control Center <ChevronRight className="size-3 text-slate-400" /> Administrasi</div><div className="mt-3 flex flex-col justify-between gap-3 sm:flex-row sm:items-end"><div><h1 className="text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">Administrasi operasional</h1><p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500">Kelola integrasi, kebijakan kontrol, audit, antrean gagal, dan kesehatan sistem dari satu tempat.</p></div><Button variant="outline" onClick={() => void load()} disabled={loading}><RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} /> Segarkan data</Button></div></header>
    <div className="grid gap-3 sm:grid-cols-3"><Summary icon={Wifi} label="Koneksi WhatsApp" value={`${wa.connections.filter((item) => item.status !== "retired").length}`} hint="aktif atau tersedia" /><Summary icon={ShieldCheck} label="Kebijakan aktif" value={`${policies.filter((item) => item.is_active).length + aiPolicies.filter((item) => item.is_active).length}`} hint="eskalasi dan AI" /><Summary icon={Activity} label="Worker bermasalah" value={`${jobHealth.filter((item) => item.status !== "healthy").length}`} hint="perlu perhatian" /></div>
    {partialFailures.length > 0 && <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"><span>Data belum tersedia: {partialFailures.join(", ")}.</span><Button size="sm" variant="outline" onClick={() => void load()} className="border-amber-300 bg-white">Coba lagi</Button></div>}
    {message && <div role="status" className={`rounded-xl border px-4 py-3 text-sm ${message.type === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-800"}`}>{message.text}</div>}
    <div role="tablist" aria-label="Bagian administrasi" className="flex max-w-full gap-2 overflow-x-auto border-b border-slate-200 pb-2">{tabs.filter(([value]) => capabilities[value === "whatsapp" ? "integrations" : value === "escalation" ? "escalations" : value]).map(([value, label, Icon]) => <button key={value} id={`tab-${value}`} role="tab" aria-selected={tab === value} aria-controls={`panel-${value}`} onClick={() => setTab(value)} className={`flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${tab === value ? "bg-blue-600 text-white shadow-sm" : "text-slate-600 hover:bg-slate-100"}`}><Icon className="size-4" />{label}</button>)}</div>
    <div id={`panel-${tab}`} role="tabpanel" aria-labelledby={`tab-${tab}`}>{tab === "whatsapp" && capabilities.integrations && <WhatsAppWhitelistWizard data={wa} members={members} clients={clients} session={session} setSession={setSession} selected={selectedConnection} selectedClientId={selectedClientId} onClientChange={setSelectedClientId} qrUrl={qrUrl} busy={busy} groupId={groupId} setGroupId={setGroupId} providerGroupId={providerGroupId} setProviderGroupId={setProviderGroupId} groupName={groupName} setGroupName={setGroupName} participantId={participantId} setParticipantId={setParticipantId} participantName={participantName} setParticipantName={setParticipantName} participantProfile={participantProfile} setParticipantProfile={setParticipantProfile} discoveredGroups={discoveredGroups} discoveredParticipants={discoveredParticipants} onDiscoverGroups={discoverGroups} onDiscoverParticipants={discoverParticipants} onCreate={createConnection} onSelect={(id) => { setSelectedConnection(id); setDiscoveredGroups([]); setDiscoveredParticipants([]); }} onQr={showQr} onHealth={(id) => action(`health-${id}`, () => fetch(`/api/admin/whatsapp?action=status&id=${id}`), "Status koneksi diperbarui.")} onStart={(id) => action(`start-${id}`, () => fetch("/api/admin/whatsapp", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "start", id }) }), "Session WAHA dimulai. Silakan cek status koneksi.")} onRetire={setRetirementTarget} onAddGroup={createGroup} onAddMapping={createMapping} />}{tab === "escalation" && capabilities.escalations && <PolicyPanel title="Kebijakan eskalasi" description="Atur aturan pengingat dan eskalasi pekerjaan berisiko." value={policyName} setValue={setPolicyName} policies={policies} busy={busy === "policy-escalation"} onAdd={() => void createPolicy("escalation")} />}{tab === "ai" && capabilities.ai && <PolicyPanel title="Kebijakan AI" description="AI hanya memberi saran; keputusan tetap membutuhkan konfirmasi manusia." value={aiPolicyName} setValue={setAiPolicyName} policies={aiPolicies} busy={busy === "policy-ai"} onAdd={() => void createPolicy("ai")} ai />}{tab === "audit" && capabilities.audit && <AuditPanel audits={audits} busy={busy} onSample={() => action("sample", () => fetch("/api/admin/audits", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "auto_sample" }) }), "Sampling audit berhasil dijalankan.")} onClose={(id) => action(`finding-${id}`, () => fetch("/api/admin/audits", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "update_finding", id, status: "closed", resolution: "Ditutup oleh administrator." }) }), "Finding ditutup.")} />}{tab === "dead" && capabilities.dead && <DeadPanel items={deadLetters} busy={busy} onRetry={(id) => action(`retry-${id}`, () => fetch("/api/admin/dead-letters", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) }), "Retry dicatat.")} />}{tab === "health" && capabilities.health && <HealthPanel items={jobHealth} />}</div>
    <Dialog open={retirementTarget !== null} onOpenChange={(open) => { if (!open) setRetirementTarget(null); }}><DialogContent><DialogHeader><DialogTitle>Retire connection WhatsApp?</DialogTitle><DialogDescription>Connection {retirementTarget?.session_id || "ini"} akan dinonaktifkan permanen. Semua grup whitelist terkait ikut dinonaktifkan dan session tidak dapat diaktifkan kembali.</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" onClick={() => setRetirementTarget(null)}>Batal</Button><Button variant="destructive" onClick={() => void retireConnection()} disabled={busy === `retire-${retirementTarget?.id}`}><XCircle className="size-4" />{busy === `retire-${retirementTarget?.id}` ? "Memproses..." : "Retire connection"}</Button></DialogFooter></DialogContent></Dialog>
  </div></main>;
}

function Summary({ icon: Icon, label, value, hint }: { icon: typeof Activity; label: string; value: string; hint: string }) { return <div className="surface-card rounded-xl p-4"><div className="flex items-center gap-2 text-xs font-semibold text-slate-500"><Icon className="size-4 text-blue-600" />{label}</div><div className="mt-2 text-2xl font-bold text-slate-950">{value}</div><p className="text-xs text-slate-500">{hint}</p></div>; }
function Skeleton() { return <div className="h-28 animate-pulse rounded-xl bg-white shadow-sm" />; }
function Panel({ title, description, children, action }: { title: string; description: string; children: ReactNode; action?: ReactNode }) { return <section className="surface-card rounded-2xl p-5 sm:p-6"><div className="mb-5 flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-lg font-bold text-slate-950">{title}</h2><p className="mt-1 text-sm text-slate-500">{description}</p></div>{action}</div>{children}</section>; }
function Status({ value }: { value: string }) { const healthy = ["connected", "working", "healthy"].includes(value.toLowerCase()); return <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${healthy ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}><span className={`size-1.5 rounded-full ${healthy ? "bg-emerald-500" : "bg-amber-500"}`} />{value}</span>; }
function WhatsAppPanel({ data, members, session, setSession, selected, qrUrl, busy, groupId, setGroupId, providerGroupId, setProviderGroupId, groupName, setGroupName, participantId, setParticipantId, participantName, setParticipantName, participantProfile, setParticipantProfile, discoveredGroups, discoveredParticipants, onDiscoverGroups, onDiscoverParticipants, onCreate, onSelect, onQr, onHealth, onStart, onRetire, onAddGroup, onAddMapping }: { data: WhatsAppData; members: Member[]; session: string; setSession: (value: string) => void; selected: string | null; qrUrl: string | null; busy: string | null; groupId: string; setGroupId: (value: string) => void; providerGroupId: string; setProviderGroupId: (value: string) => void; groupName: string; setGroupName: (value: string) => void; participantId: string; setParticipantId: (value: string) => void; participantName: string; setParticipantName: (value: string) => void; participantProfile: string; setParticipantProfile: (value: string) => void; discoveredGroups: DiscoveredGroup[]; discoveredParticipants: DiscoveredParticipant[]; onDiscoverGroups: () => void; onDiscoverParticipants: (providerId: string) => void; onCreate: () => void; onSelect: (id: string) => void; onQr: (connection: Connection) => void; onHealth: (id: string) => void; onStart: (id: string) => void; onRetire: (connection: Connection) => void; onAddGroup: () => void; onAddMapping: () => void }) {
  const connection = data.connections.find((item) => item.id === selected);
  const groups = data.groups.filter((item) => item.connection_id === selected);
  const selectedGroup = data.groups.find((item) => item.id === groupId);
  const discoveredValue = (value: unknown): string => {
    if (typeof value === "string") return value;
    if (!value || typeof value !== "object") return "";
    const record = value as Record<string, unknown>;
    if (typeof record._serialized === "string") return record._serialized;
    if (typeof record.serialized === "string") return record.serialized;
    if (typeof record.id === "string") return record.id;
    if (typeof record.user === "string" && typeof record.server === "string") return `${record.user}@${record.server}`;
    return "";
  };
  const discoveredGroupId = (group: DiscoveredGroup) => discoveredValue(group.id) || discoveredValue(group.groupId) || discoveredValue(group.groupMetadata?.id);
  const discoveredGroupName = (group: DiscoveredGroup) => group.subject ?? group.name ?? group.groupMetadata?.subject ?? discoveredGroupId(group);
  const discoveryPanel = <div className="mb-5 rounded-xl border border-emerald-100 bg-emerald-50 p-4"><div className="flex flex-wrap items-center justify-between gap-2"><div><p className="text-sm font-semibold text-emerald-950">Discovery dari WAHA</p><p className="mt-1 text-xs text-emerald-800">Muat grup dan peserta dari session terhubung. Whitelist dan mapping manual tetap tersedia.</p></div><Button size="sm" onClick={onDiscoverGroups} disabled={!selected || busy === "discover-groups"} variant="outline" className="border-emerald-300 bg-white">{busy === "discover-groups" ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />} Muat grup</Button></div>{discoveredGroups.length > 0 && <div className="mt-3 grid gap-2"><select aria-label="Grup dari WAHA" value={providerGroupId} onChange={(event) => { setProviderGroupId(event.target.value); const found = discoveredGroups.find((item) => discoveredGroupId(item) === event.target.value); setGroupName(found ? discoveredGroupName(found) : ""); void onDiscoverParticipants(event.target.value); }} className="h-10 rounded-md border border-emerald-200 bg-white px-3 text-sm"><option value="">Pilih grup dari WAHA</option>{discoveredGroups.map((item) => { const id = discoveredGroupId(item); return <option key={id} value={id}>{discoveredGroupName(item)}</option>; })}</select>{discoveredParticipants.length > 0 && <select aria-label="Peserta dari WAHA" value={participantId} onChange={(event) => { setParticipantId(event.target.value); const found = discoveredParticipants.find((item) => `${discoveredValue(item.id) || discoveredValue(item.lid)}` === event.target.value); setParticipantName(found?.displayName ?? found?.name ?? found?.phone ?? ""); }} className="h-10 rounded-md border border-emerald-200 bg-white px-3 text-sm"><option value="">Pilih peserta dari WAHA</option>{discoveredParticipants.map((item) => { const id = discoveredValue(item.id) || discoveredValue(item.lid) || item.phone || ""; return <option key={id} value={id}>{item.displayName ?? item.name ?? item.phone ?? id}</option>; })}</select>}</div>}</div>;
  return <div className="grid gap-5 xl:grid-cols-[1.15fr_.85fr]"><Panel title="Koneksi WhatsApp" description="Tambahkan dan pantau session WAHA yang digunakan operasional." action={<Wifi className="size-5 text-blue-600" />}><div className="flex flex-col gap-2 sm:flex-row"><Input aria-label="ID sesi WAHA" placeholder="Contoh: accounting-session" value={session} onChange={(event) => setSession(event.target.value)} /><Button onClick={onCreate} disabled={busy === "create"} className="cta-primary">{busy === "create" ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />} Simpan koneksi</Button></div><div className="mt-5 space-y-2">{data.connections.length ? data.connections.map((item) => { const retired = item.status === "retired"; return <div key={item.id} className={`rounded-xl border p-4 transition-colors ${selected === item.id ? "border-blue-300 bg-blue-50/50" : "border-slate-200"}`}><button type="button" onClick={() => onSelect(item.id)} className="flex w-full items-start justify-between gap-3 text-left"><div className="min-w-0"><p className="font-semibold text-slate-900">{item.session_id || "Session tanpa ID"}</p><p className="mt-1 text-xs text-slate-500">{item.provider} · {retired ? `retired ${item.retired_at ? new Date(item.retired_at).toLocaleString("id-ID") : ""}` : item.last_health_check_at ? `dicek ${new Date(item.last_health_check_at).toLocaleString("id-ID")}` : "belum pernah dicek"}</p></div><Status value={item.status} /></button><div className="mt-3 flex flex-wrap gap-2">{!retired && <><Button size="sm" variant="outline" onClick={() => onQr(item)} disabled={busy === `qr-${item.id}`}><QrCode className="size-4" />{busy === `qr-${item.id}` ? "Memuat..." : "Tampilkan QR"}</Button><Button size="sm" variant="outline" onClick={() => onStart(item.id)} disabled={busy === `start-${item.id}`}><Wifi className="size-4" />Mulai session</Button><Button size="sm" variant="ghost" onClick={() => onHealth(item.id)} disabled={busy === `health-${item.id}`}><RefreshCw className="size-4" />Cek status</Button><Button size="sm" variant="destructive" onClick={() => onRetire(item)} disabled={busy === `retire-${item.id}`}><XCircle className="size-4" />Retire</Button></>}</div></div>; }) : <Empty icon={Wifi} text="Belum ada koneksi WhatsApp." />}</div></Panel><Panel title="QR dan whitelist" description={connection ? `Koneksi dipilih: ${connection.session_id || "tanpa session ID"}` : "Pilih koneksi untuk melihat QR dan statusnya."}>{discoveryPanel}<div className="flex min-h-64 items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 p-5">{qrUrl ? <Image src={qrUrl} alt="QR WhatsApp untuk dipindai" width={224} height={224} unoptimized /> : <div className="text-center"><QrCode className="mx-auto size-10 text-slate-300" /><p className="mt-3 text-sm font-medium text-slate-700">QR belum ditampilkan</p><p className="mt-1 text-xs text-slate-500">Pilih koneksi lalu klik Tampilkan QR.</p></div>}</div><div className="mt-5 rounded-xl border border-blue-100 bg-blue-50 p-4"><div className="flex items-center justify-between"><div><p className="text-sm font-semibold text-blue-950">Whitelist grup</p><p className="mt-1 text-xs text-blue-800">{data.groups.length} grup terdaftar · {data.groups.filter((item) => item.is_active).length} aktif</p></div><Database className="size-5 text-blue-600" /></div><div className="mt-4 space-y-2">{groups.map((group) => <button type="button" key={group.id} onClick={() => setGroupId(group.id)} className={`w-full rounded-lg border p-3 text-left text-sm ${groupId === group.id ? "border-blue-400 bg-white" : "border-blue-100 bg-blue-50/50"}`}><span className="font-semibold text-blue-950">{group.group_name || group.provider_group_id}</span><span className="ml-2 text-xs text-blue-700">{group.is_active ? "aktif" : "nonaktif"}</span></button>)}{groups.length === 0 && <p className="text-xs leading-5 text-blue-800">Belum ada grup yang diaktifkan. Sistem tidak memproses grup sebelum admin memasukkannya ke whitelist.</p>}</div><div className="mt-4 grid gap-2"><Input aria-label="ID grup dari database" placeholder="Pilih grup untuk kontak" value={selectedGroup?.id ?? ""} readOnly /><Input aria-label="Provider group ID" placeholder="ID grup dari WAHA" value={providerGroupId} onChange={(event) => setProviderGroupId(event.target.value)} /><Input aria-label="Nama grup WhatsApp" placeholder="Nama grup" value={groupName} onChange={(event) => setGroupName(event.target.value)} /><Button onClick={onAddGroup} disabled={busy === "group" || !selected} className="cta-primary"><Plus className="size-4" />Tambahkan whitelist</Button></div><div className="mt-5 border-t border-blue-200 pt-4"><p className="text-sm font-semibold text-blue-950">Verifikasi kontak</p><div className="mt-3 grid gap-2"><select aria-label="Grup kontak" value={selectedGroup ? selectedGroup.id : ""} onChange={(event) => setGroupId(event.target.value)} className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm"><option value="">Pilih grup</option>{groups.map((group) => <option key={group.id} value={group.id}>{group.group_name || group.provider_group_id}</option>)}</select><Input aria-label="Participant ID" placeholder="Participant ID dari WAHA" value={participantId} onChange={(event) => setParticipantId(event.target.value)} /><Input aria-label="Nama kontak (opsional)" placeholder="Nama kontak (opsional)" value={participantName} onChange={(event) => setParticipantName(event.target.value)} /><select aria-label="Anggota aplikasi" value={participantProfile} onChange={(event) => setParticipantProfile(event.target.value)} className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm"><option value="">Pilih anggota aplikasi</option>{members.map((member) => <option key={member.profile_id} value={member.profile_id}>{member.name}</option>)}</select><Button onClick={onAddMapping} disabled={busy === "mapping"} className="cta-primary"><Plus className="size-4" />Verifikasi kontak</Button></div><div className="mt-4 space-y-2">{data.mappings.filter((mapping) => mapping.wa_group_id === groupId).map((mapping) => <div key={mapping.id} className="rounded-lg border border-blue-100 bg-white p-3 text-xs text-slate-700">{mapping.display_name || mapping.provider_participant_id} · {mapping.is_verified ? "terverifikasi" : "menunggu verifikasi"}</div>)}</div></div></div></Panel></div>;
}
function PolicyPanel({ title, description, value, setValue, policies, busy, onAdd, ai }: { title: string; description: string; value: string; setValue: (value: string) => void; policies: Policy[]; busy: boolean; onAdd: () => void; ai?: boolean }) { return <Panel title={title} description={description} action={ai ? <Cpu className="size-5 text-purple-600" /> : <ShieldCheck className="size-5 text-blue-600" />}><div className="flex flex-col gap-2 sm:flex-row"><Input aria-label={`Nama ${title}`} placeholder={`Nama ${title.toLowerCase()}`} value={value} onChange={(event) => setValue(event.target.value)} /><Button onClick={onAdd} disabled={busy} className="cta-primary">{busy ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />} Tambah</Button></div>{ai && <div className="mt-4 rounded-xl border border-purple-100 bg-purple-50 p-4 text-sm leading-6 text-purple-900">Konfirmasi manusia wajib, data sensitif dilarang, dan penggunaan data untuk training eksternal dinonaktifkan.</div>}<div className="mt-5 divide-y divide-slate-100">{policies.length ? policies.map((item) => <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 py-3"><div><p className="font-semibold text-slate-900">{item.name}</p><p className="text-xs text-slate-500">{item.client_id ? "Berlaku untuk client" : "Berlaku untuk organisasi"}</p></div><Status value={item.is_active ? "active" : "inactive"} /></div>) : <Empty icon={ShieldCheck} text="Belum ada kebijakan." />}</div></Panel>; }
function AuditPanel({ audits, busy, onSample, onClose }: { audits: AuditData; busy: string | null; onSample: () => void; onClose: (id: string) => void }) { return <Panel title="Sampel audit dan temuan" description="Pantau kualitas kontrol dan tindak lanjut temuan." action={<Button onClick={onSample} disabled={busy === "sample"} className="cta-primary">{busy === "sample" ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />} Ambil sampel</Button>}><div className="grid gap-3 sm:grid-cols-2"><Metric label="Sampel" value={`${audits.samples.length}`} /><Metric label="Temuan" value={`${audits.findings.length}`} /></div><div className="mt-5 divide-y divide-slate-100">{audits.findings.length ? audits.findings.map((item) => <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 py-3"><div><p className="font-semibold text-slate-900">{item.finding_type}</p><p className="text-xs text-slate-500">Severity {item.severity} · {item.status}</p></div>{item.status !== "closed" && <Button size="sm" variant="outline" onClick={() => onClose(item.id)}>Tutup finding</Button>}</div>) : <Empty icon={CheckCircle2} text="Belum ada temuan audit." />}</div></Panel>; }
function DeadPanel({ items, busy, onRetry }: { items: DeadLetter[]; busy: string | null; onRetry: (id: string) => void }) { return <Panel title="Antrean gagal" description="Event yang gagal diproses dan membutuhkan retry." action={<RotateCcw className="size-5 text-amber-600" />}><div className="divide-y divide-slate-100">{items.length ? items.map((item) => <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 py-3"><div><p className="font-semibold text-slate-900">{item.event_type}</p><p className="text-xs text-slate-500">Percobaan {item.retry_count} · {new Date(item.created_at).toLocaleString("id-ID")}</p></div><Button size="sm" variant="outline" onClick={() => onRetry(item.id)} disabled={busy === `retry-${item.id}`}><RotateCcw className="size-4" />Coba ulang</Button></div>) : <Empty icon={CheckCircle2} text="Antrean gagal kosong." />}</div></Panel>; }
function HealthPanel({ items }: { items: JobHealth[] }) { return <Panel title="Kesehatan pekerjaan" description="Status worker dan antrean dipantau secara berkala." action={<Activity className="size-5 text-emerald-600" />}><div className="grid gap-3 lg:grid-cols-3">{items.length ? items.map((item) => <div key={item.name} className="rounded-xl border border-slate-200 p-4"><div className="flex items-center justify-between gap-2"><p className="font-semibold text-slate-900">{item.name}</p><Status value={item.status} /></div><div className="mt-4 grid grid-cols-3 gap-2 text-center"><Metric label="Pending" value={`${item.pending}`} /><Metric label="Proses" value={`${item.processing}`} /><Metric label="Gagal" value={`${item.failed}`} /></div><p className="mt-3 text-xs text-slate-500">Aktivitas terakhir: {item.last_activity_at ? new Date(item.last_activity_at).toLocaleString("id-ID") : "belum ada"}</p></div>) : <Empty icon={Activity} text="Data kesehatan belum tersedia." />}</div></Panel>; }
function Metric({ label, value }: { label: string; value: string }) { return <div className="rounded-lg bg-slate-50 p-3"><p className="text-xs text-slate-500">{label}</p><p className="mt-1 text-lg font-bold text-slate-900">{value}</p></div>; }
function Empty({ icon: Icon, text }: { icon: typeof Activity; text: string }) { return <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 px-5 py-10 text-center"><Icon className="size-8 text-slate-300" /><p className="mt-3 text-sm text-slate-500">{text}</p></div>; }
