"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search, Plus, CalendarDays, Kanban, List, Network } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useI18n } from "@/components/i18n-provider";

interface WorkItemFiltersProps {
  activeTab: string;
  view: string;
  onTabChange: (tab: string) => void;
  onViewChange: (view: string) => void;
  onCreateClick: () => void;
}

const TABS = [
  { value: "all", key: "work.all" },
  { value: "mine", key: "work.mine" },
  { value: "overdue", key: "work.overdue" },
];

const STATUS_OPTIONS = [
  { value: "", key: "work.allStatus" },
  { value: "draft", key: "status.draft" },
  { value: "assigned", key: "status.assigned" },
  { value: "in_progress", key: "status.inProgress" },
  { value: "blocked", key: "status.blocked" },
  { value: "submitted", key: "status.submitted" },
  { value: "under_review", key: "status.underReview" },
  { value: "revision_required", key: "status.revisionRequired" },
  { value: "awaiting_approval", key: "status.awaitingApproval" },
  { value: "approved", key: "status.approved" },
  { value: "completed", key: "status.completed" },
  { value: "cancelled", key: "status.cancelled" },
];

const TYPE_OPTIONS = [
  { value: "", key: "work.allTypes" },
  { value: "routine", key: "work.routine" },
  { value: "project", key: "work.project" },
  { value: "ad_hoc", key: "work.adHoc" },
  { value: "report", key: "work.report" },
];

const PRIORITY_OPTIONS = [
  { value: "", key: "work.allPriorities" },
  { value: "low", key: "priority.low" },
  { value: "medium", key: "priority.medium" },
  { value: "high", key: "priority.high" },
  { value: "critical", key: "priority.critical" },
];

export function WorkItemFilters({
  activeTab,
  view,
  onTabChange,
  onViewChange,
  onCreateClick,
}: WorkItemFiltersProps) {
  const router = useRouter();
  const { t } = useI18n();
  const searchParams = useSearchParams();

  const currentSearch = searchParams.get("search") ?? "";
  const currentStatus = searchParams.get("status") ?? "";
  const currentType = searchParams.get("type") ?? "";
  const currentPriority = searchParams.get("priority") ?? "";

  const [searchInput, setSearchInput] = useState(currentSearch);

  // Debounce perubahan search agar tidak trigger router.push per karakter
  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchInput !== currentSearch) updateParam("search", searchInput);
    }, 350);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  const views = [
    { value: "list", label: t("work.list"), icon: List },
    { value: "board", label: t("work.board"), icon: Kanban },
    { value: "calendar", label: t("work.calendar"), icon: CalendarDays },
    { value: "outline", label: t("work.outline"), icon: Network },
  ];

  function updateParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    params.delete("page");
    router.push(`?${params.toString()}`);
  }

  return (
    <div className="space-y-3">
      {/* Header + CTA */}
      <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">{t("work.title")}</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {t("work.description")}
          </p>
        </div>
        <Button
          onClick={onCreateClick}
          className="bg-orange-500 hover:bg-orange-600 text-white font-bold shrink-0"
        >
          <Plus className="size-4" />
          {t("work.create")}
        </Button>
      </div>

      {/* Tabs */}
      <div className="scrollbar-subtle flex gap-1 overflow-x-auto border-b border-slate-200">
        {TABS.map((tab) => (
          <Tooltip key={tab.value}>
            <TooltipTrigger
              type="button"
              onClick={() => onTabChange(tab.value)}
              className={cn(
                "whitespace-nowrap px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors",
                activeTab === tab.value
                  ? "border-slate-900 text-slate-900"
                  : "border-transparent text-slate-400 hover:text-slate-600"
              )}
              aria-label={`Tampilkan ${t(tab.key as never).toLowerCase()}`}
            >
              {t(tab.key as never)}
            </TooltipTrigger>
            <TooltipContent>
              {tab.value === "overdue" ? "Tampilkan pekerjaan melewati tenggat" : `Tampilkan ${t(tab.key as never).toLowerCase()}`}
            </TooltipContent>
          </Tooltip>
        ))}
      </div>

      {/* Filter bar */}
      <div className="flex flex-col sm:flex-row gap-2">
        {/* Search */}
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-slate-400 pointer-events-none" />
          <Input
            id="work-item-search"
            placeholder={t("work.searchPlaceholder")}
            value={searchInput}
            onChange={(e) => setSearchInput(e.currentTarget.value)}
            className="pl-8 h-8 text-sm bg-white"
          />
        </div>

        {/* Status filter */}
        <Select
          value={currentStatus || null}
          onValueChange={(val) => updateParam("status", val === "__all__" ? "" : (val as string) ?? "")}
        >
          <SelectTrigger className="h-8 text-sm bg-white min-w-[140px]">
            <SelectValue placeholder={t("work.allStatus")} />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((opt) => (
              <SelectItem key={opt.value || "__all__"} value={opt.value || "__all__"}>
                {t(opt.key as never)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Type filter */}
        <Select
          value={currentType || null}
          onValueChange={(val) => updateParam("type", val === "__all__" ? "" : (val as string) ?? "")}
        >
          <SelectTrigger className="h-8 text-sm bg-white min-w-[130px]">
            <SelectValue placeholder={t("work.allTypes")} />
          </SelectTrigger>
          <SelectContent>
            {TYPE_OPTIONS.map((opt) => (
              <SelectItem key={opt.value || "__all__"} value={opt.value || "__all__"}>
                {t(opt.key as never)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Priority filter */}
        <Select
          value={currentPriority || null}
          onValueChange={(val) => updateParam("priority", val === "__all__" ? "" : (val as string) ?? "")}
        >
          <SelectTrigger className="h-8 text-sm bg-white min-w-[140px]">
            <SelectValue placeholder={t("work.allPriorities")} />
          </SelectTrigger>
          <SelectContent>
            {PRIORITY_OPTIONS.map((opt) => (
              <SelectItem key={opt.value || "__all__"} value={opt.value || "__all__"}>
                {t(opt.key as never)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white p-1 w-fit">
        {views.map(({ value, label, icon: Icon }) => (
          <Button key={value} type="button" aria-pressed={view === value} variant={view === value ? "secondary" : "ghost"} size="sm" className="h-7 gap-1.5 text-xs" onClick={() => onViewChange(value)}>
            <Icon className="size-3.5" />
            {label}
          </Button>
        ))}
      </div>
    </div>
  );
}
