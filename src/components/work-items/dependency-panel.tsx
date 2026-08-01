"use client";

import { useCallback, useEffect, useState } from "react";
import { Link2, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

type Dependency = { id: string; depends_on_id: string; dependency_type: string; depends_on?: { title: string; status: string } };
export function DependencyPanel({ workItemId }: { workItemId: string }) {
  const [items, setItems] = useState<Dependency[]>([]); const [dependencyId, setDependencyId] = useState(""); const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => { const response = await fetch(`/api/work-items/${workItemId}/dependencies`); const body = await response.json(); if (response.ok) setItems(body.data ?? []); else setError(body.error ?? "Gagal memuat dependency."); }, [workItemId]);
  useEffect(() => { queueMicrotask(() => { void load(); }); }, [load]);
  async function add() { setBusy(true); setError(null); const response = await fetch(`/api/work-items/${workItemId}/dependencies`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ depends_on_id: dependencyId }) }); const body = await response.json().catch(() => null); if (!response.ok) setError(body?.error ?? "Gagal menambah dependency."); else { setDependencyId(""); await load(); } setBusy(false); }
  async function remove(id: string) { setBusy(true); await fetch(`/api/work-items/${workItemId}/dependencies`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ dependency_id: id }) }); await load(); setBusy(false); }
  return <div className="space-y-3"><div className="flex gap-2"><Input value={dependencyId} onChange={(event) => setDependencyId(event.target.value)} placeholder="ID work item prerequisite" /><Button onClick={add} disabled={busy || !dependencyId}><Link2 className="size-4" /> Tambah</Button></div>{items.length === 0 ? <p className="text-sm text-slate-400">Belum ada dependency.</p> : items.map((item) => <div key={item.id} className="flex items-center gap-2 rounded-lg border border-slate-100 p-3"><div className="flex-1"><p className="text-sm font-medium">{item.depends_on?.title ?? item.depends_on_id}</p><p className="text-xs text-slate-500">{item.dependency_type} · {item.depends_on?.status ?? ""}</p></div><Tooltip><TooltipTrigger render={<Button variant="ghost" size="icon-sm" disabled={busy} onClick={() => remove(item.id)} aria-label="Hapus dependency" />}>{busy ? <Loader2 className="size-4 animate-spin" /> : <X className="size-4 text-red-500" />}</TooltipTrigger><TooltipContent>Hapus dependency</TooltipContent></Tooltip></div>)}{error && <p className="text-sm text-red-600">{error}</p>}</div>;
}
