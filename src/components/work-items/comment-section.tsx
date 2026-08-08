"use client";

import { useState, useEffect, useCallback } from "react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { MessageSquare, Send, Loader2 } from "lucide-react";
import { useI18n } from "@/components/i18n-provider";
import { formatDate } from "@/lib/i18n";
import { usePermissions } from "@/hooks/use-permissions";

interface Comment {
  id: string;
  work_item_id: string;
  author_id: string;
  content: string;
  author_name: string | null;
  created_at: string;
}

interface CommentSectionProps {
  workItemId: string;
}

function timeAgo(iso: string, locale: "id-ID" | "en-US", nowLabel: string): string {
  const now = Date.now();
  const then = new Date(iso).getTime();
  const diffSec = Math.floor((now - then) / 1000);

  if (diffSec < 60) return nowLabel;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return locale === "id-ID" ? `${diffMin} menit lalu` : `${diffMin} minutes ago`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return locale === "id-ID" ? `${diffHour} jam lalu` : `${diffHour} hours ago`;
  const diffDay = Math.floor(diffHour / 24);
  if (diffDay < 7) return locale === "id-ID" ? `${diffDay} hari lalu` : `${diffDay} days ago`;
  return formatDate(iso, locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function getInitials(name: string | null): string {
  if (!name) return "?";
  const parts = name.split(" ");
  return parts.length >= 2
    ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    : name.slice(0, 2).toUpperCase();
}

export function CommentSection({ workItemId }: CommentSectionProps) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newComment, setNewComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const { locale, t } = useI18n();
  const { has } = usePermissions();

  const fetchComments = useCallback(async () => {
    try {
      const res = await fetch(`/api/work-items/${workItemId}/comments`);
      if (!res.ok) {
        throw new Error(t("work.commentLoadError"));
      }
      const body = await res.json();
      setComments(body.data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("work.commentLoadError"));
    } finally {
      setLoading(false);
    }
  }, [workItemId]);

  useEffect(() => {
    queueMicrotask(() => fetchComments());
  }, [fetchComments]);

  async function handleAddComment(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = newComment.trim();
    if (!trimmed) return;

    setSubmitting(true);
    try {
      const res = await fetch(`/api/work-items/${workItemId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: trimmed }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? t("work.commentAddError"));
      }

      setNewComment("");
      await fetchComments();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("work.commentAddError"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Add comment form */}
      {has("work_items.execute") && (
        <form onSubmit={handleAddComment} className="space-y-2">
          <textarea
            rows={3}
            placeholder={t("work.commentPlaceholder")}
            value={newComment}
            onChange={(e) => setNewComment(e.currentTarget.value)}
            className="flex w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 resize-none"
          />
          <div className="flex justify-end">
            <Button
              type="submit"
              size="sm"
              disabled={submitting || !newComment.trim()}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              {submitting ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Send className="size-3.5" />
              )}
              {t("work.sendComment")}
            </Button>
          </div>
        </form>
      )}

      {/* Error */}
      {error && (
        <p className="text-sm text-red-500 bg-red-50 rounded-lg px-3 py-2">
          {error}
        </p>
      )}

      {/* Comments list */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex gap-3">
              <Skeleton className="size-8 rounded-full shrink-0" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-3 w-[120px]" />
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-[60%]" />
              </div>
            </div>
          ))}
        </div>
      ) : comments.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <MessageSquare className="size-8 text-slate-300 mb-2" />
          <p className="text-sm text-slate-400">{t("work.noComments")}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {comments.map((comment) => (
            <div key={comment.id} className="flex gap-3">
              <Avatar size="sm">
                <AvatarFallback className="bg-slate-200 text-slate-600 text-[10px] font-bold">
                  {getInitials(comment.author_name)}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-[13px] font-medium text-slate-900 truncate">
                    {comment.author_name ?? "Tidak diketahui"}
                  </span>
                  <span className="text-[11px] text-slate-400 shrink-0">
                    {timeAgo(comment.created_at, locale, t("common.now"))}
                  </span>
                </div>
                <p className="text-sm text-slate-600 whitespace-pre-wrap break-words">
                  {comment.content}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
