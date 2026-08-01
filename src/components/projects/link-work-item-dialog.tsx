"use client";

import { useState, useEffect, useCallback } from "react";
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
import { Badge } from "@/components/ui/badge";
import {
  Search,
  Link,
  Unlink,
  Loader2,
  CheckCircle2,
} from "lucide-react";
import { StatusBadge } from "@/components/work-items/status-badge";
import { cn } from "@/lib/utils";
import type { WorkItemStatus } from "@/types/work-item";

interface LinkedWorkItem {
  id: string;
  title: string;
  status: string;
  priority: string;
  due_at: string | null;
  is_optional: boolean;
}

interface LinkWorkItemDialogProps {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  linkedItems: LinkedWorkItem[];
  onLinkChange: () => void;
}

interface WorkItemSearchResult {
  id: string;
  title: string;
  status: string;
  project_id: string | null;
}

export function LinkWorkItemDialog({
  projectId,
  open,
  onOpenChange,
  linkedItems,
  onLinkChange,
}: LinkWorkItemDialogProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<WorkItemSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [linkingId, setLinkingId] = useState<string | null>(null);
  const [unlinkingId, setUnlinkingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showSuccess, setShowSuccess] = useState<string | null>(null);

  const linkedIds = new Set(linkedItems.map((i) => i.id));

  // Search work items
  const doSearch = useCallback(
    async (query: string) => {
      setSearching(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        if (query.trim()) params.set("search", query.trim());
        params.set("limit", "20");

        const res = await fetch(`/api/work-items?${params.toString()}`);
        if (!res.ok) return;
        const body = await res.json();
        const items = (body.data ?? [])
          .filter(
            (w: WorkItemSearchResult & { project_id: string | null }) =>
              !w.project_id || w.project_id === projectId
          )
          .map((w: WorkItemSearchResult) => ({
            id: w.id,
            title: w.title,
            status: w.status,
            project_id: w.project_id,
          }));
        setSearchResults(items);
      } catch {
        // ignore
      } finally {
        setSearching(false);
      }
    },
    [projectId]
  );

  useEffect(() => {
    if (!open) return;
    queueMicrotask(() => doSearch(""));
  }, [open, doSearch]);

  // Debounced search
  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => {
      doSearch(searchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery, open, doSearch]);

  // Link work item
  async function handleLink(workItemId: string) {
    setLinkingId(workItemId);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/link-work-item`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ work_item_id: workItemId }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? "Gagal meng-link work item.");
      }

      setShowSuccess(workItemId);
      setTimeout(() => setShowSuccess(null), 2000);
      onLinkChange();
      // Refresh search to reflect updated project_id
      doSearch(searchQuery);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal meng-link work item.");
    } finally {
      setLinkingId(null);
    }
  }

  // Unlink work item
  async function handleUnlink(workItemId: string) {
    setUnlinkingId(workItemId);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/link-work-item`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ work_item_id: workItemId }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? "Gagal meng-unlink work item.");
      }

      onLinkChange();
      doSearch(searchQuery);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal meng-unlink work item.");
    } finally {
      setUnlinkingId(null);
    }
  }

  function handleClose(value: boolean) {
    if (!value) {
      setSearchQuery("");
      setError(null);
      setShowSuccess(null);
    }
    onOpenChange(value);
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Kelola Tugas Proyek</DialogTitle>
          <DialogDescription>
            Cari dan hubungkan work item ke proyek ini, atau lepaskan yang sudah terhubung.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Currently linked items */}
          {linkedItems.length > 0 && (
            <div className="space-y-2">
              <p className="text-[12px] font-medium text-slate-500 uppercase tracking-wider">
                Tugas Terhubung ({linkedItems.length})
              </p>
              <div className="space-y-1.5">
                {linkedItems.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center gap-2 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-medium text-slate-900 truncate">
                        {item.title}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <StatusBadge
                          status={item.status as WorkItemStatus}
                          className="text-[9px]"
                        />
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleUnlink(item.id)}
                      disabled={unlinkingId === item.id}
                      className="shrink-0 text-slate-400 hover:text-red-600 h-7 px-2"
                    >
                      {unlinkingId === item.id ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <Unlink className="size-3.5" />
                      )}
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Search */}
          <div className="space-y-2">
            <p className="text-[12px] font-medium text-slate-500 uppercase tracking-wider">
              Cari Work Item
            </p>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-slate-400 pointer-events-none" />
              <Input
                placeholder="Cari berdasarkan judul..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.currentTarget.value)}
                className="pl-8 h-8 text-sm"
              />
            </div>
          </div>

          {/* Search results */}
          {searching ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="size-5 animate-spin text-slate-400" />
            </div>
          ) : searchResults.length === 0 ? (
            <div className="text-center py-4">
              <p className="text-sm text-slate-400">
                {searchQuery
                  ? "Tidak ada work item ditemukan."
                  : "Semua work item sudah terhubung atau belum ada work item."}
              </p>
            </div>
          ) : (
            <div className="space-y-1.5 max-h-60 overflow-y-auto">
              {searchResults.map((item) => {
                const isLinked = linkedIds.has(item.id);
                const isLinking = linkingId === item.id;
                const justLinked = showSuccess === item.id;

                return (
                  <div
                    key={item.id}
                    className={cn(
                      "flex items-center gap-2 rounded-lg border px-3 py-2 transition-colors",
                      isLinked
                        ? "border-emerald-200 bg-emerald-50"
                        : "border-slate-100 bg-white hover:border-slate-200"
                    )}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-medium text-slate-900 truncate">
                        {item.title}
                      </p>
                      <StatusBadge
                        status={item.status as WorkItemStatus}
                        className="text-[9px] mt-0.5"
                      />
                    </div>
                    {isLinked ? (
                      justLinked ? (
                        <CheckCircle2 className="size-4 text-emerald-500 shrink-0" />
                      ) : (
                        <Badge className="bg-emerald-50 text-emerald-700 text-[10px] shrink-0">
                          Terhubung
                        </Badge>
                      )
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleLink(item.id)}
                        disabled={isLinking}
                        className="shrink-0 h-7 text-[12px]"
                      >
                        {isLinking ? (
                          <Loader2 className="size-3.5 animate-spin" />
                        ) : (
                          <>
                            <Link className="size-3" />
                            Hubungkan
                          </>
                        )}
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Error */}
          {error && (
            <p className="text-sm text-red-500 bg-red-50 rounded-lg px-3 py-2">
              {error}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => handleClose(false)}
          >
            Tutup
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
