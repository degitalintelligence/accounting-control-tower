"use client";

import { useState } from "react";
import { ChevronRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import type { WorkItemStatus } from "@/types/work-item";
import { useI18n } from "@/components/i18n-provider";

interface StatusTransitionButtonProps {
  workItemId: string;
  currentStatus: WorkItemStatus;
  onTransitionComplete: () => void;
}

const STATUS_LABELS: Record<WorkItemStatus, string> = {
  draft: "status.draft", assigned: "status.assigned", in_progress: "status.inProgress", blocked: "status.blocked", submitted: "status.submitted", under_review: "status.underReview", revision_required: "status.revisionRequired", awaiting_approval: "status.awaitingApproval", approved: "status.approved", completed: "status.completed", cancelled: "status.cancelled",
};

const TRANSITION_MAP: Record<WorkItemStatus, { to: WorkItemStatus; label: string; requiresReason?: boolean }[]> = {
  draft: [
    { to: "assigned", label: "Tugaskan" },
  ],
  assigned: [
    { to: "in_progress", label: "Mulai Kerjakan" },
  ],
  in_progress: [
    { to: "submitted", label: "Submit untuk Review" },
    { to: "blocked", label: "Blokir", requiresReason: true },
  ],
  blocked: [
    { to: "in_progress", label: "Lanjutkan Pengerjaan" },
  ],
  submitted: [
    { to: "under_review", label: "Mulai Review" },
    { to: "revision_required", label: "Minta Revisi", requiresReason: true },
  ],
  under_review: [
    { to: "approved", label: "Setujui" },
    { to: "revision_required", label: "Minta Revisi", requiresReason: true },
  ],
  revision_required: [
    { to: "in_progress", label: "Kerjakan Revisi" },
    { to: "submitted", label: "Submit Ulang" },
  ],
  awaiting_approval: [
    { to: "completed", label: "Setujui & Selesaikan" },
    { to: "revision_required", label: "Tolak", requiresReason: true },
  ],
  approved: [
    { to: "completed", label: "Selesaikan" },
  ],
  completed: [],
  cancelled: [],
};

export function StatusTransitionButton({
  workItemId,
  currentStatus,
  onTransitionComplete,
}: StatusTransitionButtonProps) {
  const [reasonDialogOpen, setReasonDialogOpen] = useState(false);
  const [selectedTransition, setSelectedTransition] = useState<{
    to: WorkItemStatus;
    label: string;
  } | null>(null);
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { t } = useI18n();

  const available = TRANSITION_MAP[currentStatus] ?? [];
  const isTerminal = currentStatus === "completed" || currentStatus === "cancelled";

  if (isTerminal || available.length === 0) {
    return null;
  }

  function handleSelect(transition: { to: WorkItemStatus; label: string; requiresReason?: boolean }) {
    if (transition.requiresReason) {
      setSelectedTransition(transition);
      setReason("");
      setError(null);
      setReasonDialogOpen(true);
    } else {
      executeTransition(transition.to, undefined);
    }
  }

  async function executeTransition(toStatus: WorkItemStatus, reasonText?: string) {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/work-items/${workItemId}/transition`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to_status: toStatus,
          reason: reasonText || undefined,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? "Gagal mengubah status.");
      }

      setReasonDialogOpen(false);
      onTransitionComplete();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal mengubah status.");
    } finally {
      setLoading(false);
    }
  }

  function handleReasonSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedTransition) return;
    if (!reason.trim()) {
      setError(t("work.reasonRequired"));
      return;
    }
    executeTransition(selectedTransition.to, reason.trim());
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="outline"
              className="w-full justify-between"
              disabled={loading}
            />
          }
        >
          {loading ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Mengubah...
            </>
          ) : (
            <>
              Ubah Status
              <ChevronRight className="size-4" />
            </>
          )}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuGroup>
            <DropdownMenuLabel>Transisi ke:</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {available.map((transition) => (
              <DropdownMenuItem key={transition.to} onClick={() => handleSelect(transition)}>
                {transition.label}
                <span className="ml-auto text-[11px] text-slate-400">
                  {t(STATUS_LABELS[transition.to] as never)}
                </span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Reason dialog */}
      <Dialog open={reasonDialogOpen} onOpenChange={setReasonDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Alasan Perubahan Status</DialogTitle>
            <DialogDescription>
              {selectedTransition?.label} — {selectedTransition ? t(STATUS_LABELS[selectedTransition.to] as never) : ""}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleReasonSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="transition-reason">
                Alasan <span className="text-red-500">*</span>
              </Label>
              <textarea
                id="transition-reason"
                rows={3}
                placeholder="Jelaskan alasan perubahan status..."
                value={reason}
                onChange={(e) => {
                  setReason(e.currentTarget.value);
                  setError(null);
                }}
                className="flex w-full rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 resize-none"
              />
            </div>

            {error && (
              <p className="text-sm text-red-500 bg-red-50 rounded-lg px-3 py-2">
                {error}
              </p>
            )}

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setReasonDialogOpen(false)}
                disabled={loading}
              >
                Batal
              </Button>
              <Button
                type="submit"
                disabled={loading}
                className="bg-orange-500 hover:bg-orange-600 text-white font-bold"
              >
                {loading ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Memproses...
                  </>
                ) : (
                  "Konfirmasi"
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
