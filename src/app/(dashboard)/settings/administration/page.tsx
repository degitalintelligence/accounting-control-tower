"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Activity, CheckCircle2, ChevronRight, Cpu, KeyRound, Loader2, MessageCircle, Plus, RefreshCw, RotateCcw, ShieldCheck, Wifi, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { WhatsAppWhitelistWizard } from "@/components/whatsapp/whitelist-wizard";
import { useI18n } from "@/components/i18n-provider";

type EscalationRule = { threshold_hours: number; level: "maker" | "team_lead" | "accounting_manager" | "owner"; priority: "low" | "medium" | "high" | "critical"; recipient_roles?: string[] };
type Policy = { id: string; name: string; description: string | null; client_id: string | null; is_active: boolean; rules?: EscalationRule[] };
type AiPolicy = Policy & { provider: string; model: string | null; retention_days: number; require_human_confirmation: boolean; allow_sensitive_data: boolean; no_training_required: boolean };
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
type Capabilities = Record<"integrations" | "escalations" | "escalationManage" | "ai" | "audit" | "auditManage" | "dead" | "deadManage" | "health", boolean>;

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
  const [capabilities, setCapabilities] = useState<Capabilities>({ integrations: false, escalations: false, escalationManage: false, ai: false, audit: false, auditManage: false, dead: false, deadManage: false, health: false });
  const [wa, setWa] = useState<WhatsAppData>({ connections: [], groups: [], mappings: [] });
  const [members, setMembers] = useState<Member[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [aiPolicies, setAiPolicies] = useState<AiPolicy[]>([]);
  const [audits, setAudits] = useState<AuditData>({ samples: [], findings: [] });
  const [deadLetters, setDeadLetters] = useState<DeadLetter[]>([]);
  const [jobHealth, setJobHealth] = useState<JobHealth[]>([]);
  const [policyName, setPolicyName] = useState("");
  const [aiPolicyName, setAiPolicyName] = useState("");
  const [editingPolicy, setEditingPolicy] = useState<Policy | null>(null);
  const [editingAiPolicy, setEditingAiPolicy] = useState<AiPolicy | null>(null);
  const [session, setSession] = useState("");
  const [selectedConnection, setSelectedConnection] = useState<string | null>(null);
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [partialFailures, setPartialFailures] = useState<string[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [retirementTarget, setRetirementTarget] = useState<Connection | null>(null);
  const [groupId, setGroupId] = useState("");
  const [providerGroupId, setProviderGroupId] = useState("");
  const [groupName, setGroupName] = useState("");
  const [participantId, setParticipantId] = useState("");
  const [participantName, setParticipantName] = useState("");
  const [participantProfile, setParticipantProfile] = useState("");
  const [editingMappingId, setEditingMappingId] = useState<string | null>(null);
  const [discoveredGroups, setDiscoveredGroups] = useState<DiscoveredGroup[]>([]);
  const [discoveredParticipants, setDiscoveredParticipants] = useState<DiscoveredParticipant[]>([]);

  async function load(silent = false) {
    if (!silent) setLoading(true);
    setMessage(null);
    setLoadError(null);
    try {
      const capabilityResponse = await fetch("/api/auth/capabilities", { cache: "no-store" });
      const capabilityBody = capabilityResponse.ok ? await capabilityResponse.json() : null;
      if (!capabilityResponse.ok || !capabilityBody?.administration) throw new Error("Hak akses administrasi belum dapat dimuat.");
      const nextCapabilities: Capabilities = { ...capabilities, ...capabilityBody.administration };
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
      setPartialFailures(responses.flatMap((result, index) => result.status === "rejected" || (result.value && !result.value.ok) ? [names[index]] : []));
      const body = await Promise.all(responses.map(async (result) => result.status === "fulfilled" && result.value?.ok ? result.value.json() : null));
      if (body[0]) setWa({ connections: body[0].connections ?? [], groups: body[0].groups ?? [], mappings: body[0].mappings ?? [] });
      if (body[1]) setPolicies(body[1]);
      if (body[2]) setAudits(body[2]);
      if (body[3]) setDeadLetters(body[3]);
      if (body[4]) setJobHealth(body[4].workers ?? []);
      if (body[5]) setAiPolicies(body[5]);
      if (body[6]) setMembers((body[6] as Member[]).filter((item) => item.is_active));
      if (body[7]) setClients((body[7].data ?? []).map((item: Client) => ({ id: item.id, name: item.name })));
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Data administrasi belum dapat dimuat.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, []);
  useEffect(() => () => { if (qrUrl) URL.revokeObjectURL(qrUrl); }, [qrUrl]);

  function notify(type: "success" | "error", text: string) { setMessage({ type, text }); window.setTimeout(() => setMessage(null), 4500); }

  async function action(key: string, request: () => Promise<Response>, success: string, reload = true) {
    setBusy(key); setMessage(null);
    try { const response = await request(); const body = await response.json().catch(() => null); if (!response.ok) throw new Error(body?.error ?? "Aksi gagal diproses."); notify("success", success); if (reload) await load(true); return body; } catch (error) { notify("error", error instanceof Error ? error.message : "Aksi gagal diproses."); return null; } finally { setBusy(null); }
  }

  async function createConnection() {
    if (!session.trim()) return notify("error", "ID sesi WAHA wajib diisi.");
    await action("create", () => fetch("/api/admin/whatsapp", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "connection", session_id: session.trim(), status: "starting" }) }), "Session WAHA berhasil dibuat dan dimulai.");
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
    await action(`retire-${target.id}`, () => fetch("/api/admin/whatsapp", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "retire", id: target.id }) }), "Session WhatsApp berhasil dihapus.");
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
    const participant = discoveredParticipants.find((item) => {
      const id = typeof item.id === "string" ? item.id : item.id?._serialized;
      const lid = typeof item.lid === "string" ? item.lid : item.lid?._serialized;
      return id === participantId || lid === participantId || item.phone === participantId;
    });
    const mappingPayload = { action: "mapping", ...(editingMappingId ? { id: editingMappingId } : {}), wa_group_id: groupId, provider_participant_id: participantId.trim(), phone: participant?.phone ?? null, display_name: participantName.trim() || participant?.displayName || participant?.name || null, profile_id: participantProfile, is_verified: true };
    // #region debug-point A:mapping-payload
    fetch("http://127.0.0.1:7777/event", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessionId: "whatsapp-mapping-400", runId: "pre-fix", hypothesisId: "A", location: "administration/page.tsx:createMapping", msg: "[DEBUG] Mapping payload prepared", data: { hasGroupId: Boolean(mappingPayload.wa_group_id), hasParticipantId: Boolean(mappingPayload.provider_participant_id), hasProfileId: Boolean(mappingPayload.profile_id), participantIdLength: mappingPayload.provider_participant_id.length } }) }).catch(() => {});
    // #endregion
    const body = await action("mapping", () => fetch("/api/admin/whatsapp", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(mappingPayload) }), "Kontak berhasil diverifikasi.", false);
    if (body) {
      setWa((current) => ({ ...current, mappings: [...current.mappings.filter((item) => item.id !== body.id), body] }));
      setParticipantId(""); setParticipantName(""); setParticipantProfile(""); setEditingMappingId(null);
    }
  }

  async function activateGroup(group: Group) {
    await action(`activate-group-${group.id}`, () => fetch("/api/admin/whatsapp", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "activate-group", id: group.id }) }), "Grup WhatsApp berhasil diaktifkan kembali.");
  }

  async function deactivateGroup(group: Group) {
    if (!window.confirm(`Nonaktifkan grup ${group.group_name || group.provider_group_id}?`)) return;
    await action(`deactivate-group-${group.id}`, () => fetch("/api/admin/whatsapp", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "deactivate-group", id: group.id }) }), "Grup WhatsApp berhasil dinonaktifkan.");
  }

  function closeQr() {
    setQrUrl(null);
  }

  async function archiveConnection(connection: Connection) {
    if (!window.confirm(`Hapus ${connection.session_id || "session ini"} dari daftar? History pesan dan audit tetap disimpan.`)) return;
    await action(`archive-${connection.id}`, () => fetch("/api/admin/whatsapp", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "archive-retired", id: connection.id }) }), "Session dihapus dari daftar. History tetap tersimpan.");
  }

  async function unverifyMapping(mapping: Mapping) {
    if (!window.confirm(`Batalkan verifikasi ${mapping.display_name || mapping.provider_participant_id}?`)) return;
    await action(`unverify-mapping-${mapping.id}`, () => fetch("/api/admin/whatsapp", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "unverify-mapping", id: mapping.id }) }), "Verifikasi kontak berhasil dibatalkan.");
  }

  async function verifyMapping(mapping: Mapping) {
    setGroupId(mapping.wa_group_id);
    setParticipantId(mapping.provider_participant_id);
    setParticipantName(mapping.display_name ?? "");
    setParticipantProfile(mapping.profile_id ?? "");
    setEditingMappingId(mapping.id);
    const group = wa.groups.find((item) => item.id === mapping.wa_group_id);
    setDiscoveredParticipants([]);
    if (group?.provider_group_id) await discoverParticipants(group.provider_group_id);
    notify("success", "Kontak lama sudah diisi. Ubah jika diperlukan, lalu klik Verifikasi kontak.");
  }

  async function discoverGroups() {
    if (!selectedConnection) return notify("error", "Pilih koneksi WAHA terlebih dahulu.");
    const selected = wa.connections.find((item) => item.id === selectedConnection);
    if (selected && !["working", "connected", "healthy"].includes(selected.status.toLowerCase())) return notify("error", "Session belum siap. Scan QR dan tunggu status WORKING sebelum memuat grup.");
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

  async function savePolicy(kind: "escalation" | "ai", policy: Policy | AiPolicy | null = null) {
    const value = kind === "ai" ? (policy as AiPolicy | null)?.name ?? aiPolicyName : (policy as Policy | null)?.name ?? policyName;
    if (!value.trim()) return notify("error", "Nama kebijakan wajib diisi.");
    const payload = kind === "ai" ? { ...(policy as AiPolicy | null), name: value.trim() } : { ...(policy as Policy | null), name: value.trim() };
    await action(`policy-${kind}`, () => fetch(kind === "ai" ? "/api/admin/ai-policies" : "/api/admin/escalations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }), "Kebijakan berhasil disimpan.");
    if (kind === "ai") setAiPolicyName("");
    else setPolicyName("");
    setEditingPolicy(null); setEditingAiPolicy(null);
  }

  if (loading) return <main className="page-canvas"><div className="mx-auto max-w-6xl space-y-5"><Skeleton /><Skeleton /><Skeleton /></div></main>;
  if (loadError) return <main className="page-canvas"><div className="mx-auto max-w-2xl rounded-2xl border border-red-200 bg-red-50 p-6 text-red-900"><h1 className="text-lg font-bold">Administrasi belum siap</h1><p className="mt-2 text-sm">{loadError}</p><Button className="mt-4" variant="outline" onClick={() => void load()}><RefreshCw className="size-4" />Coba lagi</Button></div></main>;

  return <main className="page-canvas text-slate-900"><div className="mx-auto w-full max-w-6xl space-y-6">
    <header><div className="flex flex-wrap items-center gap-2 text-xs font-medium text-blue-600"><KeyRound className="size-4" /> Control Center <ChevronRight className="size-3 text-slate-400" /> Administrasi</div><div className="mt-3 flex flex-col justify-between gap-3 sm:flex-row sm:items-end"><div><h1 className="text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">Administrasi operasional</h1><p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500">Kelola integrasi, kebijakan kontrol, audit, antrean gagal, dan kesehatan sistem dari satu tempat.</p></div><Button variant="outline" onClick={() => void load()} disabled={loading}><RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} /> Segarkan data</Button></div></header>
    <div className="grid gap-3 sm:grid-cols-3"><Summary icon={Wifi} label="Koneksi WhatsApp" value={`${wa.connections.filter((item) => item.status !== "retired").length}`} hint="aktif atau tersedia" /><Summary icon={ShieldCheck} label="Kebijakan aktif" value={`${policies.filter((item) => item.is_active).length + aiPolicies.filter((item) => item.is_active).length}`} hint="eskalasi dan AI" /><Summary icon={Activity} label="Worker bermasalah" value={`${jobHealth.filter((item) => item.status !== "healthy").length}`} hint="perlu perhatian" /></div>
    {partialFailures.length > 0 && <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"><span>Data belum tersedia: {partialFailures.join(", ")}.</span><Button size="sm" variant="outline" onClick={() => void load()} className="border-amber-300 bg-white">Coba lagi</Button></div>}
    {message && <div role="status" className={`rounded-xl border px-4 py-3 text-sm ${message.type === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-800"}`}>{message.text}</div>}
    <div role="tablist" aria-label="Bagian administrasi" className="flex max-w-full gap-2 overflow-x-auto border-b border-slate-200 pb-2">{tabs.filter(([value]) => capabilities[value === "whatsapp" ? "integrations" : value === "escalation" ? "escalations" : value]).map(([value, label, Icon]) => <button key={value} id={`tab-${value}`} role="tab" aria-selected={tab === value} aria-controls={`panel-${value}`} onClick={() => setTab(value)} className={`flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${tab === value ? "bg-blue-600 text-white shadow-sm" : "text-slate-600 hover:bg-slate-100"}`}><Icon className="size-4" />{label}{((value === "escalation" && !capabilities.escalationManage) || (value === "audit" && !capabilities.auditManage) || (value === "dead" && !capabilities.deadManage)) && <span className="text-[11px] font-normal opacity-75">Read-only</span>}</button>)}</div>
    <div id={`panel-${tab}`} role="tabpanel" aria-labelledby={`tab-${tab}`}>{tab === "whatsapp" && capabilities.integrations && <WhatsAppWhitelistWizard data={wa} members={members} clients={clients} session={session} setSession={setSession} selected={selectedConnection} selectedClientId={selectedClientId} onClientChange={setSelectedClientId} qrUrl={qrUrl} busy={busy} groupId={groupId} setGroupId={setGroupId} providerGroupId={providerGroupId} setProviderGroupId={setProviderGroupId} groupName={groupName} setGroupName={setGroupName} participantId={participantId} setParticipantId={setParticipantId} participantName={participantName} setParticipantName={setParticipantName} participantProfile={participantProfile} setParticipantProfile={setParticipantProfile} discoveredGroups={discoveredGroups} discoveredParticipants={discoveredParticipants} onDiscoverGroups={discoverGroups} onDiscoverParticipants={discoverParticipants} onCreate={createConnection} onSelect={(id) => { setSelectedConnection(id); setDiscoveredGroups([]); setDiscoveredParticipants([]); }} onQr={showQr} onQrClose={closeQr} onHealth={(id) => action(`health-${id}`, () => fetch(`/api/admin/whatsapp?action=status&id=${id}`), "Status koneksi diperbarui.")} onStart={(id) => action(`start-${id}`, () => fetch("/api/admin/whatsapp", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "start", id }) }), "Session WAHA dimulai. Silakan cek status koneksi.")} onStop={(id) => action(`stop-${id}`, () => fetch("/api/admin/whatsapp", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "stop", id }) }), "Koneksi WhatsApp berhasil diputuskan.")} onRetire={setRetirementTarget} onArchive={archiveConnection} onAddGroup={createGroup} onAddMapping={createMapping} onDeactivateGroup={deactivateGroup} onActivateGroup={activateGroup} onUnverifyMapping={unverifyMapping} onVerifyMapping={verifyMapping} onDone={() => notify("success", "Konfigurasi WhatsApp selesai dan siap digunakan.")} />}{tab === "escalation" && capabilities.escalations && <EscalationPolicyPanel value={policyName} setValue={setPolicyName} policies={policies} busy={busy === "policy-escalation"} clients={clients} canManage={capabilities.escalationManage} editing={editingPolicy} onEdit={setEditingPolicy} onSave={(policy) => void savePolicy("escalation", policy)} />}{tab === "ai" && capabilities.ai && <AiPolicyPanel value={aiPolicyName} setValue={setAiPolicyName} policies={aiPolicies} busy={busy === "policy-ai"} clients={clients} editing={editingAiPolicy} onEdit={setEditingAiPolicy} onSave={(policy) => void savePolicy("ai", policy)} />}{tab === "audit" && capabilities.audit && <AuditPanel audits={audits} busy={busy} canManage={capabilities.auditManage} onSample={() => action("sample", () => fetch("/api/admin/audits", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "auto_sample" }) }), "Sampling audit berhasil dijalankan.")} onClose={(id) => action(`finding-${id}`, () => fetch("/api/admin/audits", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "update_finding", id, status: "closed", resolution: "Ditutup oleh administrator." }) }), "Finding ditutup.")} />}{tab === "dead" && capabilities.dead && <DeadPanel items={deadLetters} busy={busy} canManage={capabilities.deadManage} onRetry={(id) => action(`retry-${id}`, () => fetch("/api/admin/dead-letters", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) }), "Retry dicatat.")} />}{tab === "health" && capabilities.health && <HealthPanel items={jobHealth} />}</div>
    <Dialog open={retirementTarget !== null} onOpenChange={(open) => { if (!open) setRetirementTarget(null); }}><DialogContent><DialogHeader><DialogTitle>Hapus session WhatsApp?</DialogTitle><DialogDescription>Session {retirementTarget?.session_id || "ini"} akan dihapus dari WAHA dan tidak dapat diaktifkan kembali dari aplikasi. Semua grup whitelist terkait ikut dinonaktifkan.</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" onClick={() => setRetirementTarget(null)}>Batal</Button><Button variant="destructive" onClick={() => void retireConnection()} disabled={busy === `retire-${retirementTarget?.id}`}><XCircle className="size-4" />{busy === `retire-${retirementTarget?.id}` ? "Menghapus..." : "Hapus session"}</Button></DialogFooter></DialogContent></Dialog>
  </div></main>;
}

