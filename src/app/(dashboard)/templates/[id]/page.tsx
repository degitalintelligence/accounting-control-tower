"use client";

import { useState, useEffect, useCallback, use } from "react";
import { useRouter } from "next/navigation";
import { TemplateStepEditor } from "@/components/templates/template-step-editor";
import { RecurrenceEditor } from "@/components/templates/recurrence-editor";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardDescription,
} from "@/components/ui/card";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import {
  ArrowLeft,
  Calendar,
  Clock,
  Trash2,
  MoreHorizontal,
  Play,
  Loader2,
  AlertCircle,
  FileText,
  Users,
} from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { TaskTemplate, TemplateVersion, ChildBlueprint } from "@/types/template";
import type { WorkItemType, WorkItemPriority } from "@/types/work-item";

/* ─── Config ─────────────────────────────────────────── */

const TYPE_LABELS: Record<WorkItemType, string> = {
  routine: "Rutin",
  project: "Proyek",
  ad_hoc: "Ad Hoc",
  report: "Laporan",
};

const TYPE_BADGE_CLASS: Record<WorkItemType, string> = {
  routine: "bg-slate-100 text-slate-600",
  project: "bg-blue-50 text-blue-600",
  ad_hoc: "bg-orange-50 text-orange-600",
  report: "bg-purple-50 text-purple-600",
};

const PRIORITY_LABELS: Record<WorkItemPriority, string> = {
  low: "Rendah",
  medium: "Sedang",
  high: "Tinggi",
  critical: "Kritis",
};

const PRIORITY_DOT: Record<WorkItemPriority, string> = {
  low: "bg-slate-400",
  medium: "bg-blue-500",
  high: "bg-amber-500",
  critical: "bg-red-500",
};

const PRIORITY_TEXT: Record<WorkItemPriority, string> = {
  low: "text-slate-500",
  medium: "text-blue-600",
  high: "text-amber-600",
  critical: "text-red-600",
};

const RISK_LABELS: Record<string, string> = {
  low: "Rendah",
  medium: "Sedang",
  high: "Tinggi",
  critical: "Kritis",
};


/* ─── Types ──────────────────────────────────────────── */

interface TemplateDetail extends TaskTemplate {
  template_versions: TemplateVersion[];
  recurrence_rules: unknown[];
}

type ChecklistSummary = { id: string; name: string; target_role: string; checklist_items?: { id: string; is_required: boolean }[] };

/* ─── Helpers ────────────────────────────────────────── */

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/* ─── Skeleton ───────────────────────────────────────── */

function DetailSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-4">
        <Skeleton className="h-4 w-20" />
        <span className="text-slate-300">/</span>
        <Skeleton className="h-4 w-40" />
      </div>
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2 flex-1">
          <Skeleton className="h-6 w-2/3" />
          <div className="flex gap-2">
            <Skeleton className="h-5 w-16" />
            <Skeleton className="h-5 w-20" />
          </div>
        </div>
        <Skeleton className="h-9 w-32" />
      </div>
      <Skeleton className="h-10 w-64" />
      <Skeleton className="h-40 w-full" />
    </div>
  );
}

/* ─── Instantiate Dialog ─────────────────────────────── */

