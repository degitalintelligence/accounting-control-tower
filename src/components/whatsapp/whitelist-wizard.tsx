"use client";

import { useState } from "react";
import { Check, ChevronLeft, ChevronRight, Database, Link2, Loader2, MessageCircle, Plus, QrCode, RefreshCw, ShieldCheck, Users, Wifi, XCircle } from "lucide-react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Connection = { id: string; provider: string; session_id: string | null; status: string; retired_at?: string | null; last_health_check_at: string | null };
type Group = { id: string; connection_id: string; client_id: string | null; provider_group_id: string; group_name: string | null; is_active: boolean };
type Mapping = { id: string; wa_group_id: string; provider_participant_id: string; display_name: string | null; profile_id: string | null; is_verified: boolean };
type Member = { profile_id: string; name: string; is_active: boolean };
type Client = { id: string; name: string };
type DiscoveredGroup = { id?: unknown; name?: string; subject?: string; groupId?: unknown; groupMetadata?: { id?: unknown; subject?: string } };
type DiscoveredParticipant = { id?: unknown; lid?: unknown; phone?: string; displayName?: string; name?: string };

type Props = {
  data: { connections: Connection[]; groups: Group[]; mappings: Mapping[] };
  members: Member[];
  clients: Client[];
  session: string;
  setSession: (value: string) => void;
  selected: string | null;
  selectedClientId: string | null;
  onClientChange: (value: string | null) => void;
  qrUrl: string | null;
  busy: string | null;
  groupId: string;
  setGroupId: (value: string) => void;
  providerGroupId: string;
  setProviderGroupId: (value: string) => void;
  groupName: string;
  setGroupName: (value: string) => void;
  participantId: string;
  setParticipantId: (value: string) => void;
  participantName: string;
  setParticipantName: (value: string) => void;
  participantProfile: string;
  setParticipantProfile: (value: string) => void;
  discoveredGroups: DiscoveredGroup[];
  discoveredParticipants: DiscoveredParticipant[];
  onDiscoverGroups: () => void;
  onDiscoverParticipants: (providerId: string) => void;
  onCreate: () => void;
  onSelect: (id: string) => void;
  onQr: (connection: Connection) => void;
  onHealth: (id: string) => void;
  onStart: (id: string) => void;
  onRetire: (connection: Connection) => void;
  onAddGroup: () => void;
  onAddMapping: () => void;
};

const steps = [
  ["connection", "Koneksi", Wifi],
  ["group", "Aktifkan grup", MessageCircle],
  ["contacts", "Petakan kontak", Users],
  ["review", "Review", ShieldCheck],
] as const;

