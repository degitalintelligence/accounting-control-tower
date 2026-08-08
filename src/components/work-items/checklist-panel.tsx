"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, Circle, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { WorkItemChecklist } from "@/types/checklist";
import type { Assignment } from "@/types/work-item";
import { useI18n } from "@/components/i18n-provider";
import { usePermissions } from "@/hooks/use-permissions";
import { useAuthStore } from "@/stores/auth-store";

export function ChecklistPanel({ workItemId, assignments = [] }: { workItemId: string; assignments?: Assignment[] }) {
  const [checklist, setChecklist] = useState<WorkItemChecklist | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const debounceTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const { t } = useI18n();
  const { has } = usePermissions();
  const currentUserId = useAuthStore((s) => s.user?.id);

  // Bersihkan timer debounce saat komponen unmount
  useEffect(() => {
    const timers = debounceTimers.current;
    return () => { for (const timer of Object.values(timers)) clearTimeout(timer); };
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    const response = await fetch(`/api/work-items/${workItemId}/checklist`);
    const body = await response.json().catch(() => null);
    if (!response.ok) setError(body?.error ?? t("work.checklistLoadError"));
    else setChecklist(body?.data ?? null);
    setLoading(false);
  }, [workItemId]);

  useEffect(() => { queueMicrotask(() => load()); }, [load]);

  async function save(itemId: string, value: string, fileId?: string | null) {
    setSaving(itemId);
    setError(null);
    const response = await fetch(`/api/work-items/${workItemId}/checklist`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ checklist_item_id: itemId, value, file_id: fileId ?? null }),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      setError(body?.error ?? t("work.checklistSaveError"));
    } else await load();
    setSaving(null);
  }

  if (loading) return <Card><CardContent className="p-6 flex justify-center"><Loader2 className="size-5 animate-spin text-slate-400" /></CardContent></Card>;
  if (error) return <Card><CardContent className="p-4 text-sm text-red-600">{error}</CardContent></Card>;
  if (!checklist?.template) return null;

  const items = checklist.template.items ?? [];
  const responseMap = new Map(checklist.responses.map((response) => [response.checklist_item_id, response]));
  
  // RBAC: Hanya assigned user dengan role yang sesuai target_role template, atau user dengan permission execute.
  const canExecute = has("work_items.execute");
  const myAssignment = assignments.find(a => a.profile_id === currentUserId && !a.unassigned_at);
  const isTargetRole = myAssignment?.role === checklist.template.target_role;
  const isAllowedToEdit = canExecute || isTargetRole;
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle className="text-sm">{t("work.checklist")}</CardTitle>
            <p className="text-xs text-slate-500 mt-1">{checklist.template.name}</p>
          </div>
          <span className="text-xs font-medium text-slate-500">{checklist.required_completed}/{checklist.required_total} {t("common.required")}</span>
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
                {item.input_type === "checkbox" || item.input_type === "confirmation" ? (
                  <Button type="button" size="sm" variant={completed ? "secondary" : "outline"} disabled={saving === item.id || !isAllowedToEdit} onClick={() => save(item.id, completed ? "" : "true")}>
                    {saving === item.id ? <Loader2 className="size-3.5 animate-spin" /> : completed ? t("common.completed") : t("common.markComplete")}
                  </Button>
                ) : item.input_type === "file" ? (
                  <Input type="file" disabled={saving === item.id || !isAllowedToEdit} onChange={async (event) => {
                    const file = event.target.files?.[0];
                    if (file) {
                      const form = new FormData();
                      form.set("file", file);
                      const upload = await fetch(`/api/work-items/${workItemId}/files`, { method: "POST", body: form });
                      const uploaded = await upload.json().catch(() => null) as { data?: { file?: { id?: string } } } | null;
                      if (!upload.ok || !uploaded?.data?.file?.id) {
                        setError(t("work.checklistUploadError"));
                        return;
                      }
                      await save(item.id, file.name, uploaded.data.file.id);
                    }
                  }} />
                ) : (
                  <Input type={item.input_type === "url" ? "url" : item.input_type} value={drafts[item.id] ?? value} disabled={saving === item.id || !isAllowedToEdit} onChange={(event) => {
                    const next = event.target.value;
                    setDrafts((prev) => ({ ...prev, [item.id]: next }));
                    if (debounceTimers.current[item.id]) clearTimeout(debounceTimers.current[item.id]);
                    debounceTimers.current[item.id] = setTimeout(() => {
                      setDrafts((prev) => { const copy = { ...prev }; delete copy[item.id]; return copy; });
                      void save(item.id, next);
                    }, 400);
                  }} />
                )}
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
