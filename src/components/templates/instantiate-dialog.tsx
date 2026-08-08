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
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Play } from "lucide-react";

interface InstantiateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  templateId: string;
  templateName: string;
}

export function InstantiateDialog({
  open,
  onOpenChange,
  templateId,
  templateName,
}: InstantiateDialogProps) {
  const [dueDate, setDueDate] = useState("");
  const [assigneeId, setAssigneeId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ id: string } | null>(null);
  const [members, setMembers] = useState<Array<{ profile_id: string; name: string; email: string | null }>>([]);

  useEffect(() => {
    if (!open) return;
    fetch("/api/assignment-members").then(async (response) => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Anggota gagal dimuat.");
      setMembers(data.data ?? []);
    }).catch((err) => setError(err instanceof Error ? err.message : "Anggota gagal dimuat."));
  }, [open]);

  async function handleInstantiate() {
    setError(null);
    setSubmitting(true);

    try {
      const body: Record<string, unknown> = {};
      if (dueDate) body.due_date = new Date(dueDate).toISOString();
      if (assigneeId.trim()) body.assignee_id = assigneeId.trim();

      const res = await fetch(`/api/templates/${templateId}/instantiate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? "Gagal menjalankan template.");
      }

      const data = await res.json();
      setResult(data.data?.work_item ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Terjadi kesalahan.");
    } finally {
      setSubmitting(false);
    }
  }

  function handleClose() {
    setDueDate("");
    setAssigneeId("");
    setError(null);
    setResult(null);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Gunakan Template</DialogTitle>
          <DialogDescription>
            Buat work item baru dari &ldquo;{templateName}&rdquo;.
          </DialogDescription>
        </DialogHeader>

        {result ? (
          <div className="space-y-4">
            <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-4 text-center">
              <p className="text-sm font-medium text-emerald-700 mb-1">
                Work item berhasil dibuat!
              </p>
              <p className="text-[12px] text-emerald-600">
                ID: {result.id}
              </p>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={handleClose}>
                Tutup
              </Button>
              <Button
                className="bg-orange-500 hover:bg-orange-600 text-white font-bold"
                onClick={() => {
                  handleClose();
                  window.location.href = `/work-items/${result.id}`;
                }}
              >
                Buka Work Item
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="inst-due">Tenggat Waktu</Label>
              <Input
                id="inst-due"
                type="datetime-local"
                value={dueDate}
                onChange={(e) => setDueDate(e.currentTarget.value)}
              />
              <p className="text-[11px] text-slate-400">
                Kosongkan untuk menggunakan aturan tenggat default.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="inst-assignee">Assignee (opsional)</Label>
              <Select value={assigneeId || null} onValueChange={(value) => setAssigneeId(value ?? "")}>
                <SelectTrigger id="inst-assignee" aria-label="Pilih assignee" className="w-full">
                  <SelectValue placeholder="Pilih anggota" />
                </SelectTrigger>
                <SelectContent>
                  {members.map((member) => (
                    <SelectItem key={member.profile_id} value={member.profile_id}>
                      {member.name}{member.email ? ` · ${member.email}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-slate-400">
                Kosongkan untuk membuat tanpa penugasan.
              </p>
            </div>

            {error && (
              <p className="text-sm text-red-500 bg-red-50 rounded-lg px-3 py-2">
                {error}
              </p>
            )}

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={handleClose}
                disabled={submitting}
              >
                Batal
              </Button>
              <Button
                onClick={handleInstantiate}
                disabled={submitting}
                className="bg-orange-500 hover:bg-orange-600 text-white font-bold"
              >
                {submitting ? (
                  <>
                    <Loader2 className="size-4 animate-spin mr-2" />
                    Membuat...
                  </>
                ) : (
                  <>
                    <Play className="size-4 mr-2" />
                    Jalankan Template
                  </>
                )}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
