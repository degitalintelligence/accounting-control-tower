"use client";

import { useState, useCallback, useMemo, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { WorkItemFilters } from "@/components/work-items/work-item-filters";
import { WorkItemCard } from "@/components/work-items/work-item-card";
import { CreateWorkItemDialog } from "@/components/work-items/create-work-item-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, FolderOpen } from "lucide-react";
import { useAuthStore } from "@/stores/auth-store";
import { useWorkItems } from "@/hooks/use-work-items";
import type { WorkItemStatus, WorkItemType, WorkItemPriority } from "@/types/work-item";

function WorkItemsPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const user = useAuthStore((s) => s.user);

  const [createDialogOpen, setCreateDialogOpen] = useState(false);

  // Read filters from URL
  const status = searchParams.get("status") as WorkItemStatus | null;
  const type = searchParams.get("type") as WorkItemType | null;
  const priority = searchParams.get("priority") as WorkItemPriority | null;
  const search = searchParams.get("search") ?? undefined;
  const page = Math.max(1, Number(searchParams.get("page") ?? 1));
  const activeTab = searchParams.get("tab") ?? "all";

  const assigneeId = activeTab === "mine" ? user?.id : undefined;
  const overdueOnly = activeTab === "overdue";

  const { items, total, totalPages, loading, error, refetch } = useWorkItems({
    status: status ?? undefined,
    type: type ?? undefined,
    priority: priority ?? undefined,
    search,
    assignee_id: assigneeId,
    overdue_only: overdueOnly,
    page,
    limit: 20,
  });

  useEffect(() => {
    if (searchParams.get("new") === "1") {
      queueMicrotask(() => setCreateDialogOpen(true));
      const params = new URLSearchParams(searchParams.toString());
      params.delete("new");
      router.replace(params.toString() ? `?${params.toString()}` : "/work-items");
    }
    if (searchParams.get("focus") === "search") {
      requestAnimationFrame(() => document.getElementById("work-item-search")?.focus());
      const params = new URLSearchParams(searchParams.toString());
      params.delete("focus");
      router.replace(params.toString() ? `?${params.toString()}` : "/work-items");
    }
  }, [router, searchParams]);

  const handleTabChange = useCallback(
    (tab: string) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("tab", tab);
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
            <Skeleton className="h-4 w-14" />
          </div>
          <Skeleton className="h-4 w-3/4 mb-2" />
          <Skeleton className="h-4 w-1/2 mb-3" />
          <div className="flex items-center justify-between">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-6 w-6 rounded-full" />
          </div>
        </div>
      )),
    []
  );

  return (
    <>
      <div className="space-y-4">
        {/* Filters & Header */}
        <WorkItemFilters
          activeTab={activeTab}
          onTabChange={handleTabChange}
          onCreateClick={() => setCreateDialogOpen(true)}
        />

        {/* Results count */}
        {!loading && (
          <p className="text-[12px] text-slate-400">
            {total} work item{total !== 1 ? "s" : ""} ditemukan
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

        {/* List */}
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {skeletons}
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <FolderOpen className="size-12 text-slate-300 mb-3" />
            <h3 className="text-base font-medium text-slate-900 mb-1">
              Belum ada work item
            </h3>
            <p className="text-sm text-slate-400 mb-4">
              Buat work item pertama Anda untuk memulai.
            </p>
            <Button
              onClick={() => setCreateDialogOpen(true)}
              className="bg-orange-500 hover:bg-orange-600 text-white font-bold"
            >
              Buat Work Item
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {items.map((item) => (
              <WorkItemCard
                key={item.id}
                id={item.id}
                title={item.title}
                type={item.type}
                status={item.status}
                priority={item.priority}
                due_at={item.due_at}
                assignments={item.assignments}
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
      <CreateWorkItemDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        onSuccess={handleCreateSuccess}
      />
    </>
  );
}

export default function WorkItemsPage() {
  return <WorkItemsPageContent />;
}
