"use client";

import { Inbox, MessageCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { WaInboxItem } from "@/components/whatsapp/wa-inbox-item";
import { useWaInbox } from "@/hooks/use-wa-inbox";

export default function WaInboxPage() {
  const { items, loading, error, refetch, confirmSuggestion, rejectSuggestion } = useWaInbox();
  const suggestions = items.filter((item) => item.type === "suggestion");
  const messages = items.filter((item) => item.type === "message");

  return (
    <main className="page-canvas">
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="mb-1 text-xs font-medium text-slate-500">Operational signal layer</p>
            <h1 className="text-2xl font-bold text-slate-900">WhatsApp Inbox</h1>
            <p className="mt-1 text-sm text-slate-500">Tinjau pesan dan saran tugas dari grup WhatsApp yang terhubung.</p>
          </div>
          <Button variant="outline" size="sm" onClick={refetch} disabled={loading}>
            <RefreshCw className={loading ? "animate-spin" : ""} /> Muat ulang
          </Button>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4"><p className="text-xs font-medium text-amber-700">Menunggu tindakan</p><p className="mt-1 text-2xl font-bold text-amber-900">{suggestions.length}</p></div>
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4"><p className="text-xs font-medium text-emerald-700">Pesan masuk</p><p className="mt-1 text-2xl font-bold text-emerald-900">{messages.length}</p></div>
          <div className="rounded-xl border border-slate-200 bg-white p-4"><p className="text-xs font-medium text-slate-500">Total inbox</p><p className="mt-1 text-2xl font-bold text-slate-900">{items.length}</p></div>
        </div>

        {error && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-center text-sm text-red-700"><p>{error}</p><Button variant="outline" size="sm" className="mt-3" onClick={refetch}>Coba lagi</Button></div>}

        {loading ? (
          <div className="space-y-3">{[1, 2, 3].map((item) => <div key={item} className="rounded-xl border border-slate-200 bg-white p-5"><Skeleton className="mb-4 h-4 w-1/3" /><Skeleton className="mb-3 h-4 w-full" /><Skeleton className="h-20 w-full" /></div>)}</div>
        ) : items.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center"><Inbox className="mx-auto mb-3 size-12 text-slate-300" /><h2 className="text-base font-semibold text-slate-900">Inbox sudah bersih</h2><p className="mt-1 text-sm text-slate-500">Belum ada pesan atau saran tindakan yang perlu ditinjau.</p></div>
        ) : (
          <div className="space-y-3">
            {items.map((item) => <WaInboxItem key={item.id} item={item} onConfirm={confirmSuggestion} onReject={rejectSuggestion} />)}
          </div>
        )}

        {!loading && items.length > 0 && <p className="flex items-center justify-center gap-2 text-xs text-slate-400"><MessageCircle className="size-3.5" /> Hanya grup WhatsApp yang sudah di-whitelist yang diproses.</p>}
      </div>
    </main>
  );
}
