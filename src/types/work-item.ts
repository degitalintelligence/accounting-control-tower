// Work item types — matching acct_ctrl DB enums exactly
export type WorkItemType = 'routine' | 'project' | 'ad_hoc' | 'report';
export type WorkItemPriority = 'low' | 'medium' | 'high' | 'critical';
export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

export type WorkItemStatus =
  | 'draft'
  | 'assigned'
  | 'in_progress'
  | 'blocked'
  | 'submitted'
  | 'under_review'
  | 'revision_required'
  | 'awaiting_approval'
  | 'approved'
  | 'completed'
  | 'cancelled';

export type AssignmentRole = 'maker' | 'checker' | 'approver';
export type ReviewDecision = 'approved' | 'rejected' | 'revision_required';
export type SourceType = 'manual' | 'whatsapp_command' | 'whatsapp_ai' | 'template' | 'api';
export type DuplicateAction = 'warn' | 'allow';

export interface DuplicateBusinessTaskCandidate {
  id: string;
  client_id: string;
  entity_id: string | null;
  section_id: string | null;
  type: WorkItemType;
  title: string;
  status: WorkItemStatus;
  due_at: string | null;
  business_period: string | null;
}

export interface DuplicateBusinessTaskWarning {
  code: 'DUPLICATE_BUSINESS_TASK';
  message: string;
  duplicates: DuplicateBusinessTaskCandidate[];
}

// Status transition rules
export interface StatusTransition {
  from: WorkItemStatus;
  to: WorkItemStatus;
  allowedRoles: string[];
  requiresReason?: boolean;
  requiresApproval?: boolean;
  highRiskOnly?: boolean;
}

// Work item interface matching the DB schema exactly
export interface WorkItem {
  id: string;
  organization_id: string;
  client_id: string;
  entity_id: string | null;
  section_id: string | null;

  // Type and hierarchy
  type: WorkItemType;
  parent_id: string | null;
  project_id: string | null;
  milestone_id: string | null;
  report_id: string | null;
  template_id: string | null;
  template_version_id: string | null;
  checklist_template_id: string | null;
  recurrence_instance_key: string | null;

  // Content
  title: string;
  description: string | null;
  acceptance_criteria: string | null;
  business_period?: string | null;

  // Status and flags
  status: WorkItemStatus;
  priority: WorkItemPriority;
  risk_level: RiskLevel;
  weight: number;
  is_optional: boolean;

  // Dates
  start_at: string | null;
  due_at: string | null;
  review_due_at: string | null;
  client_due_at: string | null;
  timezone: string;

  // Source tracking
  source_type: SourceType;
  source_reference_id: string | null;
  source_metadata: Json;

  // Timestamps
  created_by: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  deleted_at: string | null;

  // Computed/joined fields (optional, populated by API)
  assignments?: Assignment[];
  children?: WorkItem[];
}

export interface Assignment {
  id: string;
  work_item_id: string;
  profile_id: string;
  role: AssignmentRole;
  assigned_by: string | null;
  assigned_at: string;
  unassigned_at: string | null;
  reason: string | null;
  // Joined fields
  profile_name?: string;
  profile_email?: string;
}

export interface WorkItemComment {
  id: string;
  work_item_id: string;
  author_id: string;
  body: string;
  created_at: string;
  author_name?: string;
}

export interface WorkItemFile {
  id: string;
  work_item_id: string;
  file_id: string;
  evidence_requirement_id: string | null;
  purpose: string;
  created_at: string;
  file_name?: string;
  file_url?: string;
}

// Filter types
export interface WorkItemFilter {
  status?: WorkItemStatus[];
  type?: WorkItemType[];
  priority?: WorkItemPriority[];
  assignee_id?: string;
  project_id?: string;
  section_id?: string;
  overdue_only?: boolean;
  search?: string;
  page?: number;
  per_page?: number;
}

// Transition result types
export interface TransitionResult {
  success: boolean;
  error?: string;
  newStatus?: WorkItemStatus;
}

// JSON type for dynamic fields
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];
