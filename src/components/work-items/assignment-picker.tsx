"use client";

import { useEffect, useState } from "react";
import { Loader2, UserPlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Assignment } from "@/types/work-item";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

type Member = { profile_id: string; name: string; email: string | null };
export function AssignmentPicker({ workItemId, assignments, onChanged }: { workItemId: string; assignments: Assignment[]; onChanged: () => void }) {
  const [members, setMembers] = useState<Member[]>([]);
  const [profileId, setProfileId] = useState("");
  const [role, setRole] = useState("maker");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { fetch("/api/assignment-members").then((response) => response.json()).then((body) => setMembers(body.data ?? [])); }, []);
  async function assign() {
    if (!profileId) return;
    setBusy(true); setError(null);
    const response = await fetch(`/api/work-items/${workItemId}/assign`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ profile_id: profileId, role }) });
    const body = await response.json().catch(() => null);
    if (!response.ok) setError(body?.error ?? "Gagal melakukan assignment."); else { setProfileId(""); onChanged(); }
    setBusy(false);
  }
  async function remove(assignment: Assignment) {
    setBusy(true); setError(null);
    const response = await fetch(`/api/work-items/${workItemId}/assign`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ assignment_id: assignment.id, reason }) });
    const body = await response.json().catch(() => null);
    if (!response.ok) setError(body?.error ?? "Gagal membatalkan assignment."); else { setReason(""); onChanged(); }
    setBusy(false);
  }
  return <div className="space-y-3">
    {assignments.map((assignment) => <div key={assignment.id} className="flex items-center gap-2 rounded-lg border border-slate-100 p-2"><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium text-slate-800">{assignment.profile_name ?? assignment.profile_id}</p><p className="text-xs text-slate-500">{assignment.role}</p></div><Tooltip><TooltipTrigger render={<Button variant="ghost" size="icon-sm" disabled={busy} onClick={() => remove(assignment)} aria-label={`Hapus assignment ${assignment.profile_name ?? assignment.profile_id}`} />}><X className="size-4 text-red-500" /></TooltipTrigger><TooltipContent>Hapus assignment</TooltipContent></Tooltip></div>)}
    <div className="grid gap-2 sm:grid-cols-[1fr_140px_auto]"><Select value={profileId} onValueChange={(value) => setProfileId(value ?? "")}><SelectTrigger><SelectValue placeholder="Pilih anggota" /></SelectTrigger><SelectContent>{members.map((member) => <SelectItem key={member.profile_id} value={member.profile_id}>{member.name}</SelectItem>)}</SelectContent></Select><Select value={role} onValueChange={(value) => setRole(value ?? "maker")}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="maker">Maker</SelectItem><SelectItem value="checker">Checker</SelectItem><SelectItem value="approver">Approver</SelectItem></SelectContent></Select><Button onClick={assign} disabled={busy || !profileId}>{busy ? <Loader2 className="size-4 animate-spin" /> : <UserPlus className="size-4" />} Assign</Button></div>
    <Input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Alasan reassign (opsional)" />
    {error && <p className="text-sm text-red-600">{error}</p>}
  </div>;
}
