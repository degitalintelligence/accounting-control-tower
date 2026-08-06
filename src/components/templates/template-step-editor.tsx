"use client";

import { useState } from "react";
import { Plus, Trash2, ChevronUp, ChevronDown, Loader2, GripVertical } from "lucide-react";
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ChildBlueprint } from "@/types/template";

interface TemplateStepEditorProps {
  templateId: string;
  initialSteps: ChildBlueprint[];
  versionNumber: number;
  titleTemplate: string;
  checklistTemplateId: string | null;
  checklistName?: string;
  onSaved?: () => void;
}

const ROLE_OPTIONS = [
  { value: "maker", label: "Maker" },
  { value: "checker", label: "Checker" },
  { value: "approver", label: "Approver" },
];

const EMPTY_STEP: ChildBlueprint = {
  title_suffix: "",
  description: "",
  type: "routine",
  priority: "medium",
  weight: 1,
  is_optional: false,
  due_offset_days: 0,
};

export function TemplateStepEditor({
  templateId,
  initialSteps,
  versionNumber,
  titleTemplate,
  checklistTemplateId,
  checklistName,
  onSaved,
}: TemplateStepEditorProps) {
  const [steps, setSteps] = useState<ChildBlueprint[]>(() => {
    if (initialSteps.length > 0) return [...initialSteps];
    return [];
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  function addStep() {
    setSteps((prev) => [...prev, { ...EMPTY_STEP }]);
    setSuccess(false);
  }

  function removeStep(index: number) {
    setSteps((prev) => prev.filter((_, i) => i !== index));
    setSuccess(false);
  }

  function moveStep(index: number, direction: "up" | "down") {
    const newIndex = direction === "up" ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= steps.length) return;

    setSteps((prev) => {
      const next = [...prev];
      [next[index], next[newIndex]] = [next[newIndex], next[index]];
      return next;
    });
    setSuccess(false);
  }

  function updateStep<K extends keyof ChildBlueprint>(
    index: number,
    key: K,
    value: ChildBlueprint[K]
  ) {
    setSteps((prev) =>
      prev.map((s, i) => (i === index ? { ...s, [key]: value } : s))
    );
    setSuccess(false);
  }

  async function handleSave() {
    setError(null);
    setSuccess(false);

    // Validasi
    for (let i = 0; i < steps.length; i++) {
      if (!steps[i].title_suffix.trim()) {
        setError(`Langkah ${i + 1}: judul langkah wajib diisi.`);
        return;
      }
    }

    setSaving(true);
    try {
      const res = await fetch(`/api/templates/${templateId}/versions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title_template: titleTemplate,
          child_blueprint: steps,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? "Gagal menyimpan langkah.");
      }

      setSuccess(true);
      onSaved?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Terjadi kesalahan.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Header info */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">
          {steps.length} langkah dalam versi {versionNumber}
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={addStep}
          className="text-blue-600 border-blue-200 hover:bg-blue-50"
        >
          <Plus className="size-3.5" />
          Tambah Langkah
        </Button>
      </div>

      {/* Steps list */}
      {steps.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-slate-200 p-8 text-center">
          <p className="text-sm text-slate-400 mb-2">
            Belum ada langkah dalam template ini.
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={addStep}
            className="text-blue-600"
          >
            <Plus className="size-3.5" />
            Tambah Langkah Pertama
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {steps.map((step, index) => (
            <Card key={index} className="border border-slate-100 shadow-none">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <GripVertical className="size-4 text-slate-300" />
                    <CardTitle className="text-sm text-slate-700">
                      Langkah {index + 1}
                    </CardTitle>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="size-7 p-0 text-slate-400 hover:text-slate-600"
                      disabled={index === 0}
                      onClick={() => moveStep(index, "up")}
                    >
                      <ChevronUp className="size-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="size-7 p-0 text-slate-400 hover:text-slate-600"
                      disabled={index === steps.length - 1}
                      onClick={() => moveStep(index, "down")}
                    >
                      <ChevronDown className="size-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="size-7 p-0 text-red-400 hover:text-red-600 hover:bg-red-50"
                      onClick={() => removeStep(index)}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {/* Title suffix */}
                <div className="space-y-1">
                  <Label className="text-[11px] text-slate-500">
                    Judul Langkah <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    placeholder="Contoh: Verifikasi data bank"
                    value={step.title_suffix}
                    onChange={(e) =>
                      updateStep(index, "title_suffix", e.currentTarget.value)
                    }
                    className="h-8 text-sm"
                  />
                </div>

                {/* Description */}
                <div className="space-y-1">
                  <Label className="text-[11px] text-slate-500">Deskripsi</Label>
                  <Input
                    placeholder="Penjelasan singkat langkah ini..."
                    value={step.description ?? ""}
                    onChange={(e) =>
                      updateStep(index, "description", e.currentTarget.value || undefined)
                    }
                    className="h-8 text-sm"
                  />
                </div>

                {/* Role + Offset days + Weight row */}
                <div className="grid grid-cols-3 gap-2">
                  <div className="space-y-1">
                    <Label className="text-[11px] text-slate-500">Role</Label>
                    <Select
                      value={step.assignee_role ?? ""}
                      onValueChange={(val) =>
                        updateStep(index, "assignee_role", val ?? undefined)
                      }
                    >
                      <SelectTrigger className="h-8 text-sm">
                        <SelectValue placeholder="Pilih..." />
                      </SelectTrigger>
                      <SelectContent>
                        {ROLE_OPTIONS.map((r) => (
                          <SelectItem key={r.value} value={r.value}>
                            {r.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-[11px] text-slate-500">
                      Offset Hari
                    </Label>
                    <Input
                      type="number"
                      min={0}
                      placeholder="0"
                      value={step.due_offset_days ?? 0}
                      onChange={(e) =>
                        updateStep(
                          index,
                          "due_offset_days",
                          parseInt(e.currentTarget.value, 10) || 0
                        )
                      }
                      className="h-8 text-sm"
                    />
                  </div>

                  <div className="space-y-1">
                    <Label className="text-[11px] text-slate-500">Bobot</Label>
                    <Input
                      type="number"
                      min={0}
                      step={0.1}
                      placeholder="1"
                      value={step.weight ?? 1}
                      onChange={(e) =>
                        updateStep(
                          index,
                          "weight",
                          parseFloat(e.currentTarget.value) || 1
                        )
                      }
                      className="h-8 text-sm"
                    />
                  </div>
                </div>

                {/* Optional checkbox */}
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={step.is_optional ?? false}
                    onChange={(e) =>
                      updateStep(index, "is_optional", e.currentTarget.checked)
                    }
                    className="size-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-[12px] text-slate-500">
                    Langkah opsional
                  </span>
                </label>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Error / success */}
      {error && (
        <p className="text-sm text-red-500 bg-red-50 rounded-lg px-3 py-2">
          {error}
        </p>
      )}
      {success && (
        <p className="text-sm text-emerald-600 bg-emerald-50 rounded-lg px-3 py-2">
          Langkah berhasil disimpan sebagai versi baru.
        </p>
      )}

      {/* Save button */}
      <div className="flex justify-end">
        <Button
          onClick={handleSave}
          disabled={saving || steps.length === 0}
          className="bg-orange-500 hover:bg-orange-600 text-white font-bold"
        >
          {saving ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Menyimpan...
            </>
          ) : (
            "Simpan Versi Baru"
          )}
        </Button>
      </div>

      <div className="rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-sm text-blue-700">
        {checklistTemplateId ? (
          <>Checklist akan diwariskan ke versi baru{checklistName ? `: ${checklistName}` : "."}</>
        ) : (
          "Versi aktif belum memiliki checklist."
        )}
      </div>
    </div>
  );
}
