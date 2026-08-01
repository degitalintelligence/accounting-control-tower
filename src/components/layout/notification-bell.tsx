"use client";

import { Bell } from "lucide-react";
import { useNotifications } from "@/hooks/use-notifications";
import { NotificationItem } from "./notification-item";

export function NotificationBell() {
  const { notifications, unreadCount, loading, markAsRead, markAllAsRead } = useNotifications();

  return (
    <details className="relative">
      <summary className="grid size-9 cursor-pointer list-none place-items-center rounded-lg border border-[#dfe4e1] bg-white [&::-webkit-details-marker]:hidden" aria-label="Notifikasi">
        <Bell className="size-[16px] text-[#6f7a77]" />
        {unreadCount > 0 && <span className="absolute right-[7px] top-[7px] min-w-1.5 rounded-full bg-[#c94040] px-1 text-[9px] leading-3 text-white">{unreadCount > 9 ? "9+" : unreadCount}</span>}
      </summary>
      <div className="absolute right-0 top-11 z-30 w-[min( calc(100vw-2rem),380px)] overflow-hidden rounded-xl border border-[#dfe4e1] bg-white shadow-lg">
        <div className="flex items-center justify-between border-b border-[#eef1ee] px-4 py-3">
          <h2 className="text-[13px] font-bold text-[#18201f]">Notifikasi</h2>
          <button className="text-[11px] font-semibold text-blue-600 disabled:text-[#aeb6b2]" onClick={markAllAsRead} disabled={unreadCount === 0}>Tandai semua dibaca</button>
        </div>
        <div className="max-h-[min(65vh,420px)] overflow-y-auto">
          {loading && <p className="px-4 py-8 text-center text-[12px] text-[#6f7a77]">Memuat notifikasi...</p>}
          {!loading && notifications.length === 0 && <p className="px-4 py-8 text-center text-[12px] text-[#6f7a77]">Belum ada notifikasi.</p>}
          {!loading && notifications.map((notification) => <NotificationItem key={notification.id} notification={notification} onRead={markAsRead} />)}
        </div>
      </div>
    </details>
  );
}
