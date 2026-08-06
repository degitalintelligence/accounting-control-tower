"use client";

import Link from "next/link";
import { Bell, CheckCircle2, ClipboardCheck, MessageSquare, UserPlus } from "lucide-react";
import type { NotificationRecord } from "@/types/notification";
import { useI18n } from "@/components/i18n-provider";

const icons = {
  item_assigned: UserPlus,
  status_changed: ClipboardCheck,
  comment_added: MessageSquare,
  review_requested: ClipboardCheck,
  review_approved: CheckCircle2,
  deadline_approaching: Bell,
  item_overdue: Bell,
} as const;

interface NotificationItemProps {
  notification: NotificationRecord;
  onRead: (id: string) => void;
}

export function NotificationItem({ notification, onRead }: NotificationItemProps) {
  const Icon = icons[notification.event_type as keyof typeof icons] ?? Bell;
  const { locale, t } = useI18n();
  const workItemId = typeof notification.data.work_item_id === "string" ? notification.data.work_item_id : null;
  const content = (
    <div className={`flex gap-3 border-b border-line-soft px-4 py-3 text-left transition hover:bg-muted ${notification.read_at ? "" : "bg-sentinel-blue-soft/40"}`}>
      <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full bg-sentinel-blue-soft text-primary">
        <Icon className="size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-bold text-ink">{notification.title}</span>
        {notification.body && <span className="mt-0.5 block line-clamp-2 text-sm text-muted-foreground">{notification.body}</span>}
        <span className="mt-1 block text-xs text-muted-foreground">{formatNotificationDate(notification.created_at, locale)}</span>
      </span>
      {!notification.read_at && <span aria-label={t("common.unreadNotification")} className="mt-2 size-1.5 shrink-0 rounded-full bg-primary" />}
    </div>
  );

  if (workItemId) {
    return <Link href={`/work-items/${workItemId}`} onClick={() => onRead(notification.id)}>{content}</Link>;
  }
  return <button className="block w-full" onClick={() => onRead(notification.id)}>{content}</button>;
}

function formatNotificationDate(value: string, locale: string) {
    return new Intl.DateTimeFormat(locale, { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}
