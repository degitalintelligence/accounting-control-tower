"use client";

import { useCallback, useEffect, useState } from "react";
import type { NotificationRecord } from "@/types/notification";

interface NotificationsResponse {
  data: NotificationRecord[];
  unread_count: number;
}

export function useNotifications() {
  const [notifications, setNotifications] = useState<NotificationRecord[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const fetchNotifications = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/notifications?limit=8", { cache: "no-store" });
      if (!response.ok) return;
      const result = (await response.json()) as NotificationsResponse;
      setNotifications(result.data);
      setUnreadCount(result.unread_count);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => fetchNotifications());
  }, [fetchNotifications]);

  const markAsRead = useCallback(async (id: string) => {
    const response = await fetch(`/api/notifications/${id}/read`, { method: "PATCH" });
    if (!response.ok) return;
    setNotifications((current) => current.map((item) => item.id === id ? { ...item, read_at: new Date().toISOString() } : item));
    setUnreadCount((current) => Math.max(0, current - 1));
  }, []);

  const markAllAsRead = useCallback(async () => {
    const response = await fetch("/api/notifications/read-all", { method: "PATCH" });
    if (!response.ok) return;
    const now = new Date().toISOString();
    setNotifications((current) => current.map((item) => ({ ...item, read_at: item.read_at ?? now })));
    setUnreadCount(0);
  }, []);

  return { notifications, unreadCount, loading, refresh: fetchNotifications, markAsRead, markAllAsRead };
}
