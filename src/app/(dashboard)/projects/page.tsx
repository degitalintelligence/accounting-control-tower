"use client";

import { Suspense, useState, useCallback, useMemo } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { ProjectCard } from "@/components/projects/project-card";
import { CreateProjectDialog } from "@/components/projects/create-project-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { ChevronLeft, ChevronRight, FolderKanban, Plus, Search } from "lucide-react";
import { useProjects } from "@/hooks/use-projects";

const STATUS_OPTIONS = [
  { value: "", label: "Semua Status" },
  { value: "draft", label: "Draft" },
  { value: "assigned", label: "Ditugaskan" },
  { value: "in_progress", label: "Sedang Dikerjakan" },
  { value: "blocked", label: "Terblokir" },
  { value: "submitted", label: "Menunggu Review" },
  { value: "under_review", label: "Sedang Direview" },
  { value: "revision_required", label: "Perlu Revisi" },
  { value: "awaiting_approval", label: "Menunggu Persetujuan" },
  { value: "approved", label: "Disetujui" },
  { value: "completed", label: "Selesai" },
  { value: "cancelled", label: "Dibatalkan" },
];

function ProjectsPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [createDialogOpen, setCreateDialogOpen] = useState(false);

  const status = searchParams.get("status") ?? undefined;
  const search = searchParams.get("search") ?? undefined;
  const page = Math.max(1, Number(searchParams.get("page") ?? 1));

  const { projects, total, totalPages, loading, error, refetch } = useProjects({
    status,
    search,
    page,
    limit: 20,
  });

  const updateParam = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value) {
        params.set(key, value);
      } else {
        params.delete(key);
      }
      params.delete("page");
      router.push(`?${params.toString()}`);
    },
    [router, searchParams]
  );

  const handlePageChange = useCallback(
    (newPage: number) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("page", String(newPage));
      router.push(`?${params.toString()}`);
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
    [router, searchParams]
  );

  const handleCreateSuccess = useCallback(() => {
    refetch();
  }, [refetch]);

  const skeletons = useMemo(
    () =>
      Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className="rounded-xl bg-white p-4 shadow-[0_1px_3px_rgba(0,0,0,.06)] border border-slate-100"
        >
          <div className="flex gap-2 mb-2">
            <Skeleton className="h-4 w-12" />
            <Skeleton className="h-4 w-20" />
          </div>
          <Skeleton className="h-4 w-3/4 mb-2" />
          <Skeleton className="h-3 w-full mb-1" />
          <Skeleton className="h-3 w-2/3 mb-3" />
          <div className="flex items-center justify-between">
            <Skeleton className="h-3 w-20" />
          </div>
        </div>
      )),
    []
  );

  return (
    <AppShell>
      <div className="space-y-4">
        {/* Header & Filters */}
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h1 className="text-lg font-semibold text-slate-900">Proyek</h1>
              <p className="text-sm text-slate-500 mt-0.5">
                Kelola proyek dan lacak progresnya
              </p>
            </div>
            <Button
              onClick={() => setCreateDialogOpen(true)}
              className="bg-orange-500 hover:bg-orange-600 text-white font-bold shrink-0"
            >
              <Plus className="size-4" />
              Buat Proyek
            </Button>
          </div>

          {/* Filter bar */}
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1 min-w-0">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-slate-400 pointer-events-none" />
              <Input
                placeholder="Cari proyek..."
                defaultValue={search}
                onChange={(e) => updateParam("search", e.currentTarget.value)}
                className="pl-8 h-8 text-sm bg-white"
              />
            </div>
            <Select
              value={status || null}
              onValueChange={(val) => updateParam("status", (val as string) ?? "")}
            >
              <SelectTrigger className="h-8 text-sm bg-white min-w-[140px]">
                <SelectValue placeholder="Semua Status" />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((opt) => (
                  <SelectItem
                    key={opt.value || "all"}
                    value={opt.value || ""}
                  >
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Results count */}
        {!loading && (
          <p className="text-[12px] text-slate-400">
            {total} proyek ditemukan
          </p>
        )}

        {/* Error */}
        {error && (
          <div className="rounded-xl bg-red-50 border border-red-200 p-4 text-center">
            <p className="text-sm text-red-600">{error}</p>
            <Button
              variant="outline"
              size="sm"
              className="mt-2"
              onClick={refetch}
            >
              Coba Lagi
            </Button>
          </div>
        )}

        {/* Grid */}
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {skeletons}
          </div>
        ) : projects.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <FolderKanban className="size-12 text-slate-300 mb-3" />
            <h3 className="text-base font-medium text-slate-900 mb-1">
              Belum ada proyek
            </h3>
            <p className="text-sm text-slate-400 mb-4">
              Buat proyek pertama Anda untuk mulai melacak progres.
            </p>
            <Button
              onClick={() => setCreateDialogOpen(true)}
              className="bg-orange-500 hover:bg-orange-600 text-white font-bold"
            >
              Buat Proyek
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {projects.map((project) => (
              <ProjectCard
                key={project.id}
                id={project.id}
                title={project.title ?? "Tanpa Judul"}
                objective={project.objective}
                status={project.status ?? "draft"}
                target_date={project.target_date}
                stats={project.stats}
              />
            ))}
          </div>
        )}

        {/* Pagination */}
        {!loading && totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 pt-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => handlePageChange(page - 1)}
            >
              <ChevronLeft className="size-4" />
            </Button>
            <span className="text-sm text-slate-500 px-2">
              Halaman {page} dari {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => handlePageChange(page + 1)}
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>
        )}
      </div>

      {/* Create dialog */}
      <CreateProjectDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        onSuccess={handleCreateSuccess}
      />
    </AppShell>
  );
}

export default function ProjectsPage() {
  return (
    <Suspense fallback={null}>
      <ProjectsPageContent />
    </Suspense>
  );
}
