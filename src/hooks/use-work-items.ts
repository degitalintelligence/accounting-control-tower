"use client";

import { useState, useEffect, useCallback } from "react";
import type { WorkItem, WorkItemStatus, WorkItemType, WorkItemPriority } from "@/types/work-item";

interface WorkItemFilter {
  status?: WorkItemStatus;
  type?: WorkItemType;
  priority?: WorkItemPriority;
  client_id?: string;
  entity_id?: string;
  section_id?: string;
  risk_level?: string;
  period_from?: string;
  period_to?: string;
  source_type?: string;
  search?: string;
  assignee_id?: string;
  overdue_only?: boolean;
  page?: number;
  limit?: number;
}

interface UseWorkItemsReturn {
  items: WorkItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  loading: boolean;
  error: string | null;
  refetch: () => void;
  setFilter: (filter: Partial<WorkItemFilter>) => void;
  filter: WorkItemFilter;
}

export function useWorkItems(initialFilter: WorkItemFilter = {}): UseWorkItemsReturn {
  const [items, setItems] = useState<WorkItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(initialFilter.page ?? 1);
  const [limit] = useState(initialFilter.limit ?? 20);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilterState] = useState<WorkItemFilter>(initialFilter);
  const initialFilterKey = JSON.stringify(initialFilter);

  useEffect(() => {
    queueMicrotask(() => {
      setFilterState((current) => (JSON.stringify(current) === initialFilterKey ? current : initialFilter));
      setPage((current) => (current === (initialFilter.page ?? 1) ? current : initialFilter.page ?? 1));
    });
  }, [initialFilterKey, initialFilter]);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (filter.status) params.set("status", filter.status);
      if (filter.type) params.set("type", filter.type);
      if (filter.priority) params.set("priority", filter.priority);
      if (filter.client_id) params.set("client_id", filter.client_id);
      if (filter.entity_id) params.set("entity_id", filter.entity_id);
      if (filter.section_id) params.set("section_id", filter.section_id);
      if (filter.risk_level) params.set("risk_level", filter.risk_level);
      if (filter.period_from) params.set("period_from", filter.period_from);
      if (filter.period_to) params.set("period_to", filter.period_to);
      if (filter.source_type) params.set("source_type", filter.source_type);
      if (filter.search) params.set("search", filter.search);
      if (filter.assignee_id) params.set("assignee_id", filter.assignee_id);
      if (filter.overdue_only) params.set("overdue_only", "true");
      params.set("page", String(page));
      params.set("limit", String(limit));

      const res = await fetch(`/api/work-items?${params.toString()}`);

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? "Gagal mengambil data work items.");
      }

      const body = await res.json();
      setItems(body.data ?? []);
      setTotal(body.total ?? 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Terjadi kesalahan tidak diketahui.");
    } finally {
      setLoading(false);
    }
  }, [filter, page, limit]);

  useEffect(() => {
    queueMicrotask(() => fetchItems());
  }, [fetchItems]);

  const setFilter = useCallback((patch: Partial<WorkItemFilter>) => {
    setFilterState((prev) => ({ ...prev, ...patch }));
    setPage(1);
  }, []);

  return {
    items,
    total,
    page,
    limit,
    totalPages: Math.max(1, Math.ceil(total / limit)),
    loading,
    error,
    refetch: fetchItems,
    setFilter,
    filter,
  };
}
