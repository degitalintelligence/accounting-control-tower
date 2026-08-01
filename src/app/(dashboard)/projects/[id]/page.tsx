"use client";

import { useState, useEffect, useCallback, use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { MilestoneList } from "@/components/projects/milestone-list";
import { LinkWorkItemDialog } from "@/components/projects/link-work-item-dialog";
import { StatusBadge } from "@/components/work-items/status-badge";
import { PriorityBadge } from "@/components/work-items/priority-badge";
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
  ArrowLeft,
  Calendar,
  Clock,
  Target,
  Edit,
  Trash2,
  Loader2,
  AlertCircle,
  CheckCircle2,
  FolderKanban,
  Link as LinkIcon,
  Timer,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { WorkItemStatus, WorkItemPriority } from "@/types/work-item";
import { EditProjectDialog } from "@/components/projects/edit-project-dialog";

/* ─── Types ─────────────────────────────────────────────── */

interface ProjectDetail {
  id: string;
  work_item_id: string;
  objective: string | null;
  success_criteria: string | null;
  start_date: string | null;
  target_date: string | null;
  budgeted_hours: number | null;
  created_at: string;
  updated_at: string;
  title: string | null;
  description: string | null;
  status: string | null;
  priority: string | null;
  organization_id: string | null;
  client_id: string | null;
  milestones: Array<{
    id: string;
    project_id: string;
    name: string;
    description: string | null;
    due_date: string | null;
    sort_order: number;
    is_completed: boolean;
    completed_at: string | null;
    created_at: string;
  }>;
  work_items: Array<{
    id: string;
    title: string;
    status: string;
    priority: string;
    due_at: string | null;
    is_optional: boolean;
    completed_at: string | null;
  }>;
  stats: {
    total_milestones: number;
    completed_milestones: number;
    total_work_items: number;
    completed_work_items: number;
  };
}

/* ─── Helpers ───────────────────────────────────────────── */

function formatShortDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
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
          </div>
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-9 w-20" />
          <Skeleton className="h-9 w-20" />
        </div>
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

export default function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();

  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  const fetchProject = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${id}`);
      if (!res.ok) {
        if (res.status === 404) throw new Error("Proyek tidak ditemukan.");
        throw new Error("Gagal memuat proyek.");
      }
      const body = await res.json();
      setProject(body.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Terjadi kesalahan.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    queueMicrotask(() => fetchProject());
  }, [fetchProject]);

  async function handleDelete() {
    if (!confirm("Yakin ingin menghapus proyek ini? Tindakan ini tidak dapat dibatalkan.")) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/projects/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? "Gagal menghapus proyek.");
      }
      router.push("/projects");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menghapus proyek.");
      setDeleting(false);
    }
  }

  if (loading) {
    return (
      <>
        <DetailSkeleton />
      </>
    );
  }

  if (error || !project) {
    return (
      <>
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <AlertCircle className="size-12 text-red-400 mb-3" />
          <h2 className="text-lg font-semibold text-slate-900 mb-1">
            {error ?? "Proyek tidak ditemukan."}
          </h2>
          <Button variant="outline" onClick={() => router.push("/projects")}>
            <ArrowLeft className="size-4" />
            Kembali ke Daftar
          </Button>
          <Button variant="outline" onClick={fetchProject}>
            Coba Lagi
          </Button>
        </div>
      </>
    );
  }

  const stats = project.stats;
  const milestoneProgress =
    stats.total_milestones > 0
      ? Math.round((stats.completed_milestones / stats.total_milestones) * 100)
      : 0;
  const workItemProgress =
    stats.total_work_items > 0
      ? Math.round((stats.completed_work_items / stats.total_work_items) * 100)
      : 0;

  const overdueItems = project.work_items.filter((w) => {
    if (!w.due_at) return false;
    const terminal: string[] = ["completed", "cancelled"];
    return new Date(w.due_at) < new Date() && !terminal.includes(w.status);
  }).length;

  return (
    <>
      <div className="space-y-4">
        {/* Back button */}
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="text-slate-500 hover:text-slate-900 -ml-2"
            onClick={() => router.push("/projects")}
          >
            <ArrowLeft className="size-4" />
            Kembali
          </Button>
          <span className="text-[12px] text-slate-400">/</span>
          <span className="text-[12px] text-slate-600 font-medium truncate">
            {project.title ?? "Proyek"}
          </span>
        </div>

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div className="space-y-2">
            <h1 className="text-xl font-semibold text-slate-900">
              {project.title ?? "Tanpa Judul"}
            </h1>
            <div className="flex items-center gap-2 flex-wrap">
              <Badge className="bg-blue-50 text-blue-600 text-[11px]">Proyek</Badge>
              {project.status && (
                <StatusBadge status={project.status as WorkItemStatus} />
              )}
              {project.priority && (
                <PriorityBadge priority={project.priority as WorkItemPriority} />
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setEditOpen(true)}
            >
              <Edit className="size-3.5" />
              Edit
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleDelete}
              disabled={deleting}
              className="text-red-600 hover:text-red-700 hover:bg-red-50"
            >
              {deleting ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Trash2 className="size-3.5" />
              )}
              Hapus
            </Button>
          </div>
        </div>

        {/* Content: main + sidebar */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-4">
          {/* Main content with tabs */}
          <div>
            <Tabs defaultValue="overview">
              <TabsList>
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="milestones">Milestone</TabsTrigger>
                <TabsTrigger value="work-items">Tugas</TabsTrigger>
              </TabsList>

              {/* Overview tab */}
              <TabsContent value="overview" className="mt-4 space-y-4">
                {/* Objective */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Tujuan (Objective)</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {project.objective ? (
                      <p className="text-sm text-slate-600 whitespace-pre-wrap break-words">
                        {project.objective}
                      </p>
                    ) : (
                      <p className="text-sm text-slate-400 italic">
                        Belum ada tujuan yang ditetapkan.
                      </p>
                    )}
                  </CardContent>
                </Card>

                {/* Success Criteria */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Kriteria Keberhasilan</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {project.success_criteria ? (
                      <p className="text-sm text-slate-600 whitespace-pre-wrap break-words">
                        {project.success_criteria}
                      </p>
                    ) : (
                      <p className="text-sm text-slate-400 italic">
                        Belum ada kriteria keberhasilan.
                      </p>
                    )}
                  </CardContent>
                </Card>

                {/* Description */}
                {project.description && (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">Deskripsi</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-slate-600 whitespace-pre-wrap break-words">
                        {project.description}
                      </p>
                    </CardContent>
                  </Card>
                )}

                {/* Progress bars */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Progres</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {/* Milestone progress */}
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-[13px] text-slate-600">Milestone</span>
                        <span className="text-[13px] font-medium text-slate-900">
                          {stats.completed_milestones}/{stats.total_milestones}
                        </span>
                      </div>
                      <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden">
                        <div
                          className={cn(
                            "h-full rounded-full transition-all duration-300",
                            milestoneProgress === 100
                              ? "bg-emerald-500"
                              : "bg-blue-500"
                          )}
                          style={{ width: `${milestoneProgress}%` }}
                        />
                      </div>
                    </div>

                    {/* Work item progress */}
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-[13px] text-slate-600">Tugas</span>
                        <span className="text-[13px] font-medium text-slate-900">
                          {stats.completed_work_items}/{stats.total_work_items}
                        </span>
                      </div>
                      <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden">
                        <div
                          className={cn(
                            "h-full rounded-full transition-all duration-300",
                            workItemProgress === 100
                              ? "bg-emerald-500"
                              : "bg-blue-500"
                          )}
                          style={{ width: `${workItemProgress}%` }}
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Milestones tab */}
              <TabsContent value="milestones" className="mt-4">
                <MilestoneList projectId={id} />
              </TabsContent>

              {/* Work Items tab */}
              <TabsContent value="work-items" className="mt-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-medium text-slate-900">
                    Tugas ({project.work_items.length})
                  </h3>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setLinkDialogOpen(true)}
                  >
                    <LinkIcon className="size-3.5" />
                    Kelola Tugas
                  </Button>
                </div>

                {project.work_items.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 text-center">
                    <FolderKanban className="size-8 text-slate-300 mb-2" />
                    <p className="text-sm text-slate-400">
                      Belum ada tugas yang terhubung.
                    </p>
                    <p className="text-[12px] text-slate-300 mt-1">
                      Hubungkan work item untuk mulai melacak tugas proyek.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {project.work_items.map((item) => {
                      const isOverdue =
                        item.due_at &&
                        new Date(item.due_at) < new Date() &&
                        !["completed", "cancelled"].includes(item.status);
                      const isCompleted =
                        item.status === "completed" || item.status === "approved";

                      return (
                        <Link
                          href={`/work-items/${item.id}`}
                          key={item.id}
                          className={cn(
                            "group flex items-start gap-3 rounded-lg border p-3 transition-colors cursor-pointer hover:border-slate-200",
                            isCompleted
                              ? "bg-emerald-50/30 border-emerald-100"
                              : "bg-white border-slate-100"
                          )}
                        >
                          <div className="mt-0.5 shrink-0">
                            {isCompleted ? (
                              <CheckCircle2 className="size-5 text-emerald-500" />
                            ) : (
                              <div
                                className={cn(
                                  "size-5 rounded-full border-2 flex items-center justify-center",
                                  isOverdue
                                    ? "border-red-300"
                                    : "border-slate-200"
                                )}
                              />
                            )}
                          </div>

                          <div className="flex-1 min-w-0">
                            <p
                              className={cn(
                                "text-sm font-medium",
                                isCompleted
                                  ? "text-slate-400 line-through"
                                  : "text-slate-900"
                              )}
                            >
                              {item.title}
                            </p>
                            <div className="flex items-center gap-2 mt-1 flex-wrap">
                              <StatusBadge
                                status={item.status as WorkItemStatus}
                                className="text-[9px]"
                              />
                              <PriorityBadge
                                priority={item.priority as WorkItemPriority}
                                className="text-[10px]"
                              />
                              {item.due_at && (
                                <span
                                  className={cn(
                                    "flex items-center gap-1 text-[11px]",
                                    isOverdue
                                      ? "text-red-500 font-medium"
                                      : "text-slate-400"
                                  )}
                                >
                                  <Calendar className="size-3" />
                                  {formatShortDate(item.due_at)}
                                </span>
                              )}
                            </div>
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </div>

          {/* Sidebar */}
          <div className="space-y-4">
            {/* Quick Stats */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Statistik</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between text-[13px]">
                  <span className="text-slate-500 flex items-center gap-1.5">
                    <FolderKanban className="size-3.5" />
                    Total Tugas
                  </span>
                  <span className="font-medium text-slate-900">
                    {stats.total_work_items}
                  </span>
                </div>
                <div className="flex items-center justify-between text-[13px]">
                  <span className="text-slate-500 flex items-center gap-1.5">
                    <CheckCircle2 className="size-3.5" />
                    Tugas Selesai
                  </span>
                  <span className="font-medium text-emerald-600">
                    {stats.completed_work_items}
                  </span>
                </div>
                <div className="flex items-center justify-between text-[13px]">
                  <span className="text-slate-500 flex items-center gap-1.5">
                    <Target className="size-3.5" />
                    Milestone
                  </span>
                  <span className="font-medium text-slate-900">
                    {stats.completed_milestones}/{stats.total_milestones}
                  </span>
                </div>
                {overdueItems > 0 && (
                  <div className="flex items-center justify-between text-[13px]">
                    <span className="text-red-500 flex items-center gap-1.5">
                      <AlertCircle className="size-3.5" />
                      Terlambat
                    </span>
                    <span className="font-medium text-red-600">
                      {overdueItems}
                    </span>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Dates */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Tanggal</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-start gap-2">
                  <Calendar className="size-4 text-slate-400 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-[11px] text-slate-400">Mulai</p>
                    <p className="text-[13px] text-slate-900">
                      {project.start_date
                        ? formatShortDate(project.start_date)
                        : "Belum ditentukan"}
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <Target className="size-4 text-slate-400 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-[11px] text-slate-400">Target Selesai</p>
                    <p className="text-[13px] text-slate-900">
                      {project.target_date
                        ? formatShortDate(project.target_date)
                        : "Belum ditentukan"}
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <Clock className="size-4 text-slate-400 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-[11px] text-slate-400">Dibuat</p>
                    <p className="text-[13px] text-slate-900">
                      {formatShortDate(project.created_at)}
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <Clock className="size-4 text-slate-400 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-[11px] text-slate-400">Terakhir Diubah</p>
                    <p className="text-[13px] text-slate-900">
                      {formatShortDate(project.updated_at)}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Budget */}
            {project.budgeted_hours != null && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Budget</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-2">
                    <Timer className="size-4 text-slate-400" />
                    <div>
                      <p className="text-[11px] text-slate-400">Jam Dibudgetkan</p>
                      <p className="text-[13px] font-medium text-slate-900">
                        {project.budgeted_hours} jam
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
      <EditProjectDialog open={editOpen} onOpenChange={setEditOpen} project={project} onSaved={fetchProject} />

      {/* Link work item dialog */}
      <LinkWorkItemDialog
        projectId={id}
        open={linkDialogOpen}
        onOpenChange={setLinkDialogOpen}
        linkedItems={project.work_items}
        onLinkChange={fetchProject}
      />
    </>
  );
}
