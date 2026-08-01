import type { ReviewDecision } from "./work-item";

export type ReviewKind = "review" | "approval";

export interface ReviewFinding {
  id: string;
  review_id: string;
  checklist_item_id: string | null;
  finding_type: string;
  description: string;
  severity: string | null;
  created_at: string;
}

export interface ReviewRecord {
  id: string;
  work_item_id: string;
  reviewer_id: string;
  decision: ReviewDecision | null;
  comment: string | null;
  checklist_template_id: string | null;
  created_at: string;
  reviewer_name?: string | null;
  findings: ReviewFinding[];
}

export interface ApprovalRecord {
  id: string;
  work_item_id: string;
  approver_id: string;
  decision: ReviewDecision | null;
  comment: string | null;
  created_at: string;
  approver_name?: string | null;
}

export interface ReviewHistoryResponse {
  reviews: ReviewRecord[];
  approvals: ApprovalRecord[];
  role: string | null;
}
