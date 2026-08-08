"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  CheckCircle2,
  Circle,
  Plus,
  Edit,
  Trash2,
  Loader2,
  Calendar,
  Flag,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Milestone } from "@/types/project";
import { usePermissions } from "@/hooks/use-permissions";

interface MilestoneListProps {
  projectId: string;
  onChanged?: () => void;
}

export function MilestoneList({ projectId, onChanged }: MilestoneListProps) {
  const { has } = usePermissions();
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Add form
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [addName, setAddName] = useState("");
  const [addDescription, setAddDescription] = useState("");
  const [addDueDate, setAddDueDate] = useState("");
  const [addSubmitting, setAddSubmitting] = useState(false);

  // Edit form
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editDueDate, setEditDueDate] = useState("");
  const [editSubmitting, setEditSubmitting] = useState(false);

  // Delete
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchMilestones = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/milestones`);
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? "Gagal memuat milestones.");
      }
      const body = await res.json();
      setMilestones(body.data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Terjadi kesalahan.");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    queueMicrotask(() => fetchMilestones());
  }, [fetchMilestones]);

  // Toggle completion
  async function handleToggle(milestone: Milestone) {
    const newValue = !milestone.is_completed;
    // Optimistic update
    setMilestones((prev) =>
      prev.map((m) =>
        m.id === milestone.id
          ? {
              ...m,
              is_completed: newValue,
              completed_at: newValue ? new Date().toISOString() : null,
            }
          : m
      )
    );

    try {
      const res = await fetch(
        `/api/projects/${projectId}/milestones/${milestone.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ is_completed: newValue }),
        }
      );
      if (!res.ok) {
        // Revert on error
        setMilestones((prev) =>
          prev.map((m) =>
            m.id === milestone.id
              ? {
                  ...m,
                  is_completed: !newValue,
                  completed_at: milestone.completed_at,
                }
              : m
          )
        );
      }
      onChanged?.();
    } catch {
      // Revert on error
      setMilestones((prev) =>
        prev.map((m) =>
          m.id === milestone.id
            ? {
                ...m,
                is_completed: !newValue,
                completed_at: milestone.completed_at,
              }
            : m
        )
      );
    }
  }

  // Add milestone
  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!addName.trim()) return;

    setAddSubmitting(true);
    try {
      const body: Record<string, unknown> = {
        name: addName.trim(),
        sort_order: milestones.length,
      };
      if (addDescription.trim()) body.description = addDescription.trim();
      if (addDueDate) body.due_date = new Date(addDueDate).toISOString();

      const res = await fetch(`/api/projects/${projectId}/milestones`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? "Gagal menambahkan milestone.");
      }

      setAddDialogOpen(false);
      setAddName("");
      setAddDescription("");
      setAddDueDate("");
      await fetchMilestones();
      onChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menambahkan milestone.");
    } finally {
      setAddSubmitting(false);
    }
  }

  // Start edit
  function startEdit(milestone: Milestone) {
    setEditId(milestone.id);
    setEditName(milestone.name);
    setEditDescription(milestone.description ?? "");
    setEditDueDate(
      milestone.due_date ? milestone.due_date.slice(0, 10) : ""
    );
  }

  // Save edit
  async function handleEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editId || !editName.trim()) return;

    setEditSubmitting(true);
    try {
      const body: Record<string, unknown> = { name: editName.trim() };
      if (editDescription.trim()) {
        body.description = editDescription.trim();
      } else {
        body.description = null;
      }
      body.due_date = editDueDate
        ? new Date(editDueDate).toISOString()
        : null;

      const res = await fetch(
        `/api/projects/${projectId}/milestones/${editId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      );

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? "Gagal mengupdate milestone.");
      }

      setEditId(null);
      await fetchMilestones();
      onChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal mengupdate milestone.");
    } finally {
      setEditSubmitting(false);
    }
  }

  // Delete milestone
  async function handleDelete(milestoneId: string) {
    setDeletingId(milestoneId);
    try {
      const res = await fetch(
        `/api/projects/${projectId}/milestones/${milestoneId}`,
        { method: "DELETE" }
      );

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? "Gagal menghapus milestone.");
      }

      await fetchMilestones();
      onChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menghapus milestone.");
    } finally {
      setDeletingId(null);
    }
  }

  function formatDueDate(iso: string | null): string {
    if (!iso) return "";
    return new Date(iso).toLocaleDateString("id-ID", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="size-5 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-sm font-medium text-slate-900">
          Milestone ({milestones.length})
        </h3>
        {has("work_items.manage") && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setAddDialogOpen(true)}
          >
            <Plus className="size-3.5" />
            Tambah Milestone
          </Button>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-600">
          {error}
        </div>
      )}

      {/* Milestone list */}
      {milestones.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <Flag className="size-8 text-slate-300 mb-2" />
          <p className="text-sm text-slate-400">Belum ada milestone.</p>
          <p className="text-[12px] text-slate-300 mt-1">
            Tambahkan milestone untuk melacak progres proyek.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {milestones.map((milestone) => (
            <div key={milestone.id}>
              {editId === milestone.id ? (
                /* Edit form */
                <form onSubmit={handleEdit} className="rounded-lg border border-blue-200 bg-blue-50/50 p-3 space-y-3">
                  <div className="space-y-1.5">
                    <Label htmlFor={`edit-name-${milestone.id}`} className="text-[12px]">
                      Nama
                    </Label>
                    <Input
                      id={`edit-name-${milestone.id}`}
                      value={editName}
                      onChange={(e) => setEditName(e.currentTarget.value)}
                      className="h-8 text-sm"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor={`edit-desc-${milestone.id}`} className="text-[12px]">
                      Deskripsi
                    </Label>
                    <Input
                      id={`edit-desc-${milestone.id}`}
                      value={editDescription}
                      onChange={(e) => setEditDescription(e.currentTarget.value)}
                      className="h-8 text-sm"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor={`edit-date-${milestone.id}`} className="text-[12px]">
                      Tanggal Jatuh Tempo
                    </Label>
                    <Input
                      id={`edit-date-${milestone.id}`}
                      type="date"
                      value={editDueDate}
                      onChange={(e) => setEditDueDate(e.currentTarget.value)}
                      className="h-8 text-sm"
                    />
                  </div>
                  <div className="flex gap-2 justify-end">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setEditId(null)}
                      disabled={editSubmitting}
                    >
                      Batal
                    </Button>
                    <Button
                      type="submit"
                      size="sm"
                      disabled={editSubmitting || !editName.trim()}
                      className="bg-orange-500 hover:bg-orange-600 text-white font-bold"
                    >
                      {editSubmitting ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        "Simpan"
                      )}
                    </Button>
                  </div>
                </form>
              ) : (
                /* Display row */
                <div
                  className={cn(
                    "group flex items-start gap-3 rounded-xl border p-3.5 transition-colors focus-within:border-blue-200",
                    milestone.is_completed
                      ? "bg-emerald-50/50 border-emerald-100"
                      : "bg-white border-slate-100 hover:border-slate-200"
                  )}
                >
                  {/* Checkbox */}
                  <button
                    type="button"
                    onClick={() => handleToggle(milestone)}
                    disabled={!has("work_items.manage") && !has("work_items.execute")}
                    className={cn(
                      "mt-0.5 shrink-0 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500",
                      (!has("work_items.manage") && !has("work_items.execute")) && "cursor-not-allowed opacity-50"
                    )}
                    aria-label={milestone.is_completed ? `Tandai ${milestone.name} belum selesai` : `Tandai ${milestone.name} selesai`}
                  >
                    {milestone.is_completed ? (
                      <CheckCircle2 className="size-5 text-emerald-500" />
                    ) : (
                      <Circle className="size-5 text-slate-300 hover:text-blue-500 transition-colors" />
                    )}
                  </button>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <p
                      className={cn(
                        "text-sm font-medium",
                        milestone.is_completed
                          ? "text-slate-400 line-through"
                          : "text-slate-900"
                      )}
                    >
                      {milestone.name}
                    </p>
                    {milestone.description && (
                      <p className="text-[12px] text-slate-400 mt-0.5 line-clamp-2">
                        {milestone.description}
                      </p>
                    )}
                    {milestone.due_date && (
                      <div className="flex items-center gap-1 mt-1 text-[11px] text-slate-400">
                        <Calendar className="size-3" />
                        {formatDueDate(milestone.due_date)}
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  {has("work_items.manage") && (
                    <div className="flex items-center gap-1 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
                      <button
                        type="button"
                        onClick={() => startEdit(milestone)}
                        className="p-1 rounded text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                        aria-label={`Edit ${milestone.name}`}
                      >
                        <Edit className="size-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(milestone.id)}
                        disabled={deletingId === milestone.id}
                        className="p-1 rounded text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                        aria-label={`Hapus ${milestone.name}`}
                      >
                        {deletingId === milestone.id ? (
                          <Loader2 className="size-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="size-3.5" />
                        )}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Add dialog */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Tambah Milestone</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleAdd} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="ms-name">
                Nama <span className="text-red-500">*</span>
              </Label>
              <Input
                id="ms-name"
                placeholder="Contoh: Desain Database"
                value={addName}
                onChange={(e) => setAddName(e.currentTarget.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ms-desc">Deskripsi</Label>
              <Input
                id="ms-desc"
                placeholder="Deskripsi singkat milestone"
                value={addDescription}
                onChange={(e) => setAddDescription(e.currentTarget.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ms-date">Tanggal Jatuh Tempo</Label>
              <Input
                id="ms-date"
                type="date"
                value={addDueDate}
                onChange={(e) => setAddDueDate(e.currentTarget.value)}
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setAddDialogOpen(false)}
                disabled={addSubmitting}
              >
                Batal
              </Button>
              <Button
                type="submit"
                disabled={addSubmitting || !addName.trim()}
                className="bg-orange-500 hover:bg-orange-600 text-white font-bold"
              >
                {addSubmitting ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Menambahkan...
                  </>
                ) : (
                  "Tambah"
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
