"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

export function EditWorkItemDialog({ open, onOpenChange, workItem, onSaved }: { open: boolean; onOpenChange: (open: boolean) => void; workItem: { id: string; title: string; description: string | null; due_at: string | null }; onSaved: () => void }) {
  const [title, setTitle] = useState(workItem.title); const [description, setDescription] = useState(workItem.description ?? ""); const [dueAt, setDueAt] = useState(workItem.due_at?.slice(0, 16) ?? ""); const [saving, setSaving] = useState(false); const [error, setError] = useState<string | null>(null);
  async function save() { setSaving(true); setError(null); const response = await fetch(`/api/work-items/${workItem.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title, description: description || null, due_at: dueAt ? new Date(dueAt).toISOString() : null }) }); const body = await response.json().catch(() => null); if (!response.ok) setError(body?.error ?? "Gagal menyimpan."); else { onOpenChange(false); onSaved(); } setSaving(false); }
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent><DialogHeader><DialogTitle>Edit work item</DialogTitle></DialogHeader><div className="space-y-3"><Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Judul" /><Input value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Deskripsi" /><Input type="datetime-local" value={dueAt} onChange={(event) => setDueAt(event.target.value)} />{error && <p className="text-sm text-red-600">{error}</p>}</div><DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Batal</Button><Button onClick={save} disabled={saving || !title.trim()}>Simpan</Button></DialogFooter></DialogContent></Dialog>;
}
