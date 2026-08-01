export interface OverdueAgingBucket {
  bucket: string;
  label: string;
  count: number;
  weight: number;
}

export interface DashboardKpis {
  first_pass_approval_rate: number;
  first_pass_approved: number;
  reviewed_items: number;
  average_review_hours: number;
  reviewed_items_with_duration: number;
  overdue_aging: OverdueAgingBucket[];
  sop_compliance_rate: number;
  sop_samples_audited: number;
  sop_samples_compliant: number;
  autonomous_completion_rate: number;
  autonomous_completed: number;
  eligible_completed: number;
  manager_intervention_count: number;
}