export function WhatsAppWhitelistWizard(props: Props) {
  const [step, setStep] = useState(0);
  const [advanced, setAdvanced] = useState(false);
  const connection = props.data.connections.find((item) => item.id === props.selected);
  const groups = props.data.groups.filter((item) => item.connection_id === props.selected);
  const selectedGroup = props.data.groups.find((item) => item.id === props.groupId);
  const mappings = props.data.mappings.filter((item) => item.wa_group_id === props.groupId);
  const groupClientName = (clientId: string | null) => props.clients.find((item) => item.id === clientId)?.name ?? "Seluruh organisasi";
  const discoveredValue = (value: unknown): string => {
    if (typeof value === "string") return value;
    if (!value || typeof value !== "object") return "";
    const record = value as Record<string, unknown>;
    if (typeof record._serialized === "string") return record._serialized;
    if (typeof record.serialized === "string") return record.serialized;
    if (typeof record.user === "string" && typeof record.server === "string") return `${record.user}@${record.server}`;
    return "";
  };
  const discoveredGroupId = (group: DiscoveredGroup) => discoveredValue(group.id) || discoveredValue(group.groupId) || discoveredValue(group.groupMetadata?.id);
  const discoveredGroupName = (group: DiscoveredGroup) => group.subject ?? group.name ?? group.groupMetadata?.subject ?? discoveredGroupId(group);

  function next() {
    setStep((value) => Math.min(value + 1, steps.length - 1));
  }

  function previous() {
    setStep((value) => Math.max(value - 1, 0));
  }

  return <section className="surface-card rounded-2xl p-5 sm:p-6">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h2 className="text-lg font-bold text-slate-950">Whitelist WhatsApp</h2><p className="mt-1 max-w-2xl text-sm text-slate-500">Ikuti empat langkah untuk menghubungkan session, mengaktifkan grup, memetakan kontak, lalu memastikan konfigurasi siap dipakai.</p></div>
      <MessageCircle className="size-5 text-blue-600" />
    </div>
    <nav aria-label="Langkah whitelist WhatsApp" className="mt-6 grid gap-2 sm:grid-cols-4">
      {steps.map(([value, label, Icon], index) => <button type="button" key={value} onClick={() => index <= step && setStep(index)} className={`flex items-center gap-2 rounded-xl border px-3 py-3 text-left text-sm ${index === step ? "border-blue-300 bg-blue-50 text-blue-900" : index < step ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-slate-200 text-slate-500"}`}><span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-white text-xs font-bold shadow-sm">{index < step ? <Check className="size-4" /> : index + 1}</span><span><span className="block text-xs text-current/70">Langkah {index + 1}</span><span className="font-semibold">{label}</span></span><Icon className="ml-auto hidden size-4 sm:block" /></button>)}
    </nav>
    <div className="mt-6 min-h-72">
      {step === 0 && <div className="space-y-5"><div className="rounded-xl border border-blue-100 bg-blue-50 p-4"><p className="font-semibold text-blue-950">1. Hubungkan nomor operasional</p><p className="mt-1 text-sm leading-6 text-blue-800">Simpan session WAHA, mulai session, lalu pindai QR. Chat pribadi tetap tidak diproses.</p></div><div className="flex flex-col gap-2 sm:flex-row"><Input aria-label="ID sesi WAHA" placeholder="Masukkan nama session" value={props.session} onChange={(event) => props.setSession(event.target.value)} /><Button onClick={props.onCreate} disabled={props.busy === "create"} className="cta-primary">{props.busy === "create" ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />} Simpan koneksi</Button></div><div className="grid gap-3 lg:grid-cols-2">{props.data.connections.map((item) => { const retired = item.status === "retired"; return <div key={item.id} className={`rounded-xl border p-4 ${props.selected === item.id ? "border-blue-300 bg-blue-50/50" : "border-slate-200"}`}><button type="button" onClick={() => props.onSelect(item.id)} className="flex w-full items-start justify-between gap-3 text-left"><span><span className="block font-semibold">{item.session_id || "Session tanpa nama"}</span><span className="mt-1 block text-xs text-slate-500">{item.provider} · {retired ? "Retired" : item.last_health_check_at ? `Dicek ${new Date(item.last_health_check_at).toLocaleString("id-ID")}` : "Belum dicek"}</span></span><Status value={item.status} /></button>{!retired && <div className="mt-3 flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={() => props.onQr(item)} disabled={props.busy === `qr-${item.id}`}><QrCode className="size-4" /> QR</Button><Button size="sm" variant="outline" onClick={() => props.onStart(item.id)}><Wifi className="size-4" /> Mulai</Button><Button size="sm" variant="ghost" onClick={() => props.onHealth(item.id)}><RefreshCw className="size-4" /> Cek status</Button><Button size="sm" variant="destructive" onClick={() => props.onRetire(item)}><XCircle className="size-4" /> Retire</Button></div>}</div>; })}</div><div className="flex min-h-48 items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50">{props.qrUrl ? <Image src={props.qrUrl} alt="QR WhatsApp untuk dipindai" width={192} height={192} unoptimized /> : <div className="text-center"><QrCode className="mx-auto size-9 text-slate-300" /><p className="mt-2 text-sm text-slate-600">Pilih koneksi, lalu tampilkan QR.</p></div>}</div></div>}
      {step === 1 && <div className="space-y-5"><div className="rounded-xl border border-emerald-100 bg-emerald-50 p-4"><p className="font-semibold text-emerald-950">2. Pilih grup yang boleh diproses</p><p className="mt-1 text-sm leading-6 text-emerald-800">Hanya grup yang diaktifkan di sini yang dapat masuk ke sistem.</p></div><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="font-semibold">{connection?.session_id || "Pilih koneksi terlebih dahulu"}</p><p className="text-sm text-slate-500">{groups.length} grup terdaftar pada koneksi ini.</p></div><Button variant="outline" onClick={props.onDiscoverGroups} disabled={!connection || props.busy === "discover-groups"}>{props.busy === "discover-groups" ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />} Muat grup dari WAHA</Button></div>{props.discoveredGroups.length > 0 && <select aria-label="Grup WhatsApp ditemukan" value={props.providerGroupId} onChange={(event) => { props.setProviderGroupId(event.target.value); const found = props.discoveredGroups.find((item) => discoveredGroupId(item) === event.target.value); props.setGroupName(found ? discoveredGroupName(found) : ""); void props.onDiscoverParticipants(event.target.value); }} className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"><option value="">Pilih grup yang ditemukan</option>{props.discoveredGroups.map((item) => <option key={discoveredGroupId(item)} value={discoveredGroupId(item)}>{discoveredGroupName(item)}</option>)}</select>}<div className="grid gap-3 sm:grid-cols-2"><Input aria-label="Nama grup WhatsApp" placeholder="Nama grup" value={props.groupName} onChange={(event) => props.setGroupName(event.target.value)} /><select aria-label="Cakupan client grup" value={props.selectedClientId ?? ""} onChange={(event) => props.onClientChange(event.target.value || null)} className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm"><option value="">Seluruh organisasi</option>{props.clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}</select></div><div className="flex flex-wrap gap-2"><Button onClick={props.onAddGroup} disabled={!connection || !props.providerGroupId.trim() || props.busy === "group"} className="cta-primary"><Plus className="size-4" /> Aktifkan grup</Button><Button variant="outline" onClick={next} disabled={groups.length === 0}>Lanjut ke kontak <ChevronRight className="size-4" /></Button></div><div className="grid gap-2 sm:grid-cols-2">{groups.map((group) => <button type="button" key={group.id} onClick={() => props.setGroupId(group.id)} className={`rounded-xl border p-4 text-left ${group.id === props.groupId ? "border-blue-300 bg-blue-50" : "border-slate-200"}`}><span className="font-semibold">{group.group_name || group.provider_group_id}</span><span className="mt-1 block text-xs text-slate-500">{groupClientName(group.client_id)} · {group.is_active ? "Aktif" : "Nonaktif"}</span></button>)}</div></div>}
      {step === 2 && <div className="space-y-5"><div className="rounded-xl border border-violet-100 bg-violet-50 p-4"><p className="font-semibold text-violet-950">3. Petakan kontak ke anggota aplikasi</p><p className="mt-1 text-sm leading-6 text-violet-800">Pilih identitas yang sudah diverifikasi. Nama ambigu tidak boleh ditebak.</p></div><select aria-label="Grup untuk pemetaan" value={props.groupId} onChange={(event) => props.setGroupId(event.target.value)} className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"><option value="">Pilih grup aktif</option>{groups.map((group) => <option key={group.id} value={group.id}>{group.group_name || group.provider_group_id}</option>)}</select>{props.discoveredParticipants.length > 0 && <select aria-label="Kontak WhatsApp ditemukan" value={props.participantId} onChange={(event) => { props.setParticipantId(event.target.value); const found = props.discoveredParticipants.find((item) => discoveredValue(item.id) === event.target.value || discoveredValue(item.lid) === event.target.value); props.setParticipantName(found?.displayName ?? found?.name ?? found?.phone ?? ""); }} className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"><option value="">Pilih kontak dari WAHA</option>{props.discoveredParticipants.map((item) => { const id = discoveredValue(item.id) || discoveredValue(item.lid) || item.phone || ""; return <option key={id} value={id}>{item.displayName ?? item.name ?? item.phone ?? id}</option>; })}</select>}<div className="grid gap-3 sm:grid-cols-2"><Input aria-label="Participant ID" placeholder="Participant ID" value={props.participantId} onChange={(event) => props.setParticipantId(event.target.value)} /><select aria-label="Anggota aplikasi" value={props.participantProfile} onChange={(event) => props.setParticipantProfile(event.target.value)} className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm"><option value="">Pilih anggota aplikasi</option>{props.members.map((member) => <option key={member.profile_id} value={member.profile_id}>{member.name}</option>)}</select></div><Input aria-label="Nama kontak" placeholder="Nama kontak (opsional)" value={props.participantName} onChange={(event) => props.setParticipantName(event.target.value)} /><div className="flex flex-wrap gap-2"><Button onClick={props.onAddMapping} disabled={!props.groupId || !props.participantId || !props.participantProfile || props.busy === "mapping"} className="cta-primary"><Plus className="size-4" /> Verifikasi kontak</Button><Button variant="outline" onClick={next} disabled={mappings.length === 0}>Lanjut ke review <ChevronRight className="size-4" /></Button></div><div className="space-y-2">{mappings.map((mapping) => <div key={mapping.id} className="rounded-lg border border-emerald-100 bg-emerald-50 p-3 text-sm">{mapping.display_name || mapping.provider_participant_id} · {mapping.is_verified ? "Terverifikasi" : "Menunggu verifikasi"}</div>)}</div></div>}
      {step === 3 && <div className="space-y-5"><div className="rounded-xl border border-emerald-100 bg-emerald-50 p-4"><p className="font-semibold text-emerald-950">4. Review sebelum digunakan</p><p className="mt-1 text-sm leading-6 text-emerald-800">Pastikan session benar, grup aktif, dan kontak sudah terhubung ke anggota yang tepat.</p></div><div className="grid gap-3 sm:grid-cols-3"><Review icon={Link2} label="Koneksi" value={connection?.session_id || "Belum dipilih"} /><Review icon={MessageCircle} label="Grup aktif" value={selectedGroup?.group_name || "Belum dipilih"} /><Review icon={Users} label="Kontak terpetakan" value={`${mappings.length}`} /></div><div className="rounded-xl border border-slate-200 p-4 text-sm"><p className="font-semibold">Cakupan data</p><p className="mt-1 text-slate-600">{selectedGroup ? groupClientName(selectedGroup.client_id) : "Belum ada grup yang dipilih"}</p><p className="mt-3 text-xs leading-5 text-slate-500">Pesan dari grup lain tetap diabaikan. Session retired tidak dapat diaktifkan kembali.</p></div></div>}
    </div>
    <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4"><Button variant="outline" onClick={previous} disabled={step === 0}><ChevronLeft className="size-4" /> Kembali</Button><div className="flex gap-2"><Button variant="ghost" onClick={() => setAdvanced((value) => !value)}>{advanced ? "Sembunyikan opsi lanjutan" : "Opsi lanjutan"}</Button>{step < steps.length - 1 && <Button onClick={next} disabled={step === 0 ? !connection : step === 1 ? !props.groupId : mappings.length === 0} className="cta-primary">Lanjut <ChevronRight className="size-4" /></Button>}</div></div>
    {advanced && <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-600"><div className="flex items-center gap-2 font-semibold text-slate-800"><Database className="size-4" /> Informasi teknis</div><p className="mt-2">ID teknis hanya digunakan untuk troubleshooting dan tetap dikirim melalui endpoint administrasi yang sama.</p><p className="mt-1">Connection: {connection?.id || "-"} · Group: {selectedGroup?.id || "-"}</p></div>}
  </section>;
}

function Status({ value }: { value: string }) { const healthy = ["connected", "working", "healthy"].includes(value.toLowerCase()); return <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${healthy ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>{value}</span>; }
function Review({ icon: Icon, label, value }: { icon: typeof Link2; label: string; value: string }) { return <div className="rounded-xl border border-slate-200 p-4"><Icon className="size-5 text-blue-600" /><p className="mt-3 text-xs text-slate-500">{label}</p><p className="mt-1 truncate font-semibold text-slate-900">{value}</p></div>; }
