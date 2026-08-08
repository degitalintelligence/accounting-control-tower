"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckSquare, FileCheck2, Info, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { usePermissions } from "@/hooks/use-permissions";
import { AccessDenied } from "@/components/settings/settings-tabs";

type Item = { id?: string; label: string; input_type: "checkbox" | "text" | "number" | "date" | "file" | "url" | "confirmation"; is_required: boolean; sort_order?: number };
type Template = { id: string; name: string; description: string | null; target_role: string; checklist_items?: Item[] };

async function readResponse(response: Response) {
  const body = await response.json().catch(() => null) as { data?: unknown; error?: string } | null;
  return { body, error: body?.error ?? `Permintaan gagal (${response.status}).` };
}

const inputTypeLabels: Record<Item["input_type"], string> = { checkbox: "Checkbox", text: "Teks", number: "Angka", date: "Tanggal", file: "File", url: "URL", confirmation: "Konfirmasi" };

export default function ChecklistsPage() {
  const { has } = usePermissions();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [role, setRole] = useState("maker");
  const [items, setItems] = useState<Item[]>([{ label: "", input_type: "checkbox", is_required: false }]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const load = useCallback(async () => { setLoading(true); setError(null); try { const response = await fetch("/api/checklist-templates"); const { body, error: responseError } = await readResponse(response); if (!response.ok) throw new Error(responseError); setTemplates((body?.data as Template[] | undefined) ?? []); } catch (cause) { setError(cause instanceof Error ? cause.message : "Gagal memuat template."); } finally { setLoading(false); } }, []);
  useEffect(() => { const timer = window.setTimeout(() => { if (has("checklists.view")) void load(); }, 0); return () => window.clearTimeout(timer); }, [load, has]);

  if (!has("checklists.view")) {
    return <main className="page-canvas"><AccessDenied /></main>;
  }
  async function create() { setSaving(true); setError(null); try { const response = await fetch("/api/checklist-templates", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: name.trim(), description: description.trim(), target_role: role, items }) }); const { error: responseError } = await readResponse(response); if (!response.ok) throw new Error(responseError); setName(""); setDescription(""); setItems([{ label: "", input_type: "checkbox", is_required: false }]); await load(); } catch (cause) { setError(cause instanceof Error ? cause.message : "Gagal membuat template."); } finally { setSaving(false); } }
  async function remove(template: Template) { if (!window.confirm(`Hapus template checklist "${template.name}"?`)) return; setDeletingId(template.id); setError(null); try { const response = await fetch(`/api/checklist-templates/${template.id}`, { method: "DELETE" }); const { error: responseError } = await readResponse(response); if (!response.ok) throw new Error(responseError); await load(); } catch (cause) { setError(cause instanceof Error ? cause.message : "Gagal menghapus template."); } finally { setDeletingId(null); } }
  return (
    <main className="page-canvas text-slate-900">
      <div className="mx-auto w-full max-w-6xl space-y-6">
        <header>
          <div className="flex items-center gap-2 text-xs font-semibold text-blue-600">
            <CheckSquare className="size-4" /> Control Library
          </div>
          <h1 className="mt-3 text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">
            Checklist SOP
          </h1>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500">
            Buat template kontrol yang membantu maker, checker, dan approver bekerja dengan standar yang sama.
          </p>
        </header>

        {error && (
          <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <span>{error}</span>
            <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
              Coba lagi
            </Button>
          </div>
        )}

        <div className={cn("grid gap-6", has("checklists.manage") ? "xl:grid-cols-[minmax(0,400px)_minmax(0,1fr)]" : "grid-cols-1")}>
          {has("checklists.manage") && (
            <Card className="surface-card rounded-2xl shadow-none">
              <CardHeader className="border-b border-slate-100">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <CardTitle className="text-lg font-bold text-slate-950">Template baru</CardTitle>
                    <p className="mt-1 text-sm text-slate-500">Definisikan langkah kontrol dan peran yang bertanggung jawab.</p>
                  </div>
                  <FileCheck2 className="size-5 text-blue-600" />
                </div>
              </CardHeader>
              <CardContent className="space-y-5 p-5 sm:p-6">
                <div className="space-y-2">
                  <Label htmlFor="checklist-name">Nama template</Label>
                  <Input id="checklist-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Contoh: Review dokumen operasional bulanan" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="checklist-description">Deskripsi</Label>
                  <Input id="checklist-description" value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Jelaskan tujuan checklist" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="checklist-role">Peran target</Label>
                  <Select value={role} onValueChange={(value) => setRole(value ?? "maker")}>
                    <SelectTrigger id="checklist-role">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="maker">Pelaksana</SelectItem>
                      <SelectItem value="checker">Reviewer</SelectItem>
                      <SelectItem value="approver">Penyetuju</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-slate-500">Checklist akan muncul pada tahapan peran ini.</p>
                </div>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-sm font-bold text-slate-900">Item checklist</h2>
                      <p className="text-xs text-slate-500">{items.length} item didefinisikan</p>
                    </div>
                    <Button type="button" variant="outline" size="sm" onClick={() => setItems((current) => [...current, { label: "", input_type: "checkbox", is_required: false }])}>
                      <Plus className="size-4" />
                      Tambah item
                    </Button>
                  </div>
                  {items.map((item, index) => (
                    <div key={index} className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/70 p-3">
                      <div className="flex gap-2">
                        <div className="min-w-0 flex-1 space-y-2">
                          <Label htmlFor={`checklist-item-${index}`}>Item {index + 1}</Label>
                          <Input
                            id={`checklist-item-${index}`}
                            value={item.label}
                            onChange={(event) => setItems((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, label: event.target.value } : row))}
                            placeholder={`Contoh: ${index === 0 ? "Periksa dokumen pendukung" : "Lengkapi langkah kontrol"}`}
                          />
                        </div>
                        <Tooltip>
                          <TooltipTrigger render={<Button type="button" variant="ghost" size="icon-sm" onClick={() => setItems((current) => current.length > 1 ? current.filter((_, rowIndex) => rowIndex !== index) : current)} aria-label={`Hapus item ${index + 1}`} />}><Trash2 className="size-4" /></TooltipTrigger>
                          <TooltipContent>Hapus item</TooltipContent>
                        </Tooltip>
                      </div>
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                        <Select value={item.input_type} onValueChange={(value) => setItems((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, input_type: value as Item["input_type"] } : row))}>
                          <SelectTrigger className="sm:flex-1">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {Object.entries(inputTypeLabels).map(([value, label]) => (
                              <SelectItem key={value} value={value}>{label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <label className="flex items-center gap-2 text-sm text-slate-600">
                          <input type="checkbox" checked={item.is_required} onChange={(event) => setItems((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, is_required: event.target.checked } : row))} className="size-4 accent-blue-600" /> Wajib
                        </label>
                      </div>
                    </div>
                  ))}
                </div>
                <Button
                  className="cta-primary w-full"
                  onClick={() => void create()}
                  disabled={saving || !name.trim() || items.some((item) => !item.label.trim())}
                >
                  {saving ? "Menyimpan..." : "Simpan template"}
                </Button>
              </CardContent>
            </Card>
          )}

          <section className="space-y-4">
            <div className="flex items-end justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-slate-950">Template tersimpan</h2>
                <p className="mt-1 text-sm text-slate-500">{templates.length} template checklist tersedia</p>
              </div>
              <div className="hidden rounded-lg bg-blue-50 p-2 text-blue-600 sm:block">
                <Info className="size-5" />
              </div>
            </div>
            {loading ? (
              <div className="surface-card rounded-2xl p-6 text-sm text-slate-500" role="status">Memuat template...</div>
            ) : templates.length === 0 ? (
              <div className="surface-card rounded-2xl p-10 text-center">
                <CheckSquare className="mx-auto size-10 text-slate-300" />
                <p className="mt-3 text-sm text-slate-500">Belum ada template checklist.</p>
                <p className="mt-1 text-xs text-slate-400">Template yang Anda buat akan tampil di sini.</p>
              </div>
            ) : (
              <div className="grid gap-3">
                {templates.map((template) => (
                  <Card key={template.id} className="surface-card rounded-xl shadow-none">
                    <CardContent className="flex items-start gap-4 p-5">
                      <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-blue-50 text-blue-600">
                        <FileCheck2 className="size-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-bold text-slate-900">{template.name}</p>
                          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold capitalize text-slate-600">{template.target_role}</span>
                        </div>
                        <p className="mt-1 text-sm text-slate-500">{template.description || "Tanpa deskripsi"}</p>
                        {template.checklist_items && (
                          <p className="mt-3 text-xs font-medium text-slate-500">{template.checklist_items.length} item checklist</p>
                        )}
                      </div>
                      {has("checklists.manage") && (
                        <Tooltip>
                          <TooltipTrigger render={<Button type="button" variant="ghost" size="icon-sm" onClick={() => void remove(template)} disabled={deletingId === template.id} aria-label={deletingId === template.id ? `Menghapus template ${template.name}` : `Hapus template ${template.name}`} />}><Trash2 className="size-4 text-red-500" /></TooltipTrigger>
                          <TooltipContent>{deletingId === template.id ? "Menghapus..." : "Hapus template"}</TooltipContent>
                        </Tooltip>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
