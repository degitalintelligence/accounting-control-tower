"use client";

import { useState, useEffect, useCallback, use } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/stores/auth-store";
import { StatusBadge } from "@/components/work-items/status-badge";
import { PriorityBadge } from "@/components/work-items/priority-badge";
import { StatusTransitionButton } from "@/components/work-items/status-transition-button";
import { CommentSection } from "@/components/work-items/comment-section";
import { ChecklistPanel } from "@/components/work-items/checklist-panel";
import { EvidencePanel } from "@/components/work-items/evidence-panel";
import { ReviewPanel } from "@/components/work-items/review-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@/components/ui/card";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/components/ui/tabs";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import {
  ArrowLeft,
  Calendar,
  Clock,
  UserCircle,
  Loader2,
  AlertCircle,
  History,
  CheckCircle2,
  RotateCcw,
} from "lucide-react";
import type {
  WorkItem,
  WorkItemStatus,
  WorkItemType,
} from "@/types/work-item";
import { AssignmentPicker } from "@/components/work-items/assignment-picker";
import { DependencyPanel } from "@/components/work-items/dependency-panel";
import { EditWorkItemDialog } from "@/components/work-items/edit-work-item-dialog";

type ReportStage = "draft" | "prepared" | "submitted" | "accepted" | "rejected" | "delivered";

const REPORT_STAGE_LABELS: Record<ReportStage, string> = {
  draft: "Draft",
  prepared: "Disiapkan",
  submitted: "Dikirim",
  accepted: "Diterima",
  rejected: "Ditolak",
  delivered: "Delivered",
};

/* ─── Status config ─────────────────────────────────────── */

const STATUS_LABELS: Record<WorkItemStatus, string> = {
  draft: "Draft",
  assigned: "Ditugaskan",
  in_progress: "Sedang Dikerjakan",
  blocked: "Terblokir",
  submitted: "Menunggu Review",
  under_review: "Sedang Direview",
  revision_required: "Perlu Revisi",
  awaiting_approval: "Menunggu Persetujuan",
  approved: "Disetujui",
  completed: "Selesai",
  cancelled: "Dibatalkan",
};

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


/* ─── History entry type (from audit_logs API) ───────────── */

interface AuditLogEntry {
  id: string;
  actor_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string;
  old_value: Record<string, unknown> | null;
  new_value: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  actor_name: string | null;
}

/* ─── Date helpers ──────────────────────────────────────── */

function formatFullDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatShortDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/* ─── AssigneeList ──────────────────────────────────────── */

/* ─── Action labels & colors ─────────────────────────────── */

const ACTION_LABELS: Record<string, string> = {
  created: "Membuat",
  updated: "Mengubah",
  deleted: "Menghapus",
  assigned: "Menugaskan",
  unassigned: "Membatalkan penugasan",
  "work_item.created": "Membuat tugas",
  "work_item.updated": "Mengubah tugas",
  "work_item.deleted": "Menghapus tugas",
  "work_item.transition": "Mengubah status",
  "work_item.assigned": "Menugaskan",
  "comment.created": "Menambah komentar",
};

function getActionColor(action: string): string {
  if (action.includes("created") || action.includes("assigned")) return "border-blue-200 bg-blue-50";
  if (action.includes("transition") || action.includes("status")) return "border-amber-200 bg-amber-50";
  if (action.includes("deleted") || action.includes("unassigned")) return "border-red-200 bg-red-50";
  return "border-slate-200 bg-slate-50";
}

function getActionDotColor(action: string): string {
  if (action.includes("created") || action.includes("assigned")) return "border-blue-400";
  if (action.includes("transition") || action.includes("status")) return "border-amber-400";
  if (action.includes("deleted") || action.includes("unassigned")) return "border-red-400";
  return "border-slate-400";
}

