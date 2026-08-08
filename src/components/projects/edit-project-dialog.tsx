"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";

interface EditProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: {
    id: string;
    objective: string | null;
    success_criteria: string | null;
    start_date: string | null;
    target_date: string | null;
    budgeted_hours: number | null;
  };
  onSaved: () => void;
}

export function EditProjectDialog({ open, onOpenChange, project, onSaved }: EditProjectDialogProps) {
  const [objective, setObjective] = useState("");
  const [criteria, setCriteria] = useState("");
  const [startDate, setStartDate] = useState("");
  const [targetDate, setTargetDate] = useState("");
  const [hours, setHours] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const reset = () => {
      setObjective(project.objective ?? "");
      setCriteria(project.success_criteria ?? "");
      setStartDate(project.start_date?.slice(0, 10) ?? "");
      setTargetDate(project.target_date?.slice(0, 10) ?? "");
      setHours(project.budgeted_hours?.toString() ?? "");
      setError(null);
    };
    queueMicrotask(reset);
  }, [open, project]);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/projects/${project.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          objective: objective.trim() || null,
          success_criteria: criteria.trim() || null,
          start_date: startDate || null,
          target_date: targetDate || null,
          budgeted_hours: hours ? Number(hours) : null,
        }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error ?? "Gagal menyimpan proyek.");
      onOpenChange(false);
      onSaved();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Gagal menyimpan proyek.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit detail proyek</DialogTitle>
          <DialogDescription>Perbarui tujuan, target waktu, dan budget proyek.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5"><Label htmlFor="project-objective">Tujuan proyek</Label><Input id="project-objective" value={objective} onChange={(event) => setObjective(event.target.value)} placeholder="Apa hasil utama yang ingin dicapai?" /></div>
          <div className="space-y-1.5"><Label htmlFor="project-criteria">Kriteria keberhasilan</Label><Input id="project-criteria" value={criteria} onChange={(event) => setCriteria(event.target.value)} placeholder="Bagaimana proyek dinyatakan berhasil?" /></div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5"><Label htmlFor="project-start">Tanggal mulai</Label><Input id="project-start" type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} /></div>
            <div className="space-y-1.5"><Label htmlFor="project-target">Target selesai</Label><Input id="project-target" type="date" value={targetDate} onChange={(event) => setTargetDate(event.target.value)} /></div>
          </div>
          <div className="space-y-1.5"><Label htmlFor="project-hours">Budget jam</Label><Input id="project-hours" type="number" min="0" value={hours} onChange={(event) => setHours(event.target.value)} placeholder="Contoh: 40" /></div>
          {error && <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Batal</Button>
          <Button onClick={save} disabled={saving} className="cta-primary">{saving ? <><Loader2 className="size-4 animate-spin" /> Menyimpan...</> : "Simpan perubahan"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