function Summary({ icon: Icon, label, value, hint }: { icon: typeof Activity; label: string; value: string; hint: string }) { return <div className="surface-card rounded-xl p-4"><div className="flex items-center gap-2 text-xs font-semibold text-slate-500"><Icon className="size-4 text-blue-600" />{label}</div><div className="mt-2 text-2xl font-bold text-slate-950">{value}</div><p className="text-xs text-slate-500">{hint}</p></div>; }
function Skeleton() { return <div className="h-28 animate-pulse rounded-xl bg-white shadow-sm" />; }
function Panel({ title, description, children, action }: { title: string; description: string; children: ReactNode; action?: ReactNode }) { return <section className="surface-card rounded-2xl p-5 sm:p-6"><div className="mb-5 flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-lg font-bold text-slate-950">{title}</h2><p className="mt-1 text-sm text-slate-500">{description}</p></div>{action}</div>{children}</section>; }
function Status({ value }: { value: string }) { const healthy = ["connected", "working", "healthy"].includes(value.toLowerCase()); return <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${healthy ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}><span className={`size-1.5 rounded-full ${healthy ? "bg-emerald-500" : "bg-amber-500"}`} />{value}</span>; }
function clientOptions(clients: Client[]) { return <><option value="">Semua organisasi</option>{clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}</>; }
function EscalationPolicyPanel({ value, setValue, policies, busy, clients, canManage, editing, onEdit, onSave }: { value: string; setValue: (value: string) => void; policies: Policy[]; busy: boolean; clients: Client[]; canManage: boolean; editing: Policy | null; onEdit: (policy: Policy | null) => void; onSave: (policy: Policy) => void }) {
  const draft = editing ?? { id: "", name: value, description: null, client_id: null, is_active: true, rules: [{ threshold_hours: 24, level: "team_lead" as const, priority: "high" as const, recipient_roles: [] }] };
  const update = (next: Partial<Policy>) => onEdit({ ...draft, ...next });
  const rules = draft.rules ?? [];
  return <Panel title="Kebijakan eskalasi" description="Atur threshold, level, prioritas, dan penerima eskalasi." action={<ShieldCheck className="size-5 text-blue-600" />}><div className="grid gap-3 md:grid-cols-3"><Input aria-label="Nama kebijakan eskalasi" placeholder="Nama kebijakan" value={editing ? draft.name : value} onChange={(event) => editing ? update({ name: event.target.value }) : setValue(event.target.value)} disabled={!canManage} /><select aria-label="Scope client" className="h-9 rounded-lg border border-input bg-white px-2 text-sm" value={draft.client_id ?? ""} onChange={(event) => update({ client_id: event.target.value || null })} disabled={!canManage}>{clientOptions(clients)}</select><div className="flex gap-2"><Button className="cta-primary" disabled={!canManage || busy} onClick={() => onSave(draft)}>{busy ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}{editing ? "Simpan" : "Tambah"}</Button>{editing && <Button variant="outline" onClick={() => onEdit(null)}>Batal</Button>}</div></div>{!editing && <p className="mt-3 text-xs text-slate-500">Tambahkan kebijakan untuk membuka editor aturan.</p>}{editing && <div className="mt-4 space-y-3">{rules.map((rule, index) => <div key={index} className="grid gap-2 rounded-xl border border-slate-200 p-3 sm:grid-cols-5"><Input aria-label={`Threshold aturan ${index + 1}`} type="number" min="1" value={rule.threshold_hours} onChange={(event) => update({ rules: rules.map((item, itemIndex) => itemIndex === index ? { ...item, threshold_hours: Number(event.target.value) } : item) })} /><select aria-label={`Level aturan ${index + 1}`} className="rounded-lg border border-input bg-white px-2 text-sm" value={rule.level} onChange={(event) => update({ rules: rules.map((item, itemIndex) => itemIndex === index ? { ...item, level: event.target.value as EscalationRule["level"] } : item) })}><option value="maker">Maker</option><option value="team_lead">Team lead</option><option value="accounting_manager">Accounting manager</option><option value="owner">Owner</option></select><select aria-label={`Prioritas aturan ${index + 1}`} className="rounded-lg border border-input bg-white px-2 text-sm" value={rule.priority} onChange={(event) => update({ rules: rules.map((item, itemIndex) => itemIndex === index ? { ...item, priority: event.target.value as EscalationRule["priority"] } : item) })}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="critical">Critical</option></select><Input aria-label={`Role penerima aturan ${index + 1}`} placeholder="Role: manager, owner" value={rule.recipient_roles?.join(", ") ?? ""} onChange={(event) => update({ rules: rules.map((item, itemIndex) => itemIndex === index ? { ...item, recipient_roles: event.target.value.split(",").map((role) => role.trim()).filter(Boolean) } : item) })} /><Button variant="outline" onClick={() => update({ rules: rules.filter((_, itemIndex) => itemIndex !== index) })} disabled={rules.length === 1}>Hapus</Button></div>)}<Button variant="outline" onClick={() => update({ rules: [...rules, { threshold_hours: (rules.at(-1)?.threshold_hours ?? 0) + 24, level: "owner", priority: "critical", recipient_roles: [] }] })}>Tambah aturan</Button></div>}<div className="mt-5 divide-y divide-slate-100">{policies.map((item) => <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 py-3"><div><p className="font-semibold">{item.name}</p><p className="text-xs text-slate-500">{item.client_id ? clients.find((client) => client.id === item.client_id)?.name ?? "Client" : "Semua organisasi"} · {item.rules?.length ?? 0} aturan</p></div><div className="flex items-center gap-2"><Status value={item.is_active ? "active" : "inactive"} />{canManage && <Button size="sm" variant="outline" onClick={() => onEdit(item)}>Edit</Button>}{canManage && <Button size="sm" variant="outline" onClick={() => onSave({ ...item, is_active: !item.is_active })}>{item.is_active ? "Nonaktifkan" : "Aktifkan"}</Button>}</div></div>)}</div></Panel>;
}
function AiPolicyPanel({ value, setValue, policies, busy, clients, editing, onEdit, onSave }: { value: string; setValue: (value: string) => void; policies: AiPolicy[]; busy: boolean; clients: Client[]; editing: AiPolicy | null; onEdit: (policy: AiPolicy | null) => void; onSave: (policy: AiPolicy) => void }) {
  const draft = editing ?? { id: "", name: value, description: null, client_id: null, is_active: true, provider: "openrouter", model: "", retention_days: 90, require_human_confirmation: true, allow_sensitive_data: false, no_training_required: true };
  const update = (next: Partial<AiPolicy>) => onEdit({ ...draft, ...next });
  return <Panel title="Kebijakan AI" description="Kelola provider, model, scope, retensi, dan safety flags." action={<Cpu className="size-5 text-purple-600" />}><div className="grid gap-3 md:grid-cols-3"><Input aria-label="Nama kebijakan AI" placeholder="Nama kebijakan" value={editing ? draft.name : value} onChange={(event) => editing ? update({ name: event.target.value }) : setValue(event.target.value)} /><select aria-label="Scope client AI" className="h-9 rounded-lg border border-input bg-white px-2 text-sm" value={draft.client_id ?? ""} onChange={(event) => update({ client_id: event.target.value || null })}>{clientOptions(clients)}</select><Input aria-label="Provider AI" value={draft.provider} onChange={(event) => update({ provider: event.target.value })} /></div><div className="mt-3 grid gap-3 md:grid-cols-3"><Input aria-label="Model AI" placeholder="Model" value={draft.model ?? ""} onChange={(event) => update({ model: event.target.value })} /><Input aria-label="Retensi hari" type="number" min="1" max="3650" value={draft.retention_days} onChange={(event) => update({ retention_days: Number(event.target.value) })} /><Button className="cta-primary" disabled={busy} onClick={() => onSave(draft)}>{busy ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}{editing ? "Simpan" : "Tambah"}</Button></div><div className="mt-4 grid gap-2 sm:grid-cols-3">{([["require_human_confirmation", "Wajib konfirmasi manusia"], ["allow_sensitive_data", "Izinkan data sensitif"], ["no_training_required", "Tanpa training eksternal"]] as const).map(([key, label]) => <label key={key} className="flex items-center gap-2 rounded-lg border border-slate-200 p-3 text-sm"><input type="checkbox" checked={draft[key]} onChange={(event) => update({ [key]: event.target.checked })} />{label}</label>)}</div>{editing && <Button className="mt-3" variant="outline" onClick={() => onEdit(null)}>Batal</Button>}<div className="mt-5 divide-y divide-slate-100">{policies.map((item) => <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 py-3"><div><p className="font-semibold">{item.name}</p><p className="text-xs text-slate-500">{item.provider} · {item.model || "default model"} · {item.retention_days} hari</p></div><div className="flex items-center gap-2"><Status value={item.is_active ? "active" : "inactive"} /><Button size="sm" variant="outline" onClick={() => onEdit(item)}>Edit</Button><Button size="sm" variant="outline" onClick={() => onSave({ ...item, is_active: !item.is_active })}>{item.is_active ? "Nonaktifkan" : "Aktifkan"}</Button></div></div>)}</div></Panel>;
}
function AuditPanel({ audits, busy, canManage, onSample, onClose }: { audits: AuditData; busy: string | null; canManage: boolean; onSample: () => void; onClose: (id: string) => void }) { return <Panel title="Sampel audit dan temuan" description="Pantau kualitas kontrol dan tindak lanjut temuan." action={canManage ? <Button onClick={onSample} disabled={busy === "sample"} className="cta-primary">{busy === "sample" ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />} Ambil sampel</Button> : <span className="text-xs font-semibold text-amber-700">Read-only</span>}><div className="grid gap-3 sm:grid-cols-2"><Metric label="Sampel" value={`${audits.samples.length}`} /><Metric label="Temuan" value={`${audits.findings.length}`} /></div><div className="mt-5 divide-y divide-slate-100">{audits.findings.length ? audits.findings.map((item) => <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 py-3"><div><p className="font-semibold text-slate-900">{item.finding_type}</p><p className="text-xs text-slate-500">Severity {item.severity} · {item.status}</p></div>{item.status !== "closed" && canManage && <Button size="sm" variant="outline" onClick={() => onClose(item.id)}>Tutup finding</Button>}</div>) : <Empty icon={CheckCircle2} text="Belum ada temuan audit." />}</div></Panel>; }
function DeadPanel({ items, busy, canManage, onRetry }: { items: DeadLetter[]; busy: string | null; canManage: boolean; onRetry: (id: string) => void }) { return <Panel title="Antrean gagal" description="Event yang gagal diproses dan membutuhkan retry." action={canManage ? <RotateCcw className="size-5 text-amber-600" /> : <span className="text-xs font-semibold text-amber-700">Read-only</span>}><div className="divide-y divide-slate-100">{items.length ? items.map((item) => <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 py-3"><div><p className="font-semibold text-slate-900">{item.event_type}</p><p className="text-xs text-slate-500">Percobaan {item.retry_count} · {new Date(item.created_at).toLocaleString("id-ID")}</p></div>{canManage && <Button size="sm" variant="outline" onClick={() => onRetry(item.id)} disabled={busy === `retry-${item.id}`}><RotateCcw className="size-4" />Coba ulang</Button>}</div>) : <Empty icon={CheckCircle2} text="Antrean gagal kosong." />}</div></Panel>; }
function HealthPanel({ items }: { items: JobHealth[] }) { return <Panel title="Kesehatan pekerjaan" description="Status worker dan antrean dipantau secara berkala." action={<Activity className="size-5 text-emerald-600" />}><div className="grid gap-3 lg:grid-cols-3">{items.length ? items.map((item) => <div key={item.name} className="rounded-xl border border-slate-200 p-4"><div className="flex items-center justify-between gap-2"><p className="font-semibold text-slate-900">{item.name}</p><Status value={item.status} /></div><div className="mt-4 grid grid-cols-3 gap-2 text-center"><Metric label="Pending" value={`${item.pending}`} /><Metric label="Proses" value={`${item.processing}`} /><Metric label="Gagal" value={`${item.failed}`} /></div><p className="mt-3 text-xs text-slate-500">Aktivitas terakhir: {item.last_activity_at ? new Date(item.last_activity_at).toLocaleString("id-ID") : "belum ada"}</p></div>) : <Empty icon={Activity} text="Data kesehatan belum tersedia." />}</div></Panel>; }
function Metric({ label, value }: { label: string; value: string }) { return <div className="rounded-lg bg-slate-50 p-3"><p className="text-xs text-slate-500">{label}</p><p className="mt-1 text-lg font-bold text-slate-900">{value}</p></div>; }
function Empty({ icon: Icon, text }: { icon: typeof Activity; text: string }) { return <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 px-5 py-10 text-center"><Icon className="size-8 text-slate-300" /><p className="mt-3 text-sm text-slate-500">{text}</p></div>; }
