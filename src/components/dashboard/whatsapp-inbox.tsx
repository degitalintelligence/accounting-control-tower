"use client";

import { Check, Clock, MessageCircle, Users, X } from "lucide-react";
import { useWaInbox, type ActionType, type WaInboxItemData } from "@/hooks/use-wa-inbox";
import { cn } from "@/lib/utils";
import { useI18n } from "@/components/i18n-provider";
import { formatDate } from "@/lib/i18n";

function ConfidenceBar({ value }: { value: number }) {
  const color = value >= 85 ? "bg-[#20865a]" : value >= 60 ? "bg-[#9a6810]" : "bg-[#c94040]";
  return <div className="flex items-center gap-2"><div className="flex-1 h-1.5 bg-[#eef0ee] rounded-full overflow-hidden"><div className={cn("h-full rounded-full", color)} style={{ width: `${value}%` }} /></div><span className="text-[10px] font-bold text-[#4a5a55] w-8 text-right">{value}%</span></div>;
}

function WaActionCard({ action, onConfirm, onReject }: { action: WaInboxItemData; onConfirm: (id: string, actionType: ActionType, clientId?: string, targetWorkItemId?: string, duplicateAction?: "warn" | "allow") => Promise<unknown>; onReject: (id: string) => void }) {
  const { locale, t } = useI18n();
  return <div className="border border-[#eef0ee] rounded-lg p-3 space-y-2.5">
    <div className="flex items-center gap-2"><div className="w-5 h-5 rounded bg-[#e8f6ef] flex items-center justify-center"><MessageCircle className="w-3 h-3 text-[#20865a]" /></div><div className="flex items-center gap-1.5 flex-1 min-w-0"><Users className="w-3 h-3 text-[#8a9490]" /><span className="text-[10px] font-semibold text-[#4a5a55] truncate">{action.groupName}</span><span className="text-[9px] text-[#8a9490]">·</span><span className="text-[9px] text-[#8a9490]">{action.senderName}</span></div><div className="flex items-center gap-0.5 text-[9px] text-[#8a9490]"><Clock className="w-2.5 h-2.5" />{formatDate(action.receivedAt, locale, { hour: "2-digit", minute: "2-digit" })}</div></div>
    <blockquote className="text-[10px] text-[#4a5a55] italic border-l-2 border-[#dfe4e1] pl-2">&ldquo;{action.message}&rdquo;</blockquote>
    <div className="bg-[#f7f9f8] rounded-lg p-2.5 space-y-1.5"><p className="text-[10px] font-bold text-[#1a2421]">{action.suggestedTitle}</p><div className="grid grid-cols-4 gap-2 text-[9px]"><div><span className="text-[#8a9490] block">{t("whatsapp.task")}</span><span className="text-[#1a2421] font-medium">{action.suggestedTitle.split(" ").slice(0, 3).join(" ")}</span></div><div><span className="text-[#8a9490] block">{t("whatsapp.maker")}</span><span className="text-[#1a2421] font-medium">{action.makerName ?? t("common.notAvailable")}</span></div><div><span className="text-[#8a9490] block">{t("whatsapp.checker")}</span><span className="text-[#1a2421] font-medium">{action.checkerName ?? t("common.notAvailable")}</span></div><div><span className="text-[#8a9490] block">{t("whatsapp.due")}</span><span className="text-[#1a2421] font-medium">{action.dueAt ? formatDate(action.dueAt, locale, { day: "numeric", month: "short" }) : t("common.notAvailable")}</span></div></div></div>
    <div><p className="text-[9px] text-[#8a9490] mb-1">{t("whatsapp.aiConfidence")}</p><ConfidenceBar value={action.confidence} /></div>
    <div className="flex items-center gap-1.5 pt-0.5"><button onClick={() => onReject(action.id)} className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-[#dfe4e1] text-[10px] font-medium text-[#8a9490] hover:bg-[#f3f5f2]"><X className="w-3 h-3" />{t("common.dismiss")}</button><button onClick={() => void onConfirm(action.id, "work_item")} className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#20865a] text-[10px] font-bold text-white hover:bg-[#1a6e4a] ml-auto"><Check className="w-3 h-3" />{t("whatsapp.confirmTask")}</button></div>
  </div>;
}

export function WhatsappInbox() {
  const { items, loading, confirmSuggestion, rejectSuggestion } = useWaInbox();
  const { t } = useI18n();
  return <div className="bg-white border border-[#dfe4e1] rounded-xl shadow-[0_1px_2px_rgba(24,32,31,.04),0_8px_30px_rgba(24,32,31,.045)]"><div className="flex items-center justify-between px-4 py-3 border-b border-[#eef0ee]"><div className="flex items-center gap-2"><MessageCircle className="w-4 h-4 text-[#20865a]" /><h3 className="text-sm font-bold text-[#1a2421]">{t("whatsapp.actionInbox")}</h3><span className="bg-[#e8f6ef] text-[#20865a] text-[9px] font-bold px-1.5 py-0.5 rounded-full">{items.length}</span></div></div><div className="p-3 space-y-3">{loading ? <p className="text-xs text-[#8a9490]">{t("common.loading")}</p> : items.length === 0 ? <p className="text-xs text-[#8a9490]">{t("whatsapp.noActions")}</p> : items.map((item) => <WaActionCard key={item.id} action={item} onConfirm={confirmSuggestion} onReject={rejectSuggestion} />)}</div></div>;
}
