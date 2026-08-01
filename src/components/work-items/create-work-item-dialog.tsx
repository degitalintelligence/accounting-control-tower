"use client";

import { useState } from "react";
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
import { Loader2 } from "lucide-react";
import { ClientSelect } from "@/components/shared/client-select";

interface CreateWorkItemDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

interface FormData {
  type: string;
  title: string;
  description: string;
  priority: string;
  due_at: string;
  client_id: string;
}

const INITIAL_FORM: FormData = {
  type: "",
  title: "",
  description: "",
  priority: "medium",
  due_at: "",
  client_id: "",
};

export function CreateWorkItemDialog({
  open,
  onOpenChange,
  onSuccess,
}: CreateWorkItemDialogProps) {
  const [form, setForm] = useState<FormData>(INITIAL_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function updateField<K extends keyof FormData>(key: K, value: FormData[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!form.type) {
      setError("Jenis pekerjaan wajib dipilih.");
      return;
    }
    if (!form.title.trim()) {
      setError("Judul wajib diisi.");
      return;
    }
    if (!form.client_id) {
      setError("Client wajib dipilih.");
      return;
    }

    setSubmitting(true);
    try {
      const body: Record<string, unknown> = {
        type: form.type,
        title: form.title.trim(),
        priority: form.priority,
        client_id: form.client_id,
      };
      if (form.description.trim()) {
        body.description = form.description.trim();
      }
      if (form.due_at) {
        body.due_at = new Date(form.due_at).toISOString();
      }

      const res = await fetch("/api/work-items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? "Gagal membuat work item.");
      }

      setForm(INITIAL_FORM);
      onOpenChange(false);
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Terjadi kesalahan.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Buat Work Item Baru</DialogTitle>
          <DialogDescription>
            Isi informasi dasar untuk membuat pekerjaan baru.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Type */}
          <div className="space-y-1.5">
            <Label htmlFor="wi-type">
              Jenis Pekerjaan <span className="text-red-500">*</span>
            </Label>
            <Select
              value={form.type || null}
              onValueChange={(val) => updateField("type", val as string)}
            >
              <SelectTrigger id="wi-type" className="w-full">
                <SelectValue placeholder="Pilih jenis..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="routine">Rutin</SelectItem>
                <SelectItem value="project">Proyek</SelectItem>
                <SelectItem value="ad_hoc">Ad Hoc</SelectItem>
                <SelectItem value="report">Laporan</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Title */}
          <div className="space-y-1.5">
            <Label htmlFor="wi-title">
              Judul <span className="text-red-500">*</span>
            </Label>
            <Input
              id="wi-title"
              placeholder="Contoh: Rekonsiliasi bank bulan Juli"
              value={form.title}
              onChange={(e) => updateField("title", e.currentTarget.value)}
            />
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <Label htmlFor="wi-desc">Deskripsi</Label>
            <textarea
              id="wi-desc"
              rows={3}
              placeholder="Jelaskan pekerjaan secara detail..."
              value={form.description}
              onChange={(e) => updateField("description", e.currentTarget.value)}
              className="flex w-full rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 resize-none"
            />
          </div>

          {/* Priority */}
          <div className="space-y-1.5">
            <Label htmlFor="wi-priority">Prioritas</Label>
            <Select
              value={form.priority}
              onValueChange={(val) => updateField("priority", val as string)}
            >
              <SelectTrigger id="wi-priority" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="low">Rendah</SelectItem>
                <SelectItem value="medium">Sedang</SelectItem>
                <SelectItem value="high">Tinggi</SelectItem>
                <SelectItem value="critical">Kritis</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Due date */}
          <div className="space-y-1.5">
            <Label htmlFor="wi-due">Tenggat Waktu</Label>
            <Input
              id="wi-due"
              type="datetime-local"
              value={form.due_at}
              onChange={(e) => updateField("due_at", e.currentTarget.value)}
            />
          </div>

          <ClientSelect id="wi-client" value={form.client_id} onChange={(value) => updateField("client_id", value)} />

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
              onClick={() => onOpenChange(false)}
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
                "Buat Work Item"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
