"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Loader2, Link, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { ClientSelect } from "@/components/shared/client-select";

interface CreateProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

interface WorkItemOption {
  id: string;
  title: string;
  status: string;
}

type Mode = "link" | "new";

export function CreateProjectDialog({
  open,
  onOpenChange,
  onSuccess,
}: CreateProjectDialogProps) {
  const [mode, setMode] = useState<Mode>("new");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Option A: Link existing
  const [workItems, setWorkItems] = useState<WorkItemOption[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);
  const [selectedWorkItemId, setSelectedWorkItemId] = useState("");

  // Option B: Create new
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [clientId, setClientId] = useState("");

  // Common project fields
  const [objective, setObjective] = useState("");
  const [successCriteria, setSuccessCriteria] = useState("");
  const [startDate, setStartDate] = useState("");
  const [targetDate, setTargetDate] = useState("");
  const [budgetedHours, setBudgetedHours] = useState("");

  // Fetch work items for Option A
  useEffect(() => {
    if (!open || mode !== "link") return;

    let cancelled = false;
    async function fetchItems() {
      setLoadingItems(true);
      try {
        const res = await fetch("/api/work-items?limit=100&type=project");
        if (!res.ok) return;
        const body = await res.json();
        if (!cancelled) {
          setWorkItems(
            (body.data ?? []).map((w: { id: string; title: string; status: string }) => ({
              id: w.id,
              title: w.title,
              status: w.status,
            }))
          );
        }
      } catch {
        // ignore
      } finally {
        if (!cancelled) setLoadingItems(false);
      }
    }
    fetchItems();
    return () => {
      cancelled = true;
    };
  }, [open, mode]);

  function resetForm() {
    setMode("new");
    setSelectedWorkItemId("");
    setTitle("");
    setDescription("");
    setClientId("");
    setObjective("");
    setSuccessCriteria("");
    setStartDate("");
    setTargetDate("");
    setBudgetedHours("");
    setError(null);
  }

  function handleClose(value: boolean) {
    if (!value) resetForm();
    onOpenChange(value);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (mode === "new") {
      if (!title.trim()) {
        setError("Judul wajib diisi.");
        return;
      }
      if (!clientId) {
        setError("Client wajib dipilih.");
        return;
      }
    } else {
      if (!selectedWorkItemId) {
        setError("Pilih work item yang akan dijadikan proyek.");
        return;
      }
    }

    setSubmitting(true);
    try {
      const body: Record<string, unknown> = {};

      if (mode === "link") {
        body.work_item_id = selectedWorkItemId;
      } else {
        body.title = title.trim();
        body.description = description.trim() || undefined;
        body.client_id = clientId;
      }

      if (objective.trim()) body.objective = objective.trim();
      if (successCriteria.trim()) body.success_criteria = successCriteria.trim();
      if (startDate) body.start_date = new Date(startDate).toISOString();
      if (targetDate) body.target_date = new Date(targetDate).toISOString();
      if (budgetedHours) body.budgeted_hours = parseFloat(budgetedHours);

      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? "Gagal membuat project.");
      }

      handleClose(false);
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Terjadi kesalahan.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Buat Proyek Baru</DialogTitle>
          <DialogDescription>
            Buat proyek baru atau hubungkan work item yang sudah ada.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Mode toggle */}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                setMode("new");
                setError(null);
              }}
              className={cn(
                "flex-1 flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors",
                mode === "new"
                  ? "border-blue-500 bg-blue-50 text-blue-700"
                  : "border-slate-200 bg-white text-slate-500 hover:border-slate-300"
              )}
            >
              <Plus className="size-4" />
              Buat Baru
            </button>
            <button
              type="button"
              onClick={() => {
                setMode("link");
                setError(null);
              }}
              className={cn(
                "flex-1 flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors",
                mode === "link"
                  ? "border-blue-500 bg-blue-50 text-blue-700"
                  : "border-slate-200 bg-white text-slate-500 hover:border-slate-300"
              )}
            >
              <Link className="size-4" />
              Link Work Item
            </button>
          </div>

          {/* Option A: Link existing */}
          {mode === "link" && (
            <div className="space-y-1.5">
              <Label htmlFor="proj-link">
                Pilih Work Item <span className="text-red-500">*</span>
              </Label>
              {loadingItems ? (
                <div className="flex items-center gap-2 text-sm text-slate-400 py-2">
                  <Loader2 className="size-4 animate-spin" />
                  Memuat work items...
                </div>
              ) : (
                <Select
                  value={selectedWorkItemId || null}
                  onValueChange={(val) => {
                    setSelectedWorkItemId(val as string);
                    setError(null);
                  }}
                >
                  <SelectTrigger id="proj-link" className="w-full">
                    <SelectValue placeholder="Pilih work item..." />
                  </SelectTrigger>
                  <SelectContent>
                    {workItems.length === 0 ? (
                      <div className="px-3 py-2 text-sm text-slate-400">
                        Tidak ada work item tersedia
                      </div>
                    ) : (
                      workItems.map((wi) => (
                        <SelectItem key={wi.id} value={wi.id}>
                          {wi.title}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              )}
              <p className="text-[11px] text-slate-400">
                Hanya work item bertipe &quot;Proyek&quot; yang tersedia.
              </p>
            </div>
          )}

          {/* Option B: Create new */}
          {mode === "new" && (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="proj-title">
                  Judul <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="proj-title"
                  placeholder="Contoh: Migrasi Sistem Akuntansi"
                  value={title}
                  onChange={(e) => {
                    setTitle(e.currentTarget.value);
                    setError(null);
                  }}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="proj-desc">Deskripsi</Label>
                <textarea
                  id="proj-desc"
                  rows={3}
                  placeholder="Jelaskan proyek secara detail..."
                  value={description}
                  onChange={(e) => setDescription(e.currentTarget.value)}
                  className="flex w-full rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 resize-none"
                />
              </div>

              <ClientSelect
                id="proj-client"
                value={clientId}
                onChange={(value) => {
                  setClientId(value);
                  setError(null);
                }}
              />
            </>
          )}

          {/* Common project fields */}
          <div className="border-t border-slate-100 pt-4 space-y-4">
            <p className="text-[12px] font-medium text-slate-500 uppercase tracking-wider">
              Detail Proyek
            </p>

            <div className="space-y-1.5">
              <Label htmlFor="proj-objective">Tujuan (Objective)</Label>
              <textarea
                id="proj-objective"
                rows={2}
                placeholder="Apa tujuan utama proyek ini?"
                value={objective}
                onChange={(e) => setObjective(e.currentTarget.value)}
                className="flex w-full rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 resize-none"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="proj-criteria">Kriteria Keberhasilan</Label>
              <textarea
                id="proj-criteria"
                rows={2}
                placeholder="Bagaimana mengukur keberhasilan proyek?"
                value={successCriteria}
                onChange={(e) => setSuccessCriteria(e.currentTarget.value)}
                className="flex w-full rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 resize-none"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="proj-start">Tanggal Mulai</Label>
                <Input
                  id="proj-start"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.currentTarget.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="proj-target">Target Selesai</Label>
                <Input
                  id="proj-target"
                  type="date"
                  value={targetDate}
                  onChange={(e) => setTargetDate(e.currentTarget.value)}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="proj-hours">Jam yang Dibudgetkan</Label>
              <Input
                id="proj-hours"
                type="number"
                min="0"
                step="0.5"
                placeholder="0"
                value={budgetedHours}
                onChange={(e) => setBudgetedHours(e.currentTarget.value)}
              />
            </div>
          </div>

          {/* Error message */}
          {error && (
            <p className="text-sm text-red-500 bg-red-50 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          {/* Footer */}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleClose(false)}
              disabled={submitting}
            >
              Batal
            </Button>
            <Button
              type="submit"
              disabled={submitting}
              className="bg-orange-500 hover:bg-orange-600 text-white font-bold"
            >
              {submitting ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Membuat...
                </>
              ) : (
                "Buat Proyek"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