function describeChange(entry: AuditLogEntry): string {
  const { action, old_value, new_value } = entry;
  if (action.includes("transition") && new_value) {
    const from = STATUS_LABELS[(old_value?.status ?? old_value?.from_status) as WorkItemStatus];
    const to = STATUS_LABELS[(new_value?.status ?? new_value?.to_status) as WorkItemStatus];
    if (from && to) return `${from} → ${to}`;
  }
  if (action.includes("assigned") && new_value) {
    const role = new_value.role ?? "";
    return `Role: ${role}`;
  }
  if (action === "created" || action.includes("created")) {
    const title = new_value?.title;
    return title ? `"${title}"` : "";
  }
  if (action === "updated" || action.includes("updated")) {
    const keys = new_value ? Object.keys(new_value).filter((k) => k !== "updated_at" && k !== "id") : [];
    if (keys.length > 0) return `Field: ${keys.slice(0, 3).join(", ")}${keys.length > 3 ? "..." : ""}`;
  }
  if (action === "deleted" || action.includes("deleted")) return "Soft delete";
  return "";
}

/* ─── HistoryTimeline ───────────────────────────────────── */

function HistoryTimeline({ entries }: { entries: AuditLogEntry[] }) {
  if (entries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <History className="size-8 text-slate-300 mb-2" />
        <p className="text-sm text-slate-400">Belum ada riwayat perubahan.</p>
      </div>
    );
  }

  return (
    <div className="relative pl-6">
      <div className="absolute left-[9px] top-2 bottom-2 w-px bg-slate-200" />

      <div className="mx-auto w-full max-w-[1600px] space-y-4 px-4 pb-8 sm:px-6 lg:px-8">
        {entries.map((entry, i) => {
          const colorClass = getActionColor(entry.action);
          const dotColor = getActionDotColor(entry.action);
          const isDelete = entry.action.includes("deleted");
          const label = ACTION_LABELS[entry.action] ?? entry.action;
          const detail = describeChange(entry);

          return (
            <div key={entry.id ?? i} className="relative">
              <div
                className={`absolute -left-6 top-1.5 size-[18px] rounded-full border-2 bg-white flex items-center justify-center ${dotColor}`}
              >
                {isDelete ? (
                  <AlertCircle className="size-2.5 text-red-500" />
                ) : entry.action.includes("created") ? (
                  <CheckCircle2 className="size-2.5 text-blue-500" />
                ) : (
                  <RotateCcw className="size-2.5 text-slate-500" />
                )}
              </div>

              <div className={`rounded-lg border p-3 ${colorClass}`}>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[12px] font-medium text-slate-900">
                    {label}
                  </span>
                  {entry.entity_type === "assignment" && (
                    <Badge className="bg-slate-100 text-slate-600 text-[10px]">
                      Penugasan
                    </Badge>
                  )}
                </div>
                {detail && (
                  <p className="mt-1 text-[12px] text-slate-600">{detail}</p>
                )}
                <div className="flex items-center gap-2 mt-1 text-[11px] text-slate-500">
                  <span>{entry.actor_name ?? "Sistem"}</span>
                  <span>&bull;</span>
                  <span>{formatFullDate(entry.created_at)}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─── Skeleton ──────────────────────────────────────────── */

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
            <Skeleton className="h-5 w-14" />
          </div>
        </div>
        <Skeleton className="h-9 w-32" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-4">
        <div className="space-y-4">
          <Skeleton className="h-10 w-64" />
          <Card>
            <CardContent className="p-4 space-y-3">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-5/6" />
              <Skeleton className="h-4 w-4/6" />
            </CardContent>
          </Card>
        </div>
        <div className="space-y-4">
          <Card>
            <CardContent className="p-4 space-y-3">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-full" />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

/* ─── Main Page ─────────────────────────────────────────── */

export default function WorkItemDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const currentUserId = useAuthStore((state) => state.user?.id);

  const [workItem, setWorkItem] = useState<WorkItem | null>(null);
  const [history, setHistory] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [assignRole, setAssignRole] = useState<string | null>(null);
  const [assignLoading, setAssignLoading] = useState(false);
  const [assignError, setAssignError] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [reportStage, setReportStage] = useState<ReportStage>("draft");
  const [deliveryReference, setDeliveryReference] = useState("");
  const [reportSaving, setReportSaving] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [itemRes, historyRes] = await Promise.all([
        fetch(`/api/work-items/${id}`),
        fetch(`/api/work-items/${id}/history`),
      ]);

      if (!itemRes.ok) {
        if (itemRes.status === 404) {
          throw new Error("Work item tidak ditemukan.");
        }
        throw new Error("Gagal memuat work item.");
      }

      const itemBody = await itemRes.json();
      setWorkItem(itemBody.data);
      if (itemBody.data.type === "report") {
        setReportStage(itemBody.data.report_stage ?? "draft");
        setDeliveryReference(itemBody.data.delivery_reference ?? "");
      }

      if (historyRes.ok) {
        const historyBody = await historyRes.json();
        setHistory(historyBody.data ?? []);
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Terjadi kesalahan tidak diketahui."
      );
    } finally {
      setLoading(false);
    }
  }, [id]);

  const saveReportStage = async () => {
    setReportSaving(true);
    setReportError(null);
    try {
      const response = await fetch(`/api/work-items/${id}/report`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage: reportStage, delivery_reference: deliveryReference || null }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error ?? "Gagal menyimpan lifecycle report.");
      }
      await fetchData();
    } catch (cause) {
      setReportError(cause instanceof Error ? cause.message : "Gagal menyimpan lifecycle report.");
    } finally {
      setReportSaving(false);
    }
  };

  useEffect(() => {
    queueMicrotask(() => fetchData());
  }, [fetchData]);

  const handleAssignSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!assignRole || !currentUserId) {
      setAssignError("Sesi pengguna belum siap. Silakan coba lagi.");
      return;
    }

    setAssignLoading(true);
    setAssignError(null);

    try {
      const res = await fetch(`/api/work-items/${id}/assign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profile_id: currentUserId, role: assignRole }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? "Gagal menugaskan.");
      }

      setAssignDialogOpen(false);
      setAssignRole(null);
      await fetchData();
    } catch (err) {
      setAssignError(
        err instanceof Error ? err.message : "Gagal menugaskan."
      );
    } finally {
      setAssignLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="page-canvas">
        <DetailSkeleton />
      </div>
    );
  }

  if (error || !workItem) {
    return (
      <div className="page-canvas">
        <div className="mx-auto flex max-w-lg flex-col items-center justify-center rounded-2xl border border-slate-200 bg-white px-6 py-16 text-center shadow-sm">
          <AlertCircle className="size-12 text-red-400 mb-3" />
          <h2 className="mb-2 text-lg font-semibold text-slate-900">
            {error ?? "Work item tidak ditemukan."}
          </h2>
          <p className="mb-6 text-sm leading-6 text-slate-500">Periksa koneksi Anda atau kembali ke daftar pekerjaan untuk memilih item lain.</p>
          <div className="flex flex-wrap justify-center gap-2">
            <Button variant="outline" onClick={() => router.push("/work-items")}>
              <ArrowLeft className="size-4" />
              Kembali ke Daftar
            </Button>
            <Button onClick={fetchData} className="cta-primary">
              Coba Lagi
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const assignments = workItem.assignments ?? [];

  return (
    <div className="page-canvas">
      <div className="mx-auto w-full max-w-[1440px] space-y-6">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="-ml-2 text-slate-500 hover:text-slate-900"
            onClick={() => router.push("/work-items")}
          >
            <ArrowLeft className="size-4" />
            Semua pekerjaan
          </Button>
        </div>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <Badge className={TYPE_BADGE_CLASS[workItem.type]}>{TYPE_LABELS[workItem.type]}</Badge>
                <StatusBadge status={workItem.status} className="h-6 px-2.5 text-xs" />
                <span className="rounded-full border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600">Prioritas</span>
                <PriorityBadge priority={workItem.priority} className="text-xs" />
              </div>
              <h1 className="max-w-4xl break-words text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">
                {workItem.title}
              </h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
                {workItem.description || "Belum ada deskripsi. Tambahkan konteks agar pekerjaan mudah dipahami oleh tim."}
              </p>
            </div>

            <div className="flex shrink-0 flex-wrap gap-2 lg:justify-end">
              <StatusTransitionButton
                workItemId={id}
                currentStatus={workItem.status}
                onTransitionComplete={fetchData}
              />
              <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>Ubah detail</Button>
            </div>
          </div>

          <div className="mt-6 grid gap-3 border-t border-slate-100 pt-5 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-xl bg-slate-50 p-3.5">
              <p className="text-xs font-medium text-slate-500">Tenggat</p>
              <p className={`mt-1 text-sm font-semibold ${workItem.due_at ? "text-slate-900" : "text-amber-700"}`}>
                {workItem.due_at ? formatShortDate(workItem.due_at) : "Belum ditentukan"}
              </p>
            </div>
            <div className="rounded-xl bg-slate-50 p-3.5">
              <p className="text-xs font-medium text-slate-500">Penugasan</p>
              <p className="mt-1 text-sm font-semibold text-slate-900">{assignments.length} orang</p>
            </div>
            <div className="rounded-xl bg-slate-50 p-3.5">
              <p className="text-xs font-medium text-slate-500">Aktivitas</p>
              <p className="mt-1 text-sm font-semibold text-slate-900">{history.length} perubahan</p>
            </div>
            <div className="rounded-xl bg-amber-50 p-3.5">
              <p className="text-xs font-medium text-amber-700">Langkah berikutnya</p>
              <p className="mt-1 text-sm font-semibold text-amber-950">Periksa detail pekerjaan</p>
            </div>
          </div>
        </section>

        <div className="grid min-w-0 grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
          <div className="min-w-0">
            <Tabs defaultValue="overview">
              <TabsList className="w-full justify-start overflow-x-auto rounded-xl bg-slate-100 p-1">
                <TabsTrigger value="overview">Ringkasan</TabsTrigger>
                <TabsTrigger value="checklist">Checklist Pengendalian</TabsTrigger>
                <TabsTrigger value="evidence">Bukti Pendukung</TabsTrigger>
                <TabsTrigger value="review">Review</TabsTrigger>
                <TabsTrigger value="comments">Komentar</TabsTrigger>
                <TabsTrigger value="history">Riwayat</TabsTrigger>
              </TabsList>

              {/* Overview */}
              <TabsContent value="overview" className="mt-4 space-y-4">
                {workItem.type === "report" && (
                  <Card>
                    <CardHeader className="pb-2"><CardTitle className="text-sm">Lifecycle dan delivery report</CardTitle></CardHeader>
                    <CardContent className="space-y-3">
                      <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
                        <label className="space-y-1 text-sm"><span className="text-slate-500">Stage</span><Select value={reportStage} onValueChange={(value) => setReportStage(value as ReportStage)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Object.entries(REPORT_STAGE_LABELS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></label>
                        <label className="space-y-1 text-sm"><span className="text-slate-500">Referensi delivery</span><input value={deliveryReference} onChange={(event) => setDeliveryReference(event.target.value)} placeholder="Nomor email, portal, atau dokumen" className="h-9 w-full rounded-md border border-slate-200 px-3 text-sm outline-none focus:border-blue-400" /></label>
                        <Button onClick={saveReportStage} disabled={reportSaving} className="bg-orange-500 text-white hover:bg-orange-600">{reportSaving ? <Loader2 className="size-4 animate-spin" /> : "Simpan"}</Button>
                      </div>
                      <div className="flex flex-wrap gap-2 text-xs text-slate-500">{Object.entries(REPORT_STAGE_LABELS).map(([value, label]) => <span key={value} className={`rounded-full px-2 py-1 ${value === reportStage ? "bg-blue-100 font-semibold text-blue-700" : "bg-slate-100"}`}>{label}</span>)}</div>
                      {reportError && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{reportError}</p>}
                    </CardContent>
                  </Card>
                )}
                {/* Description */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Deskripsi</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {workItem.description ? (
                      <p className="text-sm text-slate-600 whitespace-pre-wrap break-words">
                        {workItem.description}
                      </p>
                    ) : (
                      <p className="text-sm text-slate-400 italic">
                        Tidak ada deskripsi.
                      </p>
                    )}
                  </CardContent>
                </Card>

                {/* Assignments */}
                <Card>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm">Penugasan</CardTitle>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setAssignDialogOpen(true)}
                      >
                        <UserCircle className="size-3.5" />
                        Tugaskan
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent><AssignmentPicker workItemId={id} assignments={assignments} onChanged={fetchData} /></CardContent>
                </Card>

                {/* Assign dialog inline */}
                {assignDialogOpen && (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">
                        Tugaskan Pengguna
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <form onSubmit={handleAssignSubmit} className="space-y-3">
                        <div className="space-y-1.5">
                          <label className="text-sm font-medium text-slate-700">
                            Role
                          </label>
                          <Select
                            value={assignRole ?? ""}
                            onValueChange={(val) => setAssignRole(val)}
                          >
                            <SelectTrigger className="w-full">
                              <SelectValue placeholder="Pilih role..." />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="maker">Pelaksana</SelectItem>
                              <SelectItem value="checker">Reviewer</SelectItem>
                              <SelectItem value="approver">Penyetuju</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <p className="text-[11px] text-slate-400">
                          Anda akan ditugaskan sebagai role yang dipilih.
                        </p>
                        {assignError && (
                          <p className="text-sm text-red-500 bg-red-50 rounded-lg px-3 py-2">
                            {assignError}
                          </p>
                        )}
                        <div className="flex gap-2 justify-end">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setAssignDialogOpen(false);
                              setAssignRole(null);
                              setAssignError(null);
                            }}
                            disabled={assignLoading}
                          >
                            Batal
                          </Button>
                          <Button
                            type="submit"
                            size="sm"
                            disabled={assignLoading || !assignRole}
                            className="bg-orange-500 hover:bg-orange-600 text-white font-bold"
                          >
                            {assignLoading ? (
                              <Loader2 className="size-3.5 animate-spin" />
                            ) : (
                              "Tugaskan"
                            )}
                          </Button>
                        </div>
                      </form>
                    </CardContent>
                  </Card>
                )}
              </TabsContent>

              <TabsContent value="checklist" className="mt-4">
                <ChecklistPanel workItemId={id} />
                <Card className="mt-4"><CardHeader><CardTitle className="text-sm">Dependency</CardTitle></CardHeader><CardContent><DependencyPanel workItemId={id} /></CardContent></Card>
              </TabsContent>

              <TabsContent value="evidence" className="mt-4">
                <EvidencePanel workItemId={id} />
              </TabsContent>

              <TabsContent value="review" className="mt-4">
                <ReviewPanel workItemId={id} status={workItem.status} onChanged={fetchData} />
              </TabsContent>

              {/* Comments */}
              <TabsContent value="comments" className="mt-4">
                <CommentSection workItemId={id} />
              </TabsContent>

              {/* History */}
              <TabsContent value="history" className="mt-4">
                <HistoryTimeline entries={history} />
              </TabsContent>
            </Tabs>
          </div>

          <aside className="space-y-4 xl:sticky xl:top-20 xl:self-start">
            <Card className="border-slate-200 shadow-sm">
              <CardHeader className="border-b border-slate-100 pb-3">
                <CardTitle className="text-base">Informasi pekerjaan</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 pt-4">
                <div className="flex items-start gap-2">
                  <Calendar className="mt-0.5 size-4 shrink-0 text-blue-600" />
                  <div>
                    <p className="text-xs font-medium text-slate-500">Tenggat</p>
                    <p className={`mt-0.5 text-sm font-semibold ${workItem.due_at ? "text-slate-900" : "text-amber-700"}`}>
                      {workItem.due_at
                        ? formatShortDate(workItem.due_at)
                        : "Belum ditentukan"}
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <Clock className="mt-0.5 size-4 shrink-0 text-slate-400" />
                  <div>
                    <p className="text-xs font-medium text-slate-500">Dibuat</p>
                    <p className="mt-0.5 text-sm font-semibold text-slate-900">
                      {formatShortDate(workItem.created_at)}
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <Clock className="mt-0.5 size-4 shrink-0 text-slate-400" />
                  <div>
                    <p className="text-xs font-medium text-slate-500">Terakhir diubah</p>
                    <p className="mt-0.5 text-sm font-semibold text-slate-900">
                      {formatShortDate(workItem.updated_at)}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-slate-200 shadow-sm">
              <CardHeader className="border-b border-slate-100 pb-3">
                <CardTitle className="text-base">Kontrol pekerjaan</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 pt-4">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-500">Penugasan</span>
                  <span className="font-semibold text-slate-900">
                    {assignments.length}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-500">Riwayat</span>
                  <span className="font-semibold text-slate-900">
                    {history.length}
                  </span>
                </div>
              </CardContent>
            </Card>
          </aside>
        </div>
      </div>
      <EditWorkItemDialog open={editOpen} onOpenChange={setEditOpen} workItem={workItem} onSaved={fetchData} />
    </div>
  );
}
