"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type EditableWorkItem = { id: string; title: string; description: string | null; due_at: string | null; checklist_template_id: string | null };
type ChecklistOption = { id: string; name: string; target_role: string };

export function EditWorkItemDialog({ open, onOpenChange, workItem, onSaved }: { open: boolean; onOpenChange: (open: boolean) => void; workItem: EditableWorkItem; onSaved: () => void }) {
  const [title, setTitle] = useState(workItem.title);
  const [description, setDescription] = useState(workItem.description ?? "");
  const [dueAt, setDueAt] = useState(workItem.due_at?.slice(0, 16) ?? "");
  const [checklistTemplateId, setChecklistTemplateId] = useState(workItem.checklist_template_id ?? "");
  const [checklistTemplates, setChecklistTemplates] = useState<ChecklistOption[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setTitle(workItem.title);
    setDescription(workItem.description ?? "");
    setDueAt(workItem.due_at?.slice(0, 16) ?? "");
    setChecklistTemplateId(workItem.checklist_template_id ?? "");
    void fetch("/api/checklist-templates").then((response) => response.ok ? response.json() : null).then((body) => setChecklistTemplates(body?.data ?? [])).catch(() => setChecklistTemplates([]));
  }, [open, workItem]);

  async function save() {
    setSaving(true);
    setError(null);
    const response = await fetch(`/api/work-items/${workItem.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title, description: description || null, due_at: dueAt ? new Date(dueAt).toISOString() : null, checklist_template_id: checklistTemplateId || null }) });
    const body = await response.json().catch(() => null);
    if (!response.ok) setError(body?.error ?? "Gagal menyimpan."); else { onOpenChange(false); onSaved(); }
    setSaving(false);
  }

  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent><DialogHeader><DialogTitle>Edit work item</DialogTitle></DialogHeader><div className="space-y-3"><Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Judul" /><Input value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Deskripsi" /><Input type="datetime-local" value={dueAt} onChange={(event) => setDueAt(event.target.value)} /><div className="space-y-1.5"><Label htmlFor="edit-wi-checklist">Checklist SOP</Label><Select value={checklistTemplateId || "none"} onValueChange={(value) => setChecklistTemplateId(value === "none" ? "" : value ?? "")}><SelectTrigger id="edit-wi-checklist"><SelectValue placeholder="Tanpa checklist" /></SelectTrigger><SelectContent><SelectItem value="none">Tanpa checklist</SelectItem>{checklistTemplates.map((template) => <SelectItem key={template.id} value={template.id}>{template.name} · {template.target_role}</SelectItem>)}</SelectContent></Select></div>{error && <p className="text-sm text-red-600">{error}</p>}</div><DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Batal</Button><Button onClick={save} disabled={saving || !title.trim()}>Simpan</Button></DialogFooter></DialogContent></Dialog>;
}
