"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Search, Plus } from "lucide-react";
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

interface WorkItemFiltersProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  onCreateClick: () => void;
}

const TABS = [
  { value: "all", label: "Semua" },
  { value: "mine", label: "Tugas Saya" },
  { value: "overdue", label: "Terlambat" },
];

const STATUS_OPTIONS = [
  { value: "", label: "Semua Status" },
  { value: "draft", label: "Draft" },
  { value: "assigned", label: "Ditugaskan" },
  { value: "in_progress", label: "Sedang Dikerjakan" },
  { value: "blocked", label: "Terblokir" },
  { value: "submitted", label: "Menunggu Review" },
  { value: "under_review", label: "Sedang Direview" },
  { value: "revision_required", label: "Perlu Revisi" },
  { value: "awaiting_approval", label: "Menunggu Persetujuan" },
  { value: "approved", label: "Disetujui" },
  { value: "completed", label: "Selesai" },
  { value: "cancelled", label: "Dibatalkan" },
];

const TYPE_OPTIONS = [
  { value: "", label: "Semua Jenis" },
  { value: "routine", label: "Rutin" },
  { value: "project", label: "Proyek" },
  { value: "ad_hoc", label: "Ad Hoc" },
  { value: "report", label: "Laporan" },
];

const PRIORITY_OPTIONS = [
  { value: "", label: "Semua Prioritas" },
  { value: "low", label: "Rendah" },
  { value: "medium", label: "Sedang" },
  { value: "high", label: "Tinggi" },
  { value: "critical", label: "Kritis" },
];

export function WorkItemFilters({
  activeTab,
  onTabChange,
  onCreateClick,
}: WorkItemFiltersProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const currentSearch = searchParams.get("search") ?? "";
  const currentStatus = searchParams.get("status") ?? "";
  const currentType = searchParams.get("type") ?? "";
  const currentPriority = searchParams.get("priority") ?? "";

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
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Work Items</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Kelola semua pekerjaan tim Anda
          </p>
        </div>
        <Button
          onClick={onCreateClick}
          className="bg-orange-500 hover:bg-orange-600 text-white font-bold shrink-0"
        >
          <Plus className="size-4" />
          Buat Work Item
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-slate-200">
        {TABS.map((tab) => (
          <button
            key={tab.value}
            type="button"
            onClick={() => onTabChange(tab.value)}
            className={cn(
              "px-4 py-2.5 text-[13px] font-medium border-b-2 -mb-px transition-colors",
              activeTab === tab.value
                ? "border-slate-900 text-slate-900"
                : "border-transparent text-slate-400 hover:text-slate-600"
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Filter bar */}
      <div className="flex flex-col sm:flex-row gap-2">
        {/* Search */}
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-slate-400 pointer-events-none" />
          <Input
            id="work-item-search"
            placeholder="Cari work item..."
            defaultValue={currentSearch}
            onChange={(e) => updateParam("search", e.currentTarget.value)}
            className="pl-8 h-8 text-sm bg-white"
          />
        </div>

        {/* Status filter */}
        <Select
          value={currentStatus || null}
          onValueChange={(val) => updateParam("status", (val as string) ?? "")}
        >
          <SelectTrigger className="h-8 text-sm bg-white min-w-[140px]">
            <SelectValue placeholder="Semua Status" />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((opt) => (
              <SelectItem key={opt.value || "__all__"} value={opt.value || "__all__"}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Type filter */}
        <Select
          value={currentType || null}
          onValueChange={(val) => updateParam("type", (val as string) ?? "")}
        >
          <SelectTrigger className="h-8 text-sm bg-white min-w-[130px]">
            <SelectValue placeholder="Semua Jenis" />
          </SelectTrigger>
          <SelectContent>
            {TYPE_OPTIONS.map((opt) => (
              <SelectItem key={opt.value || "__all__"} value={opt.value || "__all__"}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Priority filter */}
        <Select
          value={currentPriority || null}
          onValueChange={(val) => updateParam("priority", (val as string) ?? "")}
        >
          <SelectTrigger className="h-8 text-sm bg-white min-w-[140px]">
            <SelectValue placeholder="Semua Prioritas" />
          </SelectTrigger>
          <SelectContent>
            {PRIORITY_OPTIONS.map((opt) => (
              <SelectItem key={opt.value || "__all__"} value={opt.value || "__all__"}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
