"use client";

import { Check, Clock3, MessageCircle, Users, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { WaInboxItemData } from "@/hooks/use-wa-inbox";
import { ClientSelect } from "@/components/shared/client-select";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { ActionType } from "@/hooks/use-wa-inbox";
import { useI18n } from "@/components/i18n-provider";
import { formatDate } from "@/lib/i18n";

interface WaInboxItemProps {
  item: WaInboxItemData;
  busy?: boolean;
  onConfirm: (id: string, actionType: ActionType, clientId?: string, targetWorkItemId?: string, duplicateAction?: "warn" | "allow") => Promise<{ duplicateWarning: WaInboxItemData["duplicateWarning"] }>;
  onReject: (id: string) => void;
}

function ConfidenceBar({ value }: { value: number }) {
  const color = value >= 85 ? "bg-emerald-500" : value >= 60 ? "bg-amber-500" : "bg-red-500";

  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
        <div className={cn("h-full rounded-full", color)} style={{ width: `${value}%` }} />
      </div>
      <span className="w-9 text-right text-xs font-semibold text-slate-600">{value}%</span>
    </div>
  );
}

export function WaInboxItem({ item, busy = false, onConfirm, onReject }: WaInboxItemProps) {
  const { locale, t } = useI18n();
  const isSuggestion = item.type === "suggestion";
  const [clientId, setClientId] = useState(item.suggestedClientId);
  const [duplicateWarning, setDuplicateWarning] = useState(item.duplicateWarning);
  const [actionType, setActionType] = useState<ActionType>(item.actionType ?? "work_item");
  const [targetWorkItemId, setTargetWorkItemId] = useState(item.targetWorkItemId ?? "");
  const [workItems, setWorkItems] = useState<Array<{ id: string; title: string; status: string }>>([]);

  useEffect(() => {
    if (actionType !== "update_existing" || !clientId) return;
    void fetch(`/api/work-items?client_id=${encodeURIComponent(clientId)}&limit=50`, { cache: "no-store" })
      .then((response) => response.ok ? response.json() : null)
      .then((body) => setWorkItems(body?.data ?? []))
      .catch(() => setWorkItems([]));
  }, [actionType, clientId]);

  return (
    <Card className="border-slate-200 bg-white shadow-sm">
      <CardContent className="space-y-4 p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-emerald-50 text-emerald-600">
            <MessageCircle className="size-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
              <span className="flex items-center gap-1 font-semibold text-slate-700">
                <Users className="size-3.5" />
                {item.groupName}
              </span>
              <span>·</span>
              <span>{item.senderName}</span>
              <span>·</span>
              <span className="flex items-center gap-1">
                <Clock3 className="size-3.5" />
                {formatDate(item.receivedAt, locale, { hour: "2-digit", minute: "2-digit" })}
              </span>
            </div>
            {isSuggestion && <Badge className="mt-2 bg-amber-100 text-amber-700 hover:bg-amber-100">{t("whatsapp.actionSuggestion")}</Badge>}
          </div>
        </div>

        <p className="border-l-2 border-slate-200 pl-3 text-sm italic leading-6 text-slate-600">“{item.message}”</p>

        {isSuggestion ? (
          <div className="space-y-3 rounded-lg bg-slate-50 p-4">
            <div>
              <p className="text-sm font-bold text-slate-900">{item.suggestedTitle}</p>
              {item.suggestedDescription && <p className="mt-1 text-sm text-slate-500">{item.suggestedDescription}</p>}
            </div>
            <div className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
              <div><span className="block text-slate-400">{t("whatsapp.maker")}</span><span className="font-medium text-slate-800">{item.makerName ?? t("common.notAvailable")}</span></div>
              <div><span className="block text-slate-400">{t("whatsapp.checker")}</span><span className="font-medium text-slate-800">{item.checkerName ?? t("common.notAvailable")}</span></div>
              <div><span className="block text-slate-400">{t("whatsapp.due")}</span><span className="font-medium text-slate-800">{item.dueAt ? formatDate(item.dueAt, locale, { day: "numeric", month: "short" }) : t("common.notAvailable")}</span></div>
              <div><span className="block text-slate-400">{t("whatsapp.aiConfidence")}</span><ConfidenceBar value={item.confidence} /></div>
            </div>
            <ClientSelect id={`wa-client-${item.id}`} value={clientId || item.suggestedClientId} onChange={setClientId} />
            <div className="space-y-1.5">
              <Label htmlFor={`wa-action-${item.id}`}>Tindakan</Label>
              <Select value={actionType} onValueChange={(value) => setActionType((value ?? "work_item") as ActionType)}>
                <SelectTrigger id={`wa-action-${item.id}`} className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="work_item">{t("whatsapp.workItem")}</SelectItem>
                  <SelectItem value="project">{t("whatsapp.project")}</SelectItem>
                  <SelectItem value="update_existing">{t("whatsapp.updateExisting")}</SelectItem>
                  <SelectItem value="information_only">{t("whatsapp.informationOnly")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {actionType === "update_existing" && <div className="space-y-1.5"><Label htmlFor={`wa-target-${item.id}`}>Work Item tujuan</Label><Select value={targetWorkItemId || null} onValueChange={(value) => setTargetWorkItemId(value ?? "")}><SelectTrigger id={`wa-target-${item.id}`} className="w-full"><SelectValue placeholder="Pilih work item..." /></SelectTrigger><SelectContent>{workItems.map((workItem) => <SelectItem key={workItem.id} value={workItem.id}>{workItem.title} · {workItem.status}</SelectItem>)}</SelectContent></Select></div>}
            {duplicateWarning && <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800"><p className="font-semibold">Pekerjaan aktif yang sama ditemukan</p><ul className="mt-2 list-disc pl-5">{duplicateWarning.duplicates.map((duplicate) => <li key={duplicate.id}>{duplicate.title} — {duplicate.status}</li>)}</ul></div>}
          </div>
        ) : (
          <p className="text-sm text-slate-500">{t("whatsapp.noSuggestion")}</p>
        )}

        {isSuggestion && (
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" size="sm" disabled={busy} onClick={() => onReject(item.id)} className="text-red-600 hover:bg-red-50 hover:text-red-700">
              <X /> {t("common.reject")}
            </Button>
              <Button size="sm" disabled={busy || (actionType !== "information_only" && !(clientId || item.suggestedClientId)) || (actionType === "update_existing" && !targetWorkItemId)} onClick={async () => { const result = await onConfirm(item.id, actionType, clientId || item.suggestedClientId, targetWorkItemId || undefined, duplicateWarning ? "allow" : "warn"); setDuplicateWarning(result.duplicateWarning); }} className="bg-emerald-600 text-white hover:bg-emerald-700">
              <Check /> {duplicateWarning ? t("whatsapp.processAnyway") : actionType === "information_only" ? t("whatsapp.markInformation") : actionType === "update_existing" ? t("whatsapp.confirmUpdate") : actionType === "project" ? t("whatsapp.confirmProject") : t("whatsapp.confirmTask")}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
