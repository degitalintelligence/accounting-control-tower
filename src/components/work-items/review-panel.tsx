"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Loader2, MessageSquareWarning, ShieldCheck, Sparkles, ThumbsDown, ThumbsUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ApprovalRecord, ReviewHistoryResponse, ReviewRecord } from "@/types/review";
import { useI18n } from "@/components/i18n-provider";
import { formatDate } from "@/lib/i18n";

type Props = { workItemId: string; status: string; onChanged?: () => void };
type AiNote = { id: string; status: "pending" | "accepted" | "rejected"; result: { summary: string; completeness: { area: string; finding: string; severity: string }[]; anomalies: { area: string; finding: string; severity: string }[]; recommendations: string[] }; created_at: string };

const decisionLabels = { approved: "review.approve", rejected: "review.reject", revision_required: "review.requestRevision" } as const;

function ReviewEntry({ review, locale, t }: { review: ReviewRecord; locale: "id-ID" | "en-US"; t: (key: never) => string }) {
  return (
    <div className="rounded-lg border border-slate-200 p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-slate-900">{review.reviewer_name ?? "Reviewer"}</span>
        <Badge className={review.decision === "approved" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}>
          {review.decision ? t(decisionLabels[review.decision] as never) : t("status.draft" as never)}
        </Badge>
      </div>
      {review.comment && <p className="text-sm text-slate-600 whitespace-pre-wrap">{review.comment}</p>}
      {review.findings?.map((finding) => (
        <div key={finding.id} className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {finding.description}
        </div>
      ))}
      <p className="text-[11px] text-slate-400">{formatDate(review.created_at, locale, { dateStyle: "medium", timeStyle: "short" })}</p>
    </div>
  );
}

function ApprovalEntry({ approval, locale, t }: { approval: ApprovalRecord; locale: "id-ID" | "en-US"; t: (key: never) => string }) {
  return (
    <div className="rounded-lg border border-slate-200 p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-slate-900">{approval.approver_name ?? "Penyetuju"}</span>
        <Badge className={approval.decision === "approved" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}>
          {approval.decision ? t(decisionLabels[approval.decision] as never) : t("status.draft" as never)}
        </Badge>
      </div>
      {approval.comment && <p className="mt-2 text-sm text-slate-600 whitespace-pre-wrap">{approval.comment}</p>}
      <p className="mt-2 text-[11px] text-slate-400">{formatDate(approval.created_at, locale, { dateStyle: "medium", timeStyle: "short" })}</p>
    </div>
  );
}

