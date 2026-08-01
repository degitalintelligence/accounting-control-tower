"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Circle, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { WorkItemChecklist } from "@/types/checklist";

export function ChecklistPanel({ workItemId }: { workItemId: string }) {
  const [checklist, setChecklist] = useState<WorkItemChecklist | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const response = await fetch(`/api/work-items/${workItemId}/checklist`);
    const body = await response.json().catch(() => null);
    if (!response.ok) setError(body?.error ?? "Gagal memuat checklist.");
    else setChecklist(body?.data ?? null);
    setLoading(false);
  }, [workItemId]);

  useEffect(() => { queueMicrotask(() => load()); }, [load]);

  async function save(itemId: string, value: string) {
    setSaving(itemId);
    setError(null);
    const response = await fetch(`/api/work-items/${workItemId}/checklist`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ checklist_item_id: itemId, value }),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      setError(body?.error ?? "Gagal menyimpan checklist.");
    } else await load();
    setSaving(null);
  }

  if (loading) return <Card><CardContent className="p-6 flex justify-center"><Loader2 className="size-5 animate-spin text-slate-400" /></CardContent></Card>;
  if (error) return <Card><CardContent className="p-4 text-sm text-red-600">{error}</CardContent></Card>;
  if (!checklist?.template) return null;

  const items = checklist.template.items ?? [];
  const responseMap = new Map(checklist.responses.map((response) => [response.checklist_item_id, response]));
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle className="text-sm">Checklist SOP</CardTitle>
            <p className="text-xs text-slate-500 mt-1">{checklist.template.name}</p>
          </div>
          <span className="text-xs font-medium text-slate-500">{checklist.required_completed}/{checklist.required_total} wajib</span>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {items.sort((a, b) => a.sort_order - b.sort_order).map((item) => {
          const response = responseMap.get(item.id);
          const value = response?.value ?? "";
          const completed = Boolean(value.trim() || response?.file_id);
          return (
            <div key={item.id} className="flex items-start gap-3 rounded-lg border border-slate-100 p-3">
              {completed ? <CheckCircle2 className="size-4 mt-0.5 text-emerald-500 shrink-0" /> : <Circle className="size-4 mt-0.5 text-slate-300 shrink-0" />}
              <div className="min-w-0 flex-1 space-y-2">
                <label className="text-sm text-slate-700">
                  {item.label} {item.is_required && <span className="text-red-500">*</span>}
                </label>
                {item.input_type === "checkbox" ? (
                  <Button type="button" size="sm" variant={completed ? "secondary" : "outline"} disabled={saving === item.id} onClick={() => save(item.id, completed ? "" : "true")}>
                    {saving === item.id ? <Loader2 className="size-3.5 animate-spin" /> : completed ? "Selesai" : "Tandai selesai"}
                  </Button>
                ) : (
                  <Input type={item.input_type} value={value} disabled={saving === item.id} onChange={(event) => save(item.id, event.target.value)} />
                )}
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
