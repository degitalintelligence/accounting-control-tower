import type { Json } from "@/lib/supabase/types";

export const notificationEventTypes = [
  "item_assigned",
  "status_changed",
  "comment_added",
  "deadline_approaching",
  "item_overdue",
  "review_requested",
  "review_approved",
  "item_escalated",
  "digest",
] as const;

export type NotificationEventType = (typeof notificationEventTypes)[number];

export interface NotificationEvent {
  eventType: NotificationEventType;
  organizationId: string;
  aggregateType: string;
  aggregateId: string;
  profileIds: string[];
  title: string;
  body?: string | null;
  data?: Record<string, Json>;
  channel?: string;
  dedupKey?: string | null;
}

export interface NotificationRecord {
  id: string;
  event_type: NotificationEventType | string;
  title: string;
  body: string | null;
  data: Record<string, Json>;
  channel: string;
  read_at: string | null;
  created_at: string;
}
