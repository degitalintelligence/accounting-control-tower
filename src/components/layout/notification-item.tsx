"use client";

import Link from "next/link";
import { Bell, CheckCircle2, ClipboardCheck, MessageSquare, UserPlus } from "lucide-react";
import type { NotificationRecord } from "@/types/notification";

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
  const workItemId = typeof notification.data.work_item_id === "string" ? notification.data.work_item_id : null;
  const content = (
    <div className={`flex gap-3 border-b border-[#eef1ee] px-4 py-3 text-left transition hover:bg-[#f7f9f7] ${notification.read_at ? "" : "bg-blue-50/40"}`}>
      <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full bg-blue-50 text-blue-600">
        <Icon className="size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[12px] font-bold text-[#18201f]">{notification.title}</span>
        {notification.body && <span className="mt-0.5 block line-clamp-2 text-[11px] text-[#6f7a77]">{notification.body}</span>}
        <span className="mt-1 block text-[10px] text-[#9aa39f]">{formatNotificationDate(notification.created_at)}</span>
      </span>
      {!notification.read_at && <span className="mt-2 size-1.5 shrink-0 rounded-full bg-blue-600" />}
    </div>
  );

  if (workItemId) {
    return <Link href={`/work-items/${workItemId}`} onClick={() => onRead(notification.id)}>{content}</Link>;
  }
  return <button className="block w-full" onClick={() => onRead(notification.id)}>{content}</button>;
}

function formatNotificationDate(value: string) {
  return new Intl.DateTimeFormat("id-ID", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}
