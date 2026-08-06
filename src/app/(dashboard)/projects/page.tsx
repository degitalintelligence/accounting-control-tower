"use client";

import { Suspense, useState, useCallback, useMemo, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { ProjectCard } from "@/components/projects/project-card";
import { CreateProjectDialog } from "@/components/projects/create-project-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
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
import { useI18n } from "@/components/i18n-provider";

const STATUS_OPTIONS = [
  { value: "", key: "work.allStatus" }, { value: "draft", key: "status.draft" }, { value: "assigned", key: "status.assigned" }, { value: "in_progress", key: "status.inProgress" }, { value: "blocked", key: "status.blocked" }, { value: "submitted", key: "status.submitted" }, { value: "under_review", key: "status.underReview" }, { value: "revision_required", key: "status.revisionRequired" }, { value: "awaiting_approval", key: "status.awaitingApproval" }, { value: "approved", key: "status.approved" }, { value: "completed", key: "status.completed" }, { value: "cancelled", key: "status.cancelled" },
];

function ProjectsPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { t } = useI18n();

  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const searchTimeoutRef = useRef<number | null>(null);

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
    <>
      <div className="space-y-4">
        {/* Header & Filters */}
        <div className="space-y-3">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
            <div>
              <div className="flex items-center gap-2 text-xs font-semibold text-blue-600"><FolderKanban className="size-4" /> {t("projects.title")}</div>
              <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-950">{t("projects.title")}</h1>
              <p className="mt-1 text-sm leading-6 text-slate-500">
                {t("projects.description")}
              </p>
            </div>
            <Button
              onClick={() => setCreateDialogOpen(true)}
              className="cta-primary shrink-0"
            >
              <Plus className="size-4" />
              {t("projects.create")}
            </Button>
          </div>

          {/* Filter bar */}
          <div className="surface-card flex flex-col gap-2 rounded-xl p-3 sm:flex-row">
            <div className="relative flex-1 min-w-0">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-slate-400 pointer-events-none" />
              <Input
                placeholder={t("projects.search")}
                defaultValue={search}
                onChange={(e) => {
                  if (searchTimeoutRef.current) window.clearTimeout(searchTimeoutRef.current);
                  const value = e.currentTarget.value;
                  searchTimeoutRef.current = window.setTimeout(() => updateParam("search", value), 350);
                }}
              className="h-10 bg-white pl-9 text-sm"
              />
            </div>
            <Select
              value={status || null}
              onValueChange={(val) => updateParam("status", (val as string) ?? "")}
            >
              <SelectTrigger className="h-10 min-w-[160px] bg-white text-sm">
                <SelectValue placeholder={t("work.allStatus")} />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((opt) => (
                  <SelectItem
                    key={opt.value || "all"}
                    value={opt.value || ""}
                  >
                    {t(opt.key as never)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Results count */}
        {!loading && (
          <p className="text-sm font-medium text-slate-500">
            {total} {t("projects.found")}
          </p>
        )}

        {/* Error */}
        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-center">
            <p className="text-sm text-red-600">{error}</p>
            <Button
              variant="outline"
              size="sm"
              className="mt-2"
              onClick={refetch}
            >
              {t("common.tryAgain")}
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
              {t("projects.empty")}
            </h3>
            <p className="text-sm text-slate-400 mb-4">
              {t("projects.emptyDescription")}
            </p>
            <Button
              onClick={() => setCreateDialogOpen(true)}
              className="cta-primary"
            >
              {t("projects.create")}
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
            <Tooltip>
              <TooltipTrigger render={<Button variant="outline" size="sm" aria-label="Halaman sebelumnya" disabled={page <= 1} onClick={() => handlePageChange(page - 1)} />}>
                <ChevronLeft className="size-4" />
              </TooltipTrigger>
              <TooltipContent>Halaman sebelumnya</TooltipContent>
            </Tooltip>
            <span className="text-sm text-slate-500 px-2">
              Halaman {page} dari {totalPages}
            </span>
            <Tooltip>
              <TooltipTrigger render={<Button variant="outline" size="sm" aria-label="Halaman berikutnya" disabled={page >= totalPages} onClick={() => handlePageChange(page + 1)} />}>
                <ChevronRight className="size-4" />
              </TooltipTrigger>
              <TooltipContent>Halaman berikutnya</TooltipContent>
            </Tooltip>
          </div>
        )}
      </div>

      {/* Create dialog */}
      <CreateProjectDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        onSuccess={handleCreateSuccess}
      />
    </>
  );
}

export default function ProjectsPage() {
  return (
    <Suspense fallback={<ProjectsPageSkeleton />}>
      <main className="page-canvas">
        <ProjectsPageContent />
      </main>
    </Suspense>
  );
}

function ProjectsPageSkeleton() {
  return (
    <main className="page-canvas">
      <div className="space-y-4">
        <div className="space-y-2">
          <Skeleton className="h-6 w-24" />
          <Skeleton className="h-4 w-64" />
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
              <Skeleton className="mb-3 h-4 w-24" />
              <Skeleton className="mb-2 h-5 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
