"use client";

import { useState, useEffect, useCallback } from "react";
import type { TaskTemplate, TemplateVersion } from "@/types/template";

interface TemplateListItem extends TaskTemplate {
  latest_version: TemplateVersion | null;
  client_name?: string;
}

interface TemplateFilter {
  type?: string;
  client_id?: string;
  search?: string;
  page?: number;
  limit?: number;
}

interface UseTemplatesReturn {
  templates: TemplateListItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  loading: boolean;
  error: string | null;
  refetch: () => void;
  setFilter: (filter: Partial<TemplateFilter>) => void;
  filter: TemplateFilter;
}

export function useTemplates(initialFilter: TemplateFilter = {}): UseTemplatesReturn {
  const [templates, setTemplates] = useState<TemplateListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(initialFilter.page ?? 1);
  const [limit] = useState(initialFilter.limit ?? 20);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilterState] = useState<TemplateFilter>(initialFilter);

  const fetchTemplates = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (filter.type) params.set("type", filter.type);
      if (filter.client_id) params.set("client_id", filter.client_id);
      if (filter.search) params.set("search", filter.search);
      params.set("page", String(page));
      params.set("limit", String(limit));

      const res = await fetch(`/api/templates?${params.toString()}`);

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? "Gagal mengambil data template.");
      }

      const body = await res.json();
      setTemplates(body.data ?? []);
      setTotal(body.total ?? 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Terjadi kesalahan tidak diketahui.");
    } finally {
      setLoading(false);
    }
  }, [filter, page, limit]);

  useEffect(() => {
    queueMicrotask(() => fetchTemplates());
  }, [fetchTemplates]);

  const setFilter = useCallback((patch: Partial<TemplateFilter>) => {
    setFilterState((prev) => ({ ...prev, ...patch }));
    setPage(1);
  }, []);

  return {
    templates,
    total,
    page,
    limit,
    totalPages: Math.max(1, Math.ceil(total / limit)),
    loading,
    error,
    refetch: fetchTemplates,
    setFilter,
    filter,
  };
}
