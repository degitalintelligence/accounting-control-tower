"use client";

import { useState, useEffect, useCallback } from "react";
import type { ProjectWithDetails } from "@/types/project";

interface ProjectFilter {
  status?: string;
  search?: string;
  page?: number;
  limit?: number;
}

interface UseProjectsReturn {
  projects: ProjectWithDetails[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useProjects(filters: ProjectFilter = {}): UseProjectsReturn {
  const [projects, setProjects] = useState<ProjectWithDetails[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const { status, search, page = 1, limit = 20 } = filters;

  const fetchProjects = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (status) params.set("status", status);
      if (search) params.set("search", search);
      params.set("page", String(page));
      params.set("limit", String(limit));

      const res = await fetch(`/api/projects?${params.toString()}`);

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? "Gagal mengambil data project.");
      }

      const body = await res.json();
      setProjects(body.data ?? []);
      setTotal(body.total ?? 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Terjadi kesalahan tidak diketahui.");
    } finally {
      setLoading(false);
    }
  }, [status, search, page, limit]);

  useEffect(() => {
    queueMicrotask(() => fetchProjects());
  }, [fetchProjects]);

  return {
    projects,
    total,
    page,
    limit,
    totalPages: Math.max(1, Math.ceil(total / limit)),
    loading,
    error,
    refetch: fetchProjects,
  };
}
