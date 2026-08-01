"use client";

import { useState, useEffect, useCallback } from "react";

export interface DashboardStats {
  critical_overdue: number;
  waiting_review: number;
  blocked: number;
  on_time_rate: number;
  total_completed: number;
  total_items: number;
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

export function useDashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [deadlines, setDeadlines] = useState<DeadlineItem[]>([]);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [insights, setInsights] = useState<DashboardInsights | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [statsRes, deadlinesRes, activityRes, insightsRes] = await Promise.all([
        fetch("/api/dashboard/stats"),
        fetch("/api/dashboard/upcoming-deadlines"),
        fetch("/api/dashboard/activity-feed"),
        fetch("/api/ai/insights"),
      ]);

      if (!statsRes.ok || !deadlinesRes.ok || !activityRes.ok || !insightsRes.ok) {
        throw new Error("Failed to fetch dashboard data");
      }

      const [statsData, deadlinesData, activityData, insightsData] = await Promise.all([
        statsRes.json(),
        deadlinesRes.json(),
        activityRes.json(),
        insightsRes.json(),
      ]);

      setStats(statsData);
      setDeadlines(deadlinesData);
      setActivity(activityData);
      setInsights(insightsData.insights ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => fetchAll());
  }, [fetchAll]);

  return { stats, deadlines, activity, insights, loading, error, refetch: fetchAll };
}
