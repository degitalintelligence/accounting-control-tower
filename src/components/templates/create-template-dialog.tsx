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
import { Loader2 } from "lucide-react";

interface CreateTemplateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

interface ClientOption {
  id: string;
  name: string;
}

interface FormData {
  name: string;
  description: string;
  type: string;
  priority: string;
  client_id: string;
  title_template: string;
}

const INITIAL_FORM: FormData = {
  name: "",
  description: "",
  type: "routine",
  priority: "medium",
  client_id: "",
  title_template: "",
};

export function CreateTemplateDialog({
  open,
  onOpenChange,
  onSuccess,
}: CreateTemplateDialogProps) {
  const [form, setForm] = useState<FormData>(INITIAL_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [clientsLoading, setClientsLoading] = useState(false);
  const [clientInputMode, setClientInputMode] = useState(false);

  // Fetch clients when dialog opens
  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) setClientsLoading(true);
    });

    fetch("/api/clients")
      .then((res) => {
        if (!res.ok) throw new Error("API not available");
        return res.json();
      })
      .then((data) => {
        if (!cancelled) {
          const list = Array.isArray(data) ? data : data.data ?? [];
          setClients(list);
          if (list.length === 0) setClientInputMode(true);
        }
      })
      .catch(() => {
        if (!cancelled) setClientInputMode(true);
      })
      .finally(() => {
        if (!cancelled) setClientsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open]);

  function updateField<K extends keyof FormData>(key: K, value: FormData[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!form.name.trim()) {
      setError("Nama template wajib diisi.");
      return;
    }
    if (!form.client_id.trim()) {
      setError("Client wajib dipilih.");
      return;
    }
    if (!form.title_template.trim()) {
      setError("Judul versi pertama wajib diisi.");
      return;
    }

    setSubmitting(true);
    try {
      const body = {
        name: form.name.trim(),
        description: form.description.trim() || undefined,
        type: form.type,
        priority: form.priority,
        client_id: form.client_id.trim(),
        version: {
          title_template: form.title_template.trim(),
        },
      };

      const res = await fetch("/api/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? "Gagal membuat template.");
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
          <DialogTitle>Buat Template Baru</DialogTitle>
          <DialogDescription>
            Buat blueprint pekerjaan yang bisa digunakan berulang kali.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Name */}
          <div className="space-y-1.5">
            <Label htmlFor="tpl-name">
              Nama Template <span className="text-red-500">*</span>
            </Label>
            <Input
              id="tpl-name"
              placeholder="Contoh: Rekonsiliasi Bank Bulanan"
              value={form.name}
              onChange={(e) => updateField("name", e.currentTarget.value)}
            />
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <Label htmlFor="tpl-desc">Deskripsi</Label>
            <textarea
              id="tpl-desc"
              rows={2}
              placeholder="Jelaskan tujuan template secara singkat..."
              value={form.description}
              onChange={(e) => updateField("description", e.currentTarget.value)}
              className="flex w-full rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 resize-none"
            />
          </div>

          {/* Type + Priority row */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="tpl-type">Jenis</Label>
              <Select
                value={form.type}
                onValueChange={(val) => updateField("type", val ?? "routine")}
              >
                <SelectTrigger id="tpl-type" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="routine">Rutin</SelectItem>
                  <SelectItem value="project">Proyek</SelectItem>
                  <SelectItem value="ad_hoc">Ad Hoc</SelectItem>
                  <SelectItem value="report">Laporan</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="tpl-priority">Prioritas</Label>
              <Select
                value={form.priority}
                onValueChange={(val) => updateField("priority", val ?? "medium")}
              >
                <SelectTrigger id="tpl-priority" className="w-full">
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
          </div>

          {/* Client */}
          <div className="space-y-1.5">
            <Label htmlFor="tpl-client">
              Client <span className="text-red-500">*</span>
            </Label>
            {clientInputMode || clients.length === 0 ? (
              <>
                <Input
                  id="tpl-client"
                  placeholder="UUID client"
                  value={form.client_id}
                  onChange={(e) => updateField("client_id", e.currentTarget.value)}
                />
                <p className="text-[11px] text-slate-400">
                  Masukkan UUID client dari database.
                </p>
              </>
            ) : (
              <Select
                value={form.client_id || null}
                onValueChange={(val) => updateField("client_id", val ?? "")}
              >
                <SelectTrigger id="tpl-client" className="w-full">
                  <SelectValue placeholder={clientsLoading ? "Memuat..." : "Pilih client..."} />
                </SelectTrigger>
                <SelectContent>
                  {clients.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Title template (first version) */}
          <div className="space-y-1.5">
            <Label htmlFor="tpl-title">
              Judul Versi Pertama <span className="text-red-500">*</span>
            </Label>
            <Input
              id="tpl-title"
              placeholder="Contoh: Rekonsiliasi Bank {{month}} {{year}}"
              value={form.title_template}
              onChange={(e) => updateField("title_template", e.currentTarget.value)}
            />
            <p className="text-[11px] text-slate-400">
              Judul ini akan dipakai saat template dijadikan work item.
            </p>
          </div>

          {/* Error */}
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
                "Buat Template"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