function InstantiateDialog({
  open,
  onOpenChange,
  templateId,
  templateName,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  templateId: string;
  templateName: string;
}) {
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
                <SelectTrigger id="inst-assignee" aria-label="Pilih assignee" className="w-full"><SelectValue placeholder="Pilih anggota" /></SelectTrigger>
                <SelectContent>{members.map((member) => <SelectItem key={member.profile_id} value={member.profile_id}>{member.name}{member.email ? ` · ${member.email}` : ""}</SelectItem>)}</SelectContent>
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
                    <Loader2 className="size-4 animate-spin" />
                    Membuat...
                  </>
                ) : (
                  <>
                    <Play className="size-4" />
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

/* ─── Main Page ──────────────────────────────────────── */

export default function TemplateDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();

  const [template, setTemplate] = useState<TemplateDetail | null>(null);
  const [checklists, setChecklists] = useState<ChecklistSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [instantiateOpen, setInstantiateOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/templates/${id}`);
      if (!res.ok) {
        if (res.status === 404) throw new Error("Template tidak ditemukan.");
        throw new Error("Gagal memuat template.");
      }

      const body = await res.json();
      setTemplate(body.data);
      const checklistResponse = await fetch("/api/checklist-templates");
      if (checklistResponse.ok) {
        const checklistBody = await checklistResponse.json();
        setChecklists(checklistBody.data ?? []);
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Terjadi kesalahan tidak diketahui."
      );
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    queueMicrotask(() => fetchData());
  }, [fetchData]);

  async function handleDelete() {
    setDeleting(true);
    try {
      const res = await fetch(`/api/templates/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? "Gagal menghapus template.");
      }
      router.push("/templates");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menghapus.");
    } finally {
      setDeleting(false);
      setDeleteConfirmOpen(false);
    }
  }

  if (loading) {
    return (
      <main className="page-canvas">
        <DetailSkeleton />
      </main>
    );
  }

  if (error || !template) {
    return (
      <main className="page-canvas"><div className="mx-auto flex min-h-[60vh] w-full max-w-6xl flex-col items-center justify-center text-center">
          <AlertCircle className="size-12 text-red-400 mb-3" />
          <h2 className="text-lg font-semibold text-slate-900 mb-1">
            {error ?? "Template tidak ditemukan."}
          </h2>
          {error && <Button variant="outline" onClick={() => void fetchData()}>Coba lagi</Button>}
          <Button variant="outline" onClick={() => router.push("/templates")}>
            <ArrowLeft className="size-4" />
            Kembali ke Daftar
          </Button>
        </div></main>
      );
    }

  const versions = template.template_versions ?? [];
  const latestVersion = versions[0] ?? null;
  const checklistById = new Map(checklists.map((checklist) => [checklist.id, checklist]));
  const stepCount = Array.isArray(latestVersion?.child_blueprint)
    ? (latestVersion.child_blueprint as unknown as ChildBlueprint[]).length
    : 0;

  return (
    <main className="page-canvas text-slate-900"><div className="mx-auto w-full max-w-6xl space-y-6">
        {/* Back button */}
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="text-slate-500 hover:text-slate-900 -ml-2"
            onClick={() => router.push("/templates")}
          >
            <ArrowLeft className="size-4" />
            Kembali
          </Button>
          <span className="text-[12px] text-slate-400">/</span>
          <span className="text-[12px] text-slate-600 font-medium truncate">
            {template.name}
          </span>
        </div>

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div className="space-y-2">
            <h1 className="text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">
              {template.name}
            </h1>
            <div className="flex items-center gap-2 flex-wrap">
              <Badge className={TYPE_BADGE_CLASS[template.type]}>
                {TYPE_LABELS[template.type]}
              </Badge>
              <span
                className={`inline-flex items-center gap-1.5 text-[11px] font-medium ${PRIORITY_TEXT[template.priority]}`}
              >
                <span
                  className={`size-1.5 rounded-full shrink-0 ${PRIORITY_DOT[template.priority]}`}
                />
                {PRIORITY_LABELS[template.priority]}
              </span>
              {stepCount > 0 && (
                <span className="text-[11px] text-slate-400">
                  {stepCount} langkah
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              className="bg-orange-500 hover:bg-orange-600 text-white font-bold"
              onClick={() => setInstantiateOpen(true)}
            >
              <Play className="size-4" />
              Gunakan
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger
                render={<Button variant="outline" size="icon" className="size-9" />}
              >
                <MoreHorizontal className="size-4" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  className="text-red-600 focus:text-red-600"
                  onClick={() => setDeleteConfirmOpen(true)}
                >
                  <Trash2 className="size-4 mr-2" />
                  Hapus Template
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="detail">
          <TabsList className="w-full justify-start overflow-x-auto sm:grid sm:grid-cols-4">
            <TabsTrigger value="detail">Detail</TabsTrigger>
            <TabsTrigger value="versions">
              Versi
              {versions.length > 0 && (
                <span className="ml-1 text-[10px] text-slate-400">
                  ({versions.length})
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="steps">Langkah</TabsTrigger>
            <TabsTrigger value="recurrence">Pengulangan</TabsTrigger>
          </TabsList>

          {/* ── Detail Tab ────────────────────────────── */}
          <TabsContent value="detail" className="mt-4">
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-4">
              {/* Main info */}
              <div className="space-y-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Deskripsi</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {template.description ? (
                      <p className="text-sm text-slate-600 whitespace-pre-wrap break-words">
                        {template.description}
                      </p>
                    ) : (
                      <p className="text-sm text-slate-400 italic">
                        Tidak ada deskripsi.
                      </p>
                    )}
                  </CardContent>
                </Card>

                {/* Latest version info */}
                {latestVersion && (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">
                        Versi Terbaru (v{latestVersion.version_number})
                      </CardTitle>
                      <CardDescription className="text-[12px]">
                        {latestVersion.title_template}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {latestVersion.description_template && (
                        <p className="text-sm text-slate-600">
                          {latestVersion.description_template}
                        </p>
                      )}
                      {latestVersion.notes && (
                        <div className="rounded-lg bg-slate-50 p-3">
                          <p className="text-[12px] text-slate-500">
                            {latestVersion.notes}
                          </p>
                        </div>
                      )}
                      <div className="rounded-lg border border-blue-100 bg-blue-50 p-3">
                        <p className="text-[11px] font-medium text-blue-600">Checklist SOP</p>
                        {latestVersion.checklist_template_id && checklistById.get(latestVersion.checklist_template_id) ? (
                          <p className="mt-1 text-sm text-slate-700">
                            {checklistById.get(latestVersion.checklist_template_id)!.name} · {checklistById.get(latestVersion.checklist_template_id)!.target_role}
                          </p>
                        ) : (
                          <p className="mt-1 text-sm text-slate-400">Belum dikaitkan</p>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>

              {/* Sidebar */}
              <div className="space-y-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Informasi</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex items-start gap-2">
                      <FileText className="size-4 text-slate-400 mt-0.5 shrink-0" />
                      <div>
                        <p className="text-[11px] text-slate-400">Jenis</p>
                        <p className="text-[13px] text-slate-900">
                          {TYPE_LABELS[template.type]}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-start gap-2">
                      <Users className="size-4 text-slate-400 mt-0.5 shrink-0" />
                      <div>
                        <p className="text-[11px] text-slate-400">Tingkat Risiko</p>
                        <p className="text-[13px] text-slate-900">
                          {RISK_LABELS[template.risk_level] ?? template.risk_level}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-start gap-2">
                      <Calendar className="size-4 text-slate-400 mt-0.5 shrink-0" />
                      <div>
                        <p className="text-[11px] text-slate-400">Berlaku Dari</p>
                        <p className="text-[13px] text-slate-900">
                          {formatDate(template.effective_from)}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-start gap-2">
                      <Calendar className="size-4 text-slate-400 mt-0.5 shrink-0" />
                      <div>
                        <p className="text-[11px] text-slate-400">Berlaku Sampai</p>
                        <p className="text-[13px] text-slate-900">
                          {formatDate(template.effective_until)}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-start gap-2">
                      <Clock className="size-4 text-slate-400 mt-0.5 shrink-0" />
                      <div>
                        <p className="text-[11px] text-slate-400">Dibuat</p>
                        <p className="text-[13px] text-slate-900">
                          {formatDate(template.created_at)}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-start gap-2">
                      <Clock className="size-4 text-slate-400 mt-0.5 shrink-0" />
                      <div>
                        <p className="text-[11px] text-slate-400">Terakhir Diubah</p>
                        <p className="text-[13px] text-slate-900">
                          {formatDate(template.updated_at)}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="recurrence" className="mt-4">
            <RecurrenceEditor templateId={id} />
          </TabsContent>

          {/* ── Versions Tab ─────────────────────────── */}
          <TabsContent value="versions" className="mt-4">
            {versions.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <FileText className="size-10 text-slate-300 mb-3" />
                <p className="text-sm text-slate-400">
                  Belum ada versi template.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {versions.map((ver) => {
                  const verSteps = Array.isArray(ver.child_blueprint)
                    ? (ver.child_blueprint as unknown as ChildBlueprint[]).length
                    : 0;

                  return (
                    <Card
                      key={ver.id}
                      className="border border-slate-100 shadow-none"
                    >
                      <CardHeader className="pb-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Badge className="bg-blue-50 text-blue-600 text-[10px]">
                              v{ver.version_number}
                            </Badge>
                            <CardTitle className="text-sm">
                              {ver.title_template}
                            </CardTitle>
                          </div>
                          <span className="text-[11px] text-slate-400">
                            {formatDateTime(ver.created_at)}
                          </span>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <div className="flex items-center gap-4 text-[12px] text-slate-500">
                          {verSteps > 0 && <span>{verSteps} langkah</span>}
                          {ver.checklist_template_id && checklistById.get(ver.checklist_template_id) && <span>Checklist: {checklistById.get(ver.checklist_template_id)!.name}</span>}
                          {ver.weight !== undefined && (
                            <span>Bobot: {ver.weight}</span>
                          )}
                          {ver.is_optional && (
                            <Badge className="bg-slate-100 text-slate-500 text-[10px]">
                              Opsional
                            </Badge>
                          )}
                        </div>
                        {ver.notes && (
                          <p className="mt-2 text-[12px] text-slate-400 italic">
                            {ver.notes}
                          </p>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>

          {/* ── Steps Tab ────────────────────────────── */}
          <TabsContent value="steps" className="mt-4">
            {latestVersion ? (
              <TemplateStepEditor
                templateId={id}
                initialSteps={
                  Array.isArray(latestVersion.child_blueprint)
                    ? (latestVersion.child_blueprint as unknown as ChildBlueprint[])
                    : []
                }
                versionNumber={latestVersion.version_number}
                titleTemplate={latestVersion.title_template}
                onSaved={fetchData}
              />
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <FileText className="size-10 text-slate-300 mb-3" />
                <p className="text-sm text-slate-400">
                  Template belum memiliki versi.
                </p>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* Instantiate dialog */}
      <InstantiateDialog
        open={instantiateOpen}
        onOpenChange={setInstantiateOpen}
        templateId={id}
        templateName={template.name}
      />

      {/* Delete confirmation dialog */}
      <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Hapus Template?</DialogTitle>
            <DialogDescription>
              Template &ldquo;{template.name}&rdquo; akan dihapus secara permanen.
              Tindakan ini tidak dapat dibatalkan.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteConfirmOpen(false)}
              disabled={deleting}
            >
              Batal
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Menghapus...
                </>
              ) : (
                "Hapus"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}
