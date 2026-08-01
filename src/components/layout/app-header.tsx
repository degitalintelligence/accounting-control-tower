"use client";

import { Menu, Search, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NotificationBell } from "./notification-bell";

interface AppHeaderProps {
  onMenuClick: () => void;
  onNewWorkItem: () => void;
  onSearch: () => void;
}

export function AppHeader({ onMenuClick, onNewWorkItem, onSearch }: AppHeaderProps) {
  const now = new Date();
  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];
  const periodLabel = `${monthNames[now.getMonth()]} ${now.getFullYear()}`;

  return (
    <header className="sticky top-0 z-20 flex h-[67px] items-center justify-between border-b border-[#dfe4e1] bg-white px-4 sm:px-[30px]">
      {/* Left: mobile menu + period picker */}
      <div className="flex items-center gap-2.5">
        <button
          onClick={onMenuClick}
          className="grid size-9 place-items-center rounded-lg border border-[#dfe4e1] bg-white lg:hidden"
          aria-label="Buka menu"
        >
          <Menu className="size-[18px]" />
        </button>

        <div className="hidden items-center gap-2.5 text-[12px] text-[#6f7a77] sm:flex">
          <span className="text-[12px]">Period</span>
          <button className="rounded-lg border border-[#dfe4e1] bg-white px-[11px] py-2 text-[12px] font-semibold text-[#18201f]">
            {periodLabel}
          </button>
        </div>
      </div>

      {/* Right: actions */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onSearch}
          className="hidden size-9 place-items-center rounded-lg border border-[#dfe4e1] bg-white sm:grid"
          aria-label="Cari"
        >
          <Search className="size-[16px] text-[#6f7a77]" />
        </button>

        <NotificationBell />

        <Button
          type="button"
          onClick={onNewWorkItem}
          size="default"
          className="gap-1.5 rounded-lg bg-[#18201f] px-3.5 py-2.5 text-[12px] font-bold text-white shadow-[0_3px_8px_rgba(24,32,31,.12)] hover:bg-[#2d3937]"
        >
          <Plus className="size-4" />
          <span className="hidden sm:inline">New Task</span>
        </Button>
      </div>
    </header>
  );
}
