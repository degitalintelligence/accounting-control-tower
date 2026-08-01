"use client";

import { Menu, Search, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { NotificationBell } from "./notification-bell";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ContextualHelpButton } from "@/components/help/contextual-help-sheet";

interface AppHeaderProps {
  onMenuClick: () => void;
  onNewWorkItem: () => void;
  onSearch: () => void;
  onHelp: () => void;
}

export function AppHeader({ onMenuClick, onNewWorkItem, onSearch, onHelp }: AppHeaderProps) {
  const [periodLabel, setPeriodLabel] = useState("Periode");

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setPeriodLabel(
        new Intl.DateTimeFormat("id-ID", {
          month: "long",
          year: "numeric",
          timeZone: "Asia/Jakarta",
        }).format(new Date())
      );
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <header className="sticky top-0 z-20 flex min-h-16 items-center justify-between border-b border-line bg-surface px-4 sm:px-6 lg:px-8">
      <div className="flex items-center gap-2.5">
        <Tooltip>
          <TooltipTrigger
            type="button"
            onClick={onMenuClick}
            className="control-interactive grid size-10 place-items-center rounded-lg border border-line bg-surface lg:hidden"
            aria-label="Buka menu navigasi"
          >
            <Menu className="size-[18px]" />
          </TooltipTrigger>
          <TooltipContent>Buka menu navigasi</TooltipContent>
        </Tooltip>

        <div className="hidden items-center gap-2.5 text-sm text-muted-foreground sm:flex">
          <span>Periode</span>
          <button type="button" className="control-interactive rounded-lg border border-line bg-surface px-3 py-2 font-semibold text-foreground">
            {periodLabel}
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Tooltip>
          <TooltipTrigger
            type="button"
            onClick={onSearch}
            className="control-interactive hidden size-10 place-items-center rounded-lg border border-line bg-surface sm:grid"
            aria-label="Cari pekerjaan"
          >
            <Search className="size-[16px] text-[#6f7a77]" />
          </TooltipTrigger>
          <TooltipContent>Cari pekerjaan</TooltipContent>
        </Tooltip>

        <ContextualHelpButton onClick={onHelp} />

        <NotificationBell />

        <Button
          type="button"
          onClick={onNewWorkItem}
          size="default"
          className="cta-primary h-10 gap-1.5 rounded-lg px-3.5 shadow-sm"
          aria-label="Buat pekerjaan baru"
        >
          <Plus className="size-4" />
          <span className="hidden sm:inline">Pekerjaan baru</span>
        </Button>
      </div>
    </header>
  );
}
