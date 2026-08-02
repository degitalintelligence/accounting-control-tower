"use client";

import { Inbox, MessageCircle, RefreshCw, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { WaInboxItem } from "@/components/whatsapp/wa-inbox-item";
import { useWaInbox, type WaConversationMessage } from "@/hooks/use-wa-inbox";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function ConversationMessages({ messages }: { messages: WaConversationMessage[] }) {
  return (
    <div className="space-y-3">
      {messages.map((message) => (
        <div key={message.id} className="rounded-lg border border-slate-100 bg-slate-50 p-3">
          <div className="flex items-center justify-between gap-3 text-xs text-slate-500">
            <span className="font-semibold text-slate-700">{message.senderName}</span>
            <span>{formatDate(message.receivedAt)}</span>
          </div>
          <p className="mt-1 text-sm leading-6 text-slate-700">{message.content}</p>
        </div>
      ))}
    </div>
  );
}

export default function WaInboxPage() {
  const { items, summaries, messages, loading, error, refetch, confirmSuggestion, rejectSuggestion } = useWaInbox();
  const suggestions = items.filter((item) => item.type === "suggestion");

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
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4"><p className="text-xs font-medium text-emerald-700">Pesan 7 hari</p><p className="mt-1 text-2xl font-bold text-emerald-900">{messages.length}</p></div>
          <div className="rounded-xl border border-slate-200 bg-white p-4"><p className="text-xs font-medium text-slate-500">Percakapan aktif</p><p className="mt-1 text-2xl font-bold text-slate-900">{summaries.length}</p></div>
        </div>

        {error && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-center text-sm text-red-700"><p>{error}</p><Button variant="outline" size="sm" className="mt-3" onClick={refetch}>Coba lagi</Button></div>}

        {loading ? (
          <div className="space-y-3">{[1, 2, 3].map((item) => <div key={item} className="rounded-xl border border-slate-200 bg-white p-5"><Skeleton className="mb-4 h-4 w-1/3" /><Skeleton className="mb-3 h-4 w-full" /><Skeleton className="h-20 w-full" /></div>)}</div>
        ) : items.length === 0 && summaries.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center"><Inbox className="mx-auto mb-3 size-12 text-slate-300" /><h2 className="text-base font-semibold text-slate-900">Inbox sudah bersih</h2><p className="mt-1 text-sm text-slate-500">Belum ada pesan atau saran tindakan yang perlu ditinjau.</p></div>
        ) : (
          <div className="space-y-8">
            <section className="space-y-3">
              <div><h2 className="text-lg font-bold text-slate-900">Ringkasan percakapan</h2><p className="text-sm text-slate-500">Ringkasan deterministik dari pesan grup 7 hari terakhir.</p></div>
              {summaries.length === 0 ? <div className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500">Belum ada percakapan grup dalam 7 hari terakhir.</div> : summaries.map((summary) => (
                <div key={summary.groupId} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-3"><div><h3 className="font-semibold text-slate-900">{summary.groupName}</h3><p className="mt-1 text-xs text-slate-500">{summary.messageCount} pesan · {summary.participantCount} pengirim · terakhir {formatDate(summary.latestReceivedAt)}</p></div><Users className="size-5 text-blue-600" /></div>
                  <p className="mt-3 text-sm text-slate-700">{summary.aiSummary || summary.deterministicSummary || summary.latestMessage}</p>
                  {summary.windowStart && summary.windowEnd && <p className="mt-2 text-xs text-slate-400">Periode konteks: {formatDate(summary.windowStart)} – {formatDate(summary.windowEnd)} · Status: {summary.summaryStatus === "completed" ? "siap" : summary.summaryStatus === "processing" ? "diproses" : summary.summaryStatus ?? "belum diproses"}</p>}
                  {summary.aiSummary && <p className="mt-3 rounded-lg bg-blue-50 p-3 text-sm text-blue-900">{summary.aiSummary}</p>}
                  {summary.actionSuggestions && summary.actionSuggestions.length > 0 && <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3"><p className="text-xs font-semibold text-amber-800">Saran AI, wajib ditinjau manusia</p>{summary.actionSuggestions.map((action, index) => <p key={`${summary.groupId}-${index}`} className="mt-1 text-sm text-amber-900">{action.title}{action.evidence ? ` — ${action.evidence}` : ""}</p>)}</div>}
                  <p className="mt-2 text-xs text-slate-400">Pengirim: {summary.participants.join(", ")}</p>
                </div>
              ))}
            </section>
            <section className="space-y-3"><div><h2 className="text-lg font-bold text-slate-900">Pesan grup</h2><p className="text-sm text-slate-500">Pesan terbaru dipisahkan dari saran tindakan.</p></div>{messages.length > 0 ? <ConversationMessages messages={messages} /> : <div className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500">Belum ada pesan untuk ditampilkan.</div>}</section>
            <section className="space-y-3"><div><h2 className="text-lg font-bold text-slate-900">Saran tindakan</h2><p className="text-sm text-slate-500">Saran AI tetap memerlukan konfirmasi manusia.</p></div>{suggestions.length === 0 ? <div className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500">Tidak ada saran tindakan yang menunggu konfirmasi.</div> : suggestions.map((item) => <WaInboxItem key={item.id} item={item} onConfirm={confirmSuggestion} onReject={rejectSuggestion} />)}</section>
          </div>
        )}

        {!loading && (items.length > 0 || summaries.length > 0) && <p className="flex items-center justify-center gap-2 text-xs text-slate-400"><MessageCircle className="size-3.5" /> Hanya grup WhatsApp yang sudah di-whitelist yang diproses.</p>}
      </div>
    </main>
  );
}
