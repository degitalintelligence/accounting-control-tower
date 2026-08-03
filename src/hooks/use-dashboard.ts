"use client";

import { useState, useEffect, useCallback } from "react";
import type { DashboardKpis } from "@/types/dashboard";

export interface DashboardStats {
  critical_overdue: number;
  waiting_review: number;
  blocked: number;
  on_time_rate: number;
  total_completed: number;
  total_items: number;
  average_cycle_hours?: number | null;
  revision_rate?: number | null;
  high_risk_open?: number | null;
  overdue_weight?: number | null;
  audit_coverage_rate?: number | null;
}

export interface DeadlineItem {
  id: string;
  title: string;
  type: string;
  priority: string;
  status: string;
  due_at: string;
  due_label: string;
  is_overdue: boolean;
  risk_level: string;
  assignee_name: string;
  assignee_initials: string;
}

export interface ActivityItem {
  id: string;
  action: string;
  entity_type: string;
  entity_id: string;
  actor_name: string;
  time_ago: string;
  created_at: string;
}

export interface DashboardInsights {
  summary: string;
  priorities: string[];
  signals: string[];
}

export interface DashboardSections {
  exceptions: ExceptionItem[];
  reviews: ReviewItem[];
  closing: ParentTask[];
  exceptionCount: number;
  reviewCount: number;
  overallProgress: number;
}

export interface ExceptionItem { id: string; severity: "critical" | "warning" | "blocked"; tag: string; taskId: string; title: string; description: string; assignee: string; assigneeInitials: string; actionLabel: string }
export interface ReviewItem { id: string; fileIcon: "X" | "S" | "P"; title: string; submitter: string; submitterInitials: string; time: string; risk: "high" | "medium" | "low"; riskLabel: string }
export interface ChildTask { id: string; name: string; assignee: string; assigneeInitials: string; status: string; checkStatus: "done" | "partial" | "danger"; progress: number }
export interface ParentTask { id: string; name: string; progress: number; children: ChildTask[] }

export function useDashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [deadlines, setDeadlines] = useState<DeadlineItem[]>([]);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [insights, setInsights] = useState<DashboardInsights | null>(null);
  const [kpis, setKpis] = useState<DashboardKpis | null>(null);
  const [sections, setSections] = useState<DashboardSections | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [partialFailures, setPartialFailures] = useState<string[]>([]);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    setPartialFailures([]);

    try {
      const responses = await Promise.allSettled([
        fetch("/api/dashboard/stats"),
        fetch("/api/dashboard/kpis"),
        fetch("/api/dashboard/upcoming-deadlines"),
        fetch("/api/dashboard/activity-feed"),
        fetch("/api/ai/insights"),
        fetch("/api/dashboard/sections"),
      ]);
      const names = ["statistik", "KPI", "deadline", "aktivitas", "insight", "bagian dashboard"];
      const failed = responses.flatMap((result, index) => result.status === "rejected" || (result.value && !result.value.ok) ? [names[index]] : []);
      setPartialFailures(failed);
      if (failed.length === responses.length) throw new Error("Data dashboard belum dapat dimuat.");

      const data = await Promise.all(responses.map(async (result) => result.status === "fulfilled" && result.value.ok ? result.value.json() as Promise<unknown> : null));
      setStats(data[0] as DashboardStats | null);
      setKpis(data[1] as DashboardKpis | null);
      setDeadlines((data[2] ?? []) as DeadlineItem[]);
      setActivity((data[3] ?? []) as ActivityItem[]);
      setInsights((data[4] as { insights?: DashboardInsights } | null)?.insights ?? null);
      setSections(data[5] as DashboardSections | null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => fetchAll());
    const handleWorkspaceChange = () => { void fetchAll(); };
    window.addEventListener("workspace-changed", handleWorkspaceChange);
    return () => window.removeEventListener("workspace-changed", handleWorkspaceChange);
  }, [fetchAll]);

  return { stats, kpis, deadlines, activity, insights, sections, loading, error, partialFailures, refetch: fetchAll };
}