export function ReviewPanel({ workItemId, status, onChanged }: Props) {
  const [data, setData] = useState<ReviewHistoryResponse>({ reviews: [], approvals: [], role: null });
  const [comment, setComment] = useState("");
  const [finding, setFinding] = useState("");
  const [decision, setDecision] = useState<"approved" | "rejected" | "revision_required">("approved");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aiNotes, setAiNotes] = useState<AiNote[]>([]);
  const [aiLoading, setAiLoading] = useState(false);
  const [membershipRole, setMembershipRole] = useState<string | null>(null);
  const { locale, t } = useI18n();

  const load = useCallback(async () => {
    const response = await fetch(`/api/work-items/${workItemId}/reviews`);
    if (response.ok) setData((await response.json()).data);
    const aiResponse = await fetch(`/api/ai/review-assist?work_item_id=${workItemId}`);
    if (aiResponse.ok) { const aiBody = await aiResponse.json(); setAiNotes(aiBody.data); setMembershipRole(aiBody.membership_role); }
    setLoading(false);
  }, [workItemId]);

  useEffect(() => { queueMicrotask(() => load()); }, [load]);

  const kind = data.role === "approver" ? "approval" : "review";
  const actionable = kind === "approval" ? status === "awaiting_approval" : ["submitted", "under_review"].includes(status);

  const submit = async () => {
    setSaving(true);
    setError(null);
    const response = await fetch(`/api/work-items/${workItemId}/reviews`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind, decision, comment: comment || null, findings: finding ? [{ description: finding, finding_type: "issue" }] : [] }),
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) setError(body?.error ?? "Gagal menyimpan keputusan.");
    else { setComment(""); setFinding(""); await load(); onChanged?.(); }
    setSaving(false);
  };

  const generateAiNote = async () => {
    setAiLoading(true);
    setError(null);
    const response = await fetch("/api/ai/review-assist", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ work_item_id: workItemId }) });
    const body = await response.json().catch(() => null);
    if (!response.ok) setError(body?.error ?? "Gagal membuat AI Notes.");
    else { setAiNotes((current) => [body.data, ...current]); }
    setAiLoading(false);
  };

  const decideAiNote = async (noteId: string, action: "accept" | "reject") => {
    const response = await fetch("/api/ai/review-assist", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ work_item_id: workItemId, note_id: noteId, action }) });
    const body = await response.json().catch(() => null);
    if (!response.ok) setError(body?.error ?? "Gagal memproses AI Note.");
    else setAiNotes((current) => current.map((note) => note.id === noteId ? { ...note, status: body.data.status } : note));
  };

  if (loading) return <Card><CardContent className="py-8 flex justify-center"><Loader2 className="size-5 animate-spin text-slate-400" /></CardContent></Card>;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-sm"><ShieldCheck className="size-4 text-blue-600" />Review & Persetujuan</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {actionable ? (
            <>
              <select value={decision} onChange={(event) => setDecision(event.target.value as typeof decision)} className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm">
                {Object.entries(decisionLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
              <textarea value={comment} onChange={(event) => setComment(event.target.value)} placeholder={t("review.commentPlaceholder")} className="min-h-20 w-full rounded-md border border-slate-200 p-3 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
              {kind === "review" && <textarea value={finding} onChange={(event) => setFinding(event.target.value)} placeholder={t("review.findingPlaceholder")} className="min-h-16 w-full rounded-md border border-slate-200 p-3 text-sm outline-none focus:ring-2 focus:ring-blue-500" />}
              {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
              <Button onClick={submit} disabled={saving} className="bg-orange-500 text-white hover:bg-orange-600 font-bold"><CheckCircle2 className="size-4" />{saving ? t("review.saving") : kind === "approval" ? t("review.saveApproval") : t("review.save")}</Button>
            </>
          ) : <p className="text-sm text-slate-500 flex items-center gap-2"><MessageSquareWarning className="size-4" />{t("review.noAction")}</p>}
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-3"><CardTitle className="flex items-center justify-between gap-2 text-sm"><span className="flex items-center gap-2"><Sparkles className="size-4 text-blue-600" />{t("review.aiNotes")}</span><Button variant="outline" size="sm" onClick={generateAiNote} disabled={aiLoading}>{aiLoading ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}{t("review.createNote")}</Button></CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {aiNotes.length === 0 ? <p className="text-sm text-slate-500">{t("review.noAiNotes")}</p> : aiNotes.map((note) => <div key={note.id} className="rounded-lg border border-slate-200 p-3 space-y-2"><div className="flex items-center justify-between gap-2"><Badge className={note.status === "accepted" ? "bg-emerald-50 text-emerald-700" : note.status === "rejected" ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-700"}>{note.status === "accepted" ? t("review.acceptedByManager") : note.status === "rejected" ? t("review.rejectedByManager") : t("review.pendingManager")}</Badge><span className="text-[11px] text-slate-400">{formatDate(note.created_at, locale, { dateStyle: "medium", timeStyle: "short" })}</span></div><p className="text-sm text-slate-700">{note.result.summary}</p>{[...note.result.completeness, ...note.result.anomalies].map((finding, index) => <div key={`${note.id}-${index}`} className="rounded-md bg-slate-50 px-3 py-2 text-sm"><span className="font-medium text-slate-900">{finding.area}</span><span className="text-slate-600"> — {finding.finding}</span></div>)}{note.result.recommendations.length > 0 && <p className="text-sm text-slate-600">Saran: {note.result.recommendations.join("; ")}</p>}{note.status === "pending" && ["admin", "manager", "finance_manager", "accounting_manager"].includes(membershipRole ?? "") && <div className="flex gap-2"><Button variant="outline" size="sm" onClick={() => decideAiNote(note.id, "accept")}><ThumbsUp className="size-4" />{t("review.accept")}</Button><Button variant="outline" size="sm" onClick={() => decideAiNote(note.id, "reject")}><ThumbsDown className="size-4" />{t("review.reject")}</Button></div>}</div>)}
        </CardContent>
      </Card>
      {data.reviews.length > 0 && <Card><CardHeader className="pb-3"><CardTitle className="text-sm">{t("review.history")}</CardTitle></CardHeader><CardContent className="space-y-3">{data.reviews.map((review) => <ReviewEntry key={review.id} review={review} locale={locale} t={t as (key: never) => string} />)}</CardContent></Card>}
      {data.approvals.length > 0 && <Card><CardHeader className="pb-3"><CardTitle className="text-sm">{t("review.approvalHistory")}</CardTitle></CardHeader><CardContent className="space-y-3">{data.approvals.map((approval) => <ApprovalEntry key={approval.id} approval={approval} locale={locale} t={t as (key: never) => string} />)}</CardContent></Card>}
    </div>
  );
}
