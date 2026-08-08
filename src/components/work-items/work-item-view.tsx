"use client";

import { useMemo } from "react";
import { WorkItemCard } from "./work-item-card";
import type { WorkItem, WorkItemStatus } from "@/types/work-item";

const statuses: { value: WorkItemStatus; label: string }[] = [
  { value: "draft", label: "Draft" },
  { value: "assigned", label: "Ditugaskan" },
  { value: "in_progress", label: "Dikerjakan" },
  { value: "submitted", label: "Menunggu Review" },
  { value: "under_review", label: "Direview" },
  { value: "revision_required", label: "Perlu Revisi" },
  { value: "approved", label: "Disetujui" },
  { value: "completed", label: "Selesai" },
];

function Card({ item }: { item: WorkItem }) {
  return <WorkItemCard id={item.id} title={item.title} type={item.type} status={item.status} priority={item.priority} due_at={item.due_at} assignments={item.assignments} />;
}

export function WorkItemView({ view, items }: { view: string; items: WorkItem[] }) {
  // Kelompokkan item per status sekali (hindari items.filter berulang per status di board view)
  const boardGroups = useMemo(() => {
    const groups = new Map<WorkItemStatus, WorkItem[]>(statuses.map((status) => [status.value, []]));
    for (const item of items) groups.get(item.status)?.push(item);
    return groups;
  }, [items]);

  if (view === "board") {
    return <div className="grid grid-cols-1 gap-3 overflow-x-auto md:grid-cols-4 xl:grid-cols-8">{statuses.map((status) => { const statusItems = boardGroups.get(status.value) ?? []; return <section key={status.value} className="min-w-[220px] rounded-xl bg-slate-100/70 p-2"><h2 className="mb-2 px-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{status.label} <span className="font-normal">({statusItems.length})</span></h2><div className="space-y-2">{statusItems.map((item) => <Card key={item.id} item={item} />)}</div></section>; })}</div>;
  }

  if (view === "calendar") {
    const grouped = new Map<string, WorkItem[]>();
    for (const item of items) { const key = item.due_at ? new Date(item.due_at).toLocaleDateString("id-ID", { day: "2-digit", month: "long", year: "numeric" }) : "Tanpa tenggat"; grouped.set(key, [...(grouped.get(key) ?? []), item]); }
    return <div className="space-y-4">{[...grouped.entries()].map(([date, dateItems]) => <section key={date}><h2 className="mb-2 text-sm font-semibold text-slate-700">{date}</h2><div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">{dateItems.map((item) => <Card key={item.id} item={item} />)}</div></section>)}</div>;
  }

  if (view === "outline") {
    const roots = items.filter((item) => !item.parent_id);
    const children = new Map<string, WorkItem[]>();
    for (const item of items.filter((candidate) => candidate.parent_id)) children.set(item.parent_id!, [...(children.get(item.parent_id!) ?? []), item]);
    return <div className="space-y-2">{roots.map((root) => <div key={root.id} className="rounded-xl border border-slate-200 bg-white p-3"><Card item={root} />{(children.get(root.id) ?? []).map((child) => <div key={child.id} className="ml-6 mt-2 border-l-2 border-slate-200 pl-3"><Card item={child} /></div>)}</div>)}</div>;
  }

  return <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">{items.map((item) => <Card key={item.id} item={item} />)}</div>;
}
