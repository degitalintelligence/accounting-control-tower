"use client";

import { Check, Clock3, MessageCircle, Users, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { WaInboxItemData } from "@/hooks/use-wa-inbox";

interface WaInboxItemProps {
  item: WaInboxItemData;
  busy?: boolean;
  onConfirm: (id: string) => void;
  onReject: (id: string) => void;
}

function formatReceivedAt(value: string) {
  return new Intl.DateTimeFormat("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatDueAt(value: string | null) {
  if (!value) return "Belum ditentukan";
  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "short",
  }).format(new Date(value));
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
  const isSuggestion = item.type === "suggestion";

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
                {formatReceivedAt(item.receivedAt)}
              </span>
            </div>
            {isSuggestion && <Badge className="mt-2 bg-amber-100 text-amber-700 hover:bg-amber-100">Saran tindakan</Badge>}
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
              <div><span className="block text-slate-400">Maker</span><span className="font-medium text-slate-800">{item.makerName ?? "Belum ada"}</span></div>
              <div><span className="block text-slate-400">Checker</span><span className="font-medium text-slate-800">{item.checkerName ?? "Belum ada"}</span></div>
              <div><span className="block text-slate-400">Deadline</span><span className="font-medium text-slate-800">{formatDueAt(item.dueAt)}</span></div>
              <div><span className="block text-slate-400">Keyakinan AI</span><ConfidenceBar value={item.confidence} /></div>
            </div>
          </div>
        ) : (
          <p className="text-sm text-slate-500">Pesan ini belum menghasilkan saran work item.</p>
        )}

        {isSuggestion && (
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" size="sm" disabled={busy} onClick={() => onReject(item.id)} className="text-red-600 hover:bg-red-50 hover:text-red-700">
              <X /> Tolak
            </Button>
            <Button size="sm" disabled={busy} onClick={() => onConfirm(item.id)} className="bg-emerald-600 text-white hover:bg-emerald-700">
              <Check /> Konfirmasi & buat tugas
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
