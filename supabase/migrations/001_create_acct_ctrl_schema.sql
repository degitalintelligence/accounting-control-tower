-- =============================================================
-- Migration 001: Create acct_ctrl schema and core tables
-- Project: Accounting Operations Control Tower
-- =============================================================

-- 1. Create schema
CREATE SCHEMA IF NOT EXISTS acct_ctrl;

-- 2. Enums
CREATE TYPE acct_ctrl.work_item_type AS ENUM ('routine', 'project', 'ad_hoc', 'report');
CREATE TYPE acct_ctrl.work_item_status AS ENUM (
  'draft', 'assigned', 'in_progress', 'blocked', 'submitted',
  'under_review', 'revision_required', 'awaiting_approval',
  'approved', 'completed', 'cancelled'
);
CREATE TYPE acct_ctrl.priority_level AS ENUM ('low', 'medium', 'high', 'critical');
CREATE TYPE acct_ctrl.risk_level AS ENUM ('low', 'medium', 'high', 'critical');
CREATE TYPE acct_ctrl.assignment_role AS ENUM ('maker', 'checker', 'approver');
CREATE TYPE acct_ctrl.review_decision AS ENUM ('approved', 'rejected', 'revision_required');
CREATE TYPE acct_ctrl.source_type AS ENUM ('manual', 'whatsapp_command', 'whatsapp_ai', 'template', 'api');
CREATE TYPE acct_ctrl.suggestion_status AS ENUM ('pending', 'confirmed', 'rejected', 'expired');
CREATE TYPE acct_ctrl.escalation_level AS ENUM ('maker', 'team_lead', 'accounting_manager', 'owner');

-- 3. Tenancy and users
CREATE TABLE acct_ctrl.organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  settings JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE acct_ctrl.clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES acct_ctrl.organizations(id),
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'Asia/Jakarta',
  holiday_calendar JSONB NOT NULL DEFAULT '{}',
  settings JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  UNIQUE(organization_id, slug)
);

CREATE TABLE acct_ctrl.entities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES acct_ctrl.clients(id),
  organization_id UUID NOT NULL REFERENCES acct_ctrl.organizations(id),
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  settings JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  UNIQUE(client_id, slug)
);

CREATE TABLE acct_ctrl.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  avatar_url TEXT,
  timezone TEXT NOT NULL DEFAULT 'Asia/Jakarta',
  quiet_hours_start TIME,
  quiet_hours_end TIME,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE acct_ctrl.memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES acct_ctrl.profiles(id),
  organization_id UUID NOT NULL REFERENCES acct_ctrl.organizations(id),
  client_id UUID REFERENCES acct_ctrl.clients(id),
  entity_id UUID REFERENCES acct_ctrl.entities(id),
  role TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(profile_id, organization_id, client_id, entity_id, role)
);

CREATE TABLE acct_ctrl.teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES acct_ctrl.organizations(id),
  client_id UUID REFERENCES acct_ctrl.clients(id),
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE acct_ctrl.team_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES acct_ctrl.teams(id),
  profile_id UUID NOT NULL REFERENCES acct_ctrl.profiles(id),
  role_in_team TEXT NOT NULL DEFAULT 'member',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(team_id, profile_id)
);

-- 4. Sections
CREATE TABLE acct_ctrl.sections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES acct_ctrl.organizations(id),
  client_id UUID REFERENCES acct_ctrl.clients(id),
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  UNIQUE(organization_id, client_id, slug)
);

-- 5. Work items (core engine)
CREATE TABLE acct_ctrl.work_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES acct_ctrl.organizations(id),
  client_id UUID NOT NULL REFERENCES acct_ctrl.clients(id),
  entity_id UUID REFERENCES acct_ctrl.entities(id),
  section_id UUID REFERENCES acct_ctrl.sections(id),

  -- Type and hierarchy
  type acct_ctrl.work_item_type NOT NULL DEFAULT 'ad_hoc',
  parent_id UUID REFERENCES acct_ctrl.work_items(id),
  project_id UUID REFERENCES acct_ctrl.work_items(id),
  milestone_id UUID,
  report_id UUID,
  template_id UUID,
  template_version_id UUID,
  recurrence_instance_key TEXT,

  -- Content
  title TEXT NOT NULL,
  description TEXT,
  acceptance_criteria TEXT,

  -- Status and flags
  status acct_ctrl.work_item_status NOT NULL DEFAULT 'draft',
  priority acct_ctrl.priority_level NOT NULL DEFAULT 'medium',
  risk_level acct_ctrl.risk_level NOT NULL DEFAULT 'medium',
  weight NUMERIC(5,2) NOT NULL DEFAULT 1.00,
  is_optional BOOLEAN NOT NULL DEFAULT false,

  -- Dates
  start_at TIMESTAMPTZ,
  due_at TIMESTAMPTZ,
  review_due_at TIMESTAMPTZ,
  client_due_at TIMESTAMPTZ,
  timezone TEXT NOT NULL DEFAULT 'Asia/Jakarta',

  -- Source tracking
  source_type acct_ctrl.source_type NOT NULL DEFAULT 'manual',
  source_reference_id TEXT,
  source_metadata JSONB NOT NULL DEFAULT '{}',

  -- Timestamps
  created_by UUID REFERENCES acct_ctrl.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ
);

-- 6. Assignments
CREATE TABLE acct_ctrl.assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_item_id UUID NOT NULL REFERENCES acct_ctrl.work_items(id),
  profile_id UUID NOT NULL REFERENCES acct_ctrl.profiles(id),
  role acct_ctrl.assignment_role NOT NULL,
  assigned_by UUID REFERENCES acct_ctrl.profiles(id),
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  unassigned_at TIMESTAMPTZ,
  reason TEXT,
  UNIQUE(work_item_id, role, profile_id)
);

-- Partial unique index: one active assignment per (work_item, role, profile)
CREATE UNIQUE INDEX idx_assignments_active_unique
  ON acct_ctrl.assignments(work_item_id, role, profile_id)
  WHERE unassigned_at IS NULL;

-- 7. Work item status history (immutable audit trail)
CREATE TABLE acct_ctrl.work_item_status_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_item_id UUID NOT NULL REFERENCES acct_ctrl.work_items(id),
  from_status acct_ctrl.work_item_status,
  to_status acct_ctrl.work_item_status NOT NULL,
  changed_by UUID REFERENCES acct_ctrl.profiles(id),
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 8. Task templates and recurrence
CREATE TABLE acct_ctrl.task_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES acct_ctrl.organizations(id),
  client_id UUID NOT NULL REFERENCES acct_ctrl.clients(id),
  entity_id UUID REFERENCES acct_ctrl.entities(id),
  section_id UUID REFERENCES acct_ctrl.sections(id),
  name TEXT NOT NULL,
  description TEXT,
  type acct_ctrl.work_item_type NOT NULL DEFAULT 'routine',
  priority acct_ctrl.priority_level NOT NULL DEFAULT 'medium',
  risk_level acct_ctrl.risk_level NOT NULL DEFAULT 'medium',
  is_active BOOLEAN NOT NULL DEFAULT true,
  effective_from DATE,
  effective_until DATE,
  parent_template_id UUID REFERENCES acct_ctrl.task_templates(id),
  created_by UUID REFERENCES acct_ctrl.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE acct_ctrl.template_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES acct_ctrl.task_templates(id),
  version_number INTEGER NOT NULL DEFAULT 1,
  title_template TEXT NOT NULL,
  description_template TEXT,
  acceptance_criteria_template TEXT,
  maker_rule JSONB NOT NULL DEFAULT '{}',
  checker_rule JSONB NOT NULL DEFAULT '{}',
  approver_rule JSONB NOT NULL DEFAULT '{}',
  sop_version_id UUID,
  evidence_schema JSONB NOT NULL DEFAULT '[]',
  maker_deadline_rule JSONB NOT NULL DEFAULT '{}',
  checker_deadline_rule JSONB NOT NULL DEFAULT '{}',
  final_deadline_rule JSONB NOT NULL DEFAULT '{}',
  escalation_policy_id UUID,
  child_blueprint JSONB NOT NULL DEFAULT '[]',
  weight NUMERIC(5,2) NOT NULL DEFAULT 1.00,
  is_optional BOOLEAN NOT NULL DEFAULT false,
  effective_from DATE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(template_id, version_number)
);

CREATE TABLE acct_ctrl.recurrence_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES acct_ctrl.task_templates(id),
  rrule TEXT NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'Asia/Jakarta',
  generation_lead_days INTEGER NOT NULL DEFAULT 0,
  holiday_handling TEXT NOT NULL DEFAULT 'skip',
  skip_weekends BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 9. Projects and milestones
CREATE TABLE acct_ctrl.projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_item_id UUID NOT NULL REFERENCES acct_ctrl.work_items(id),
  objective TEXT,
  success_criteria TEXT,
  start_date DATE,
  target_date DATE,
  budgeted_hours NUMERIC(8,2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE acct_ctrl.milestones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES acct_ctrl.projects(id),
  name TEXT NOT NULL,
  description TEXT,
  due_date DATE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_completed BOOLEAN NOT NULL DEFAULT false,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE acct_ctrl.dependencies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_item_id UUID NOT NULL REFERENCES acct_ctrl.work_items(id),
  depends_on_id UUID NOT NULL REFERENCES acct_ctrl.work_items(id),
  dependency_type TEXT NOT NULL DEFAULT 'finish_to_start',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(work_item_id, depends_on_id)
);

-- 10. SOP and checklists
CREATE TABLE acct_ctrl.sop_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES acct_ctrl.organizations(id),
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE acct_ctrl.sop_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sop_template_id UUID NOT NULL REFERENCES acct_ctrl.sop_templates(id),
  version_number INTEGER NOT NULL DEFAULT 1,
  content TEXT NOT NULL,
  effective_from DATE,
  review_date DATE,
  status TEXT NOT NULL DEFAULT 'draft',
  owner_id UUID REFERENCES acct_ctrl.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(sop_template_id, version_number)
);

CREATE TABLE acct_ctrl.checklist_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES acct_ctrl.organizations(id),
  name TEXT NOT NULL,
  description TEXT,
  target_role acct_ctrl.assignment_role NOT NULL DEFAULT 'maker',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE acct_ctrl.checklist_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  checklist_template_id UUID NOT NULL REFERENCES acct_ctrl.checklist_templates(id),
  label TEXT NOT NULL,
  input_type TEXT NOT NULL DEFAULT 'checkbox',
  is_required BOOLEAN NOT NULL DEFAULT false,
  sort_order INTEGER NOT NULL DEFAULT 0,
  validation_rules JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE acct_ctrl.checklist_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_item_id UUID NOT NULL REFERENCES acct_ctrl.work_items(id),
  checklist_item_id UUID NOT NULL REFERENCES acct_ctrl.checklist_items(id),
  profile_id UUID NOT NULL REFERENCES acct_ctrl.profiles(id),
  value TEXT,
  file_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 11. Evidence requirements and files
CREATE TABLE acct_ctrl.evidence_requirements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_item_id UUID REFERENCES acct_ctrl.work_items(id),
  template_version_id UUID REFERENCES acct_ctrl.template_versions(id),
  name TEXT NOT NULL,
  description TEXT,
  file_types TEXT[],
  max_size_mb INTEGER,
  is_required BOOLEAN NOT NULL DEFAULT false,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE acct_ctrl.files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES acct_ctrl.organizations(id),
  storage_path TEXT NOT NULL,
  filename TEXT NOT NULL,
  mime_type TEXT,
  size_bytes BIGINT,
  checksum TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  uploaded_by UUID REFERENCES acct_ctrl.profiles(id),
  is_locked BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE acct_ctrl.work_item_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_item_id UUID NOT NULL REFERENCES acct_ctrl.work_items(id),
  file_id UUID NOT NULL REFERENCES acct_ctrl.files(id),
  evidence_requirement_id UUID REFERENCES acct_ctrl.evidence_requirements(id),
  purpose TEXT NOT NULL DEFAULT 'evidence',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 12. Reviews and approvals
CREATE TABLE acct_ctrl.reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_item_id UUID NOT NULL REFERENCES acct_ctrl.work_items(id),
  reviewer_id UUID NOT NULL REFERENCES acct_ctrl.profiles(id),
  decision acct_ctrl.review_decision,
  comment TEXT,
  checklist_template_id UUID REFERENCES acct_ctrl.checklist_templates(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE acct_ctrl.review_findings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id UUID NOT NULL REFERENCES acct_ctrl.reviews(id),
  checklist_item_id UUID REFERENCES acct_ctrl.checklist_items(id),
  finding_type TEXT NOT NULL DEFAULT 'observation',
  description TEXT NOT NULL,
  severity TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE acct_ctrl.approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_item_id UUID NOT NULL REFERENCES acct_ctrl.work_items(id),
  approver_id UUID NOT NULL REFERENCES acct_ctrl.profiles(id),
  decision acct_ctrl.review_decision,
  comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 13. Audit
CREATE TABLE acct_ctrl.audit_samples (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES acct_ctrl.organizations(id),
  auditor_id UUID NOT NULL REFERENCES acct_ctrl.profiles(id),
  work_item_id UUID NOT NULL REFERENCES acct_ctrl.work_items(id),
  rating TEXT,
  notes TEXT,
  sampled_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE acct_ctrl.audit_findings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_sample_id UUID NOT NULL REFERENCES acct_ctrl.audit_samples(id),
  finding_type TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'minor',
  description TEXT NOT NULL,
  evidence TEXT,
  root_cause TEXT,
  owner_id UUID REFERENCES acct_ctrl.profiles(id),
  due_date DATE,
  corrective_task_id UUID REFERENCES acct_ctrl.work_items(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 14. Comments
CREATE TABLE acct_ctrl.comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_item_id UUID NOT NULL REFERENCES acct_ctrl.work_items(id),
  author_id UUID NOT NULL REFERENCES acct_ctrl.profiles(id),
  content TEXT NOT NULL,
  parent_comment_id UUID REFERENCES acct_ctrl.comments(id),
  mentions UUID[],
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

-- 15. Events and outbox
CREATE TABLE acct_ctrl.domain_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  event_type TEXT NOT NULL,
  aggregate_type TEXT NOT NULL,
  aggregate_id UUID NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE acct_ctrl.outbox_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  domain_event_id UUID REFERENCES acct_ctrl.domain_events(id),
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'pending',
  retry_count INTEGER NOT NULL DEFAULT 0,
  max_retries INTEGER NOT NULL DEFAULT 5,
  next_retry_at TIMESTAMPTZ,
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 16. Notifications
CREATE TABLE acct_ctrl.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES acct_ctrl.profiles(id),
  organization_id UUID NOT NULL REFERENCES acct_ctrl.organizations(id),
  event_type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  data JSONB NOT NULL DEFAULT '{}',
  channel TEXT NOT NULL DEFAULT 'in_app',
  dedup_key TEXT,
  read_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE acct_ctrl.notification_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id UUID NOT NULL REFERENCES acct_ctrl.notifications(id),
  channel TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  provider_response JSONB,
  delivered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 17. Escalation
CREATE TABLE acct_ctrl.escalation_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES acct_ctrl.organizations(id),
  client_id UUID REFERENCES acct_ctrl.clients(id),
  name TEXT NOT NULL,
  description TEXT,
  rules JSONB NOT NULL DEFAULT '[]',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE acct_ctrl.escalation_instances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_id UUID NOT NULL REFERENCES acct_ctrl.escalation_policies(id),
  work_item_id UUID NOT NULL REFERENCES acct_ctrl.work_items(id),
  current_level acct_ctrl.escalation_level NOT NULL DEFAULT 'maker',
  escalated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ,
  notes TEXT
);

-- 18. WhatsApp integration
CREATE TABLE acct_ctrl.integration_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES acct_ctrl.organizations(id),
  provider TEXT NOT NULL DEFAULT 'waha',
  session_id TEXT,
  status TEXT NOT NULL DEFAULT 'disconnected',
  config JSONB NOT NULL DEFAULT '{}',
  last_health_check_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE acct_ctrl.wa_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id UUID NOT NULL REFERENCES acct_ctrl.integration_connections(id),
  organization_id UUID NOT NULL REFERENCES acct_ctrl.organizations(id),
  client_id UUID REFERENCES acct_ctrl.clients(id),
  entity_id UUID REFERENCES acct_ctrl.entities(id),
  section_id UUID REFERENCES acct_ctrl.sections(id),
  provider_group_id TEXT NOT NULL,
  group_name TEXT,
  is_active BOOLEAN NOT NULL DEFAULT false,
  activated_by UUID REFERENCES acct_ctrl.profiles(id),
  activated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(connection_id, provider_group_id)
);

CREATE TABLE acct_ctrl.wa_participant_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wa_group_id UUID NOT NULL REFERENCES acct_ctrl.wa_groups(id),
  provider_participant_id TEXT NOT NULL,
  phone TEXT,
  display_name TEXT,
  profile_id UUID REFERENCES acct_ctrl.profiles(id),
  is_verified BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(wa_group_id, provider_participant_id)
);

CREATE TABLE acct_ctrl.wa_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id UUID NOT NULL REFERENCES acct_ctrl.integration_connections(id),
  wa_group_id UUID REFERENCES acct_ctrl.wa_groups(id),
  provider_message_id TEXT NOT NULL,
  sender_participant_id TEXT,
  content TEXT,
  message_type TEXT NOT NULL DEFAULT 'text',
  media_metadata JSONB NOT NULL DEFAULT '{}',
  raw_payload JSONB,
  received_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(connection_id, provider_message_id)
);

CREATE TABLE acct_ctrl.ai_extraction_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wa_message_id UUID REFERENCES acct_ctrl.wa_messages(id),
  model TEXT,
  prompt_version TEXT,
  extracted_fields JSONB NOT NULL DEFAULT '{}',
  confidence NUMERIC(3,2),
  classification TEXT,
  processing_time_ms INTEGER,
  status TEXT NOT NULL DEFAULT 'completed',
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE acct_ctrl.action_suggestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES acct_ctrl.organizations(id),
  extraction_run_id UUID REFERENCES acct_ctrl.ai_extraction_runs(id),
  source_type acct_ctrl.source_type NOT NULL DEFAULT 'whatsapp_ai',
  source_reference_id TEXT,
  source_metadata JSONB NOT NULL DEFAULT '{}',
  suggested_title TEXT NOT NULL,
  suggested_description TEXT,
  suggested_maker_id UUID,
  suggested_checker_id UUID,
  suggested_due_at TIMESTAMPTZ,
  suggested_client_id UUID,
  suggested_section_id UUID,
  confidence NUMERIC(3,2),
  status acct_ctrl.suggestion_status NOT NULL DEFAULT 'pending',
  confirmed_by UUID REFERENCES acct_ctrl.profiles(id),
  confirmed_at TIMESTAMPTZ,
  created_work_item_id UUID REFERENCES acct_ctrl.work_items(id),
  rejected_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE acct_ctrl.dead_letter_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}',
  error_message TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0,
  last_retry_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 19. Audit log (immutable)
CREATE TABLE acct_ctrl.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  actor_id UUID,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID,
  old_value JSONB,
  new_value JSONB,
  metadata JSONB NOT NULL DEFAULT '{}',
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 20. Indexes for common queries
CREATE INDEX idx_work_items_org ON acct_ctrl.work_items(organization_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_work_items_client ON acct_ctrl.work_items(client_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_work_items_status ON acct_ctrl.work_items(status) WHERE deleted_at IS NULL;
CREATE INDEX idx_work_items_parent ON acct_ctrl.work_items(parent_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_work_items_due ON acct_ctrl.work_items(due_at) WHERE deleted_at IS NULL AND status NOT IN ('completed', 'cancelled');
CREATE INDEX idx_assignments_profile ON acct_ctrl.assignments(profile_id) WHERE unassigned_at IS NULL;
CREATE INDEX idx_assignments_work_item ON acct_ctrl.assignments(work_item_id) WHERE unassigned_at IS NULL;
CREATE INDEX idx_notifications_profile ON acct_ctrl.notifications(profile_id) WHERE read_at IS NULL;
CREATE INDEX idx_outbox_pending ON acct_ctrl.outbox_events(status) WHERE status = 'pending';
CREATE INDEX idx_wa_messages_group ON acct_ctrl.wa_messages(wa_group_id);
CREATE INDEX idx_action_suggestions_pending ON acct_ctrl.action_suggestions(status) WHERE status = 'pending';
CREATE INDEX idx_audit_logs_entity ON acct_ctrl.audit_logs(entity_type, entity_id);
CREATE INDEX idx_audit_logs_org ON acct_ctrl.audit_logs(organization_id);

-- 21. RLS policies (enable on all tables)
ALTER TABLE acct_ctrl.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE acct_ctrl.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE acct_ctrl.entities ENABLE ROW LEVEL SECURITY;
ALTER TABLE acct_ctrl.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE acct_ctrl.memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE acct_ctrl.teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE acct_ctrl.team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE acct_ctrl.sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE acct_ctrl.work_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE acct_ctrl.assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE acct_ctrl.work_item_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE acct_ctrl.task_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE acct_ctrl.template_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE acct_ctrl.recurrence_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE acct_ctrl.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE acct_ctrl.milestones ENABLE ROW LEVEL SECURITY;
ALTER TABLE acct_ctrl.dependencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE acct_ctrl.sop_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE acct_ctrl.sop_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE acct_ctrl.checklist_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE acct_ctrl.checklist_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE acct_ctrl.checklist_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE acct_ctrl.evidence_requirements ENABLE ROW LEVEL SECURITY;
ALTER TABLE acct_ctrl.files ENABLE ROW LEVEL SECURITY;
ALTER TABLE acct_ctrl.work_item_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE acct_ctrl.reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE acct_ctrl.review_findings ENABLE ROW LEVEL SECURITY;
ALTER TABLE acct_ctrl.approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE acct_ctrl.audit_samples ENABLE ROW LEVEL SECURITY;
ALTER TABLE acct_ctrl.audit_findings ENABLE ROW LEVEL SECURITY;
ALTER TABLE acct_ctrl.comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE acct_ctrl.domain_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE acct_ctrl.outbox_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE acct_ctrl.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE acct_ctrl.notification_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE acct_ctrl.escalation_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE acct_ctrl.escalation_instances ENABLE ROW LEVEL SECURITY;
ALTER TABLE acct_ctrl.integration_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE acct_ctrl.wa_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE acct_ctrl.wa_participant_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE acct_ctrl.wa_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE acct_ctrl.ai_extraction_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE acct_ctrl.action_suggestions ENABLE ROW LEVEL SECURITY;
ALTER TABLE acct_ctrl.dead_letter_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE acct_ctrl.audit_logs ENABLE ROW LEVEL SECURITY;

-- 22. RLS policy: service_role bypasses RLS, authenticated users filtered by org
-- For now, we create a simple org-based policy for authenticated users.
-- service_role already bypasses RLS by default.

DO $$
DECLARE
  t TEXT;
  tables_with_org TEXT[] := ARRAY[
    'clients', 'entities', 'memberships',
    'teams', 'sections', 'work_items',
    'task_templates', 'sop_templates',
    'checklist_templates', 'files', 'escalation_policies',
    'integration_connections', 'wa_groups', 'notifications',
    'domain_events', 'audit_logs', 'action_suggestions'
  ];
BEGIN
  FOREACH t IN ARRAY tables_with_org LOOP
    EXECUTE format(
      'CREATE POLICY "org_isolation_%s" ON acct_ctrl.%I
       FOR ALL TO authenticated
       USING (organization_id = (current_setting(''request.jwt.claims'', true)::jsonb->>''organization_id'')::uuid)
       WITH CHECK (organization_id = (current_setting(''request.jwt.claims'', true)::jsonb->>''organization_id'')::uuid)',
      t, t
    );
  END LOOP;
END $$;

-- Organizations: filter by id (organizations IS the org table)
CREATE POLICY "org_isolation_organizations" ON acct_ctrl.organizations
  FOR ALL TO authenticated
  USING (id = (current_setting('request.jwt.claims', true)::jsonb->>'organization_id')::uuid)
  WITH CHECK (id = (current_setting('request.jwt.claims', true)::jsonb->>'organization_id')::uuid);

-- Tables with organization_id but accessed via work_item join
DO $$
DECLARE
  t TEXT;
  tables_via_work_item TEXT[] := ARRAY[
    'assignments', 'work_item_status_history', 'checklist_responses',
    'work_item_files', 'reviews',
    'approvals', 'comments', 'escalation_instances'
  ];
BEGIN
  FOREACH t IN ARRAY tables_via_work_item LOOP
    EXECUTE format(
      'CREATE POLICY "org_isolation_%s" ON acct_ctrl.%I
       FOR ALL TO authenticated
       USING (
         EXISTS (
           SELECT 1 FROM acct_ctrl.work_items wi
           WHERE wi.id = %I.work_item_id
             AND wi.organization_id = (current_setting(''request.jwt.claims'', true)::jsonb->>''organization_id'')::uuid
         )
       )
       WITH CHECK (
         EXISTS (
           SELECT 1 FROM acct_ctrl.work_items wi
           WHERE wi.id = %I.work_item_id
             AND wi.organization_id = (current_setting(''request.jwt.claims'', true)::jsonb->>''organization_id'')::uuid
         )
       )',
      t, t, t, t
    );
  END LOOP;
END $$;

-- Profiles: user can only see/update own profile
CREATE POLICY "profiles_own" ON acct_ctrl.profiles
  FOR ALL TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- Evidence requirements: via work_items (work_item_id can be NULL for template-only)
CREATE POLICY "org_isolation_evidence_requirements" ON acct_ctrl.evidence_requirements
  FOR ALL TO authenticated
  USING (
    work_item_id IS NULL OR EXISTS (
      SELECT 1 FROM acct_ctrl.work_items wi
      WHERE wi.id = work_item_id
        AND wi.organization_id = (current_setting('request.jwt.claims', true)::jsonb->>'organization_id')::uuid
    )
  )
  WITH CHECK (
    work_item_id IS NULL OR EXISTS (
      SELECT 1 FROM acct_ctrl.work_items wi
      WHERE wi.id = work_item_id
        AND wi.organization_id = (current_setting('request.jwt.claims', true)::jsonb->>'organization_id')::uuid
    )
  );

-- Team members: via teams
CREATE POLICY "org_isolation_team_members" ON acct_ctrl.team_members
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM acct_ctrl.teams t
      WHERE t.id = team_id
        AND t.organization_id = (current_setting('request.jwt.claims', true)::jsonb->>'organization_id')::uuid
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM acct_ctrl.teams t
      WHERE t.id = team_id
        AND t.organization_id = (current_setting('request.jwt.claims', true)::jsonb->>'organization_id')::uuid
    )
  );

-- Review findings: via reviews → work_items
CREATE POLICY "org_isolation_review_findings" ON acct_ctrl.review_findings
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM acct_ctrl.reviews r
      JOIN acct_ctrl.work_items wi ON wi.id = r.work_item_id
      WHERE r.id = review_id
        AND wi.organization_id = (current_setting('request.jwt.claims', true)::jsonb->>'organization_id')::uuid
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM acct_ctrl.reviews r
      JOIN acct_ctrl.work_items wi ON wi.id = r.work_item_id
      WHERE r.id = review_id
        AND wi.organization_id = (current_setting('request.jwt.claims', true)::jsonb->>'organization_id')::uuid
    )
  );

-- Outbox events: via domain_events
CREATE POLICY "org_isolation_outbox_events" ON acct_ctrl.outbox_events
  FOR ALL TO authenticated
  USING (
    domain_event_id IS NULL OR EXISTS (
      SELECT 1 FROM acct_ctrl.domain_events de
      WHERE de.id = domain_event_id
        AND de.organization_id = (current_setting('request.jwt.claims', true)::jsonb->>'organization_id')::uuid
    )
  )
  WITH CHECK (
    domain_event_id IS NULL OR EXISTS (
      SELECT 1 FROM acct_ctrl.domain_events de
      WHERE de.id = domain_event_id
        AND de.organization_id = (current_setting('request.jwt.claims', true)::jsonb->>'organization_id')::uuid
    )
  );

-- Notification deliveries: via notifications
CREATE POLICY "org_isolation_notification_deliveries" ON acct_ctrl.notification_deliveries
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM acct_ctrl.notifications n
      WHERE n.id = notification_id
        AND n.organization_id = (current_setting('request.jwt.claims', true)::jsonb->>'organization_id')::uuid
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM acct_ctrl.notifications n
      WHERE n.id = notification_id
        AND n.organization_id = (current_setting('request.jwt.claims', true)::jsonb->>'organization_id')::uuid
    )
  );

-- Projects, milestones, dependencies: via work_item
CREATE POLICY "org_isolation_projects" ON acct_ctrl.projects
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM acct_ctrl.work_items wi
      WHERE wi.id = work_item_id
        AND wi.organization_id = (current_setting('request.jwt.claims', true)::jsonb->>'organization_id')::uuid
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM acct_ctrl.work_items wi
      WHERE wi.id = work_item_id
        AND wi.organization_id = (current_setting('request.jwt.claims', true)::jsonb->>'organization_id')::uuid
    )
  );

CREATE POLICY "org_isolation_milestones" ON acct_ctrl.milestones
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM acct_ctrl.projects p
      JOIN acct_ctrl.work_items wi ON wi.id = p.work_item_id
      WHERE p.id = project_id
        AND wi.organization_id = (current_setting('request.jwt.claims', true)::jsonb->>'organization_id')::uuid
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM acct_ctrl.projects p
      JOIN acct_ctrl.work_items wi ON wi.id = p.work_item_id
      WHERE p.id = project_id
        AND wi.organization_id = (current_setting('request.jwt.claims', true)::jsonb->>'organization_id')::uuid
    )
  );

CREATE POLICY "org_isolation_dependencies" ON acct_ctrl.dependencies
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM acct_ctrl.work_items wi
      WHERE wi.id = work_item_id
        AND wi.organization_id = (current_setting('request.jwt.claims', true)::jsonb->>'organization_id')::uuid
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM acct_ctrl.work_items wi
      WHERE wi.id = work_item_id
        AND wi.organization_id = (current_setting('request.jwt.claims', true)::jsonb->>'organization_id')::uuid
    )
  );

-- SOP versions: via sop_templates
CREATE POLICY "org_isolation_sop_versions" ON acct_ctrl.sop_versions
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM acct_ctrl.sop_templates st
      WHERE st.id = sop_template_id
        AND st.organization_id = (current_setting('request.jwt.claims', true)::jsonb->>'organization_id')::uuid
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM acct_ctrl.sop_templates st
      WHERE st.id = sop_template_id
        AND st.organization_id = (current_setting('request.jwt.claims', true)::jsonb->>'organization_id')::uuid
    )
  );

-- Checklist items: via checklist_templates
CREATE POLICY "org_isolation_checklist_items" ON acct_ctrl.checklist_items
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM acct_ctrl.checklist_templates ct
      WHERE ct.id = checklist_template_id
        AND ct.organization_id = (current_setting('request.jwt.claims', true)::jsonb->>'organization_id')::uuid
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM acct_ctrl.checklist_templates ct
      WHERE ct.id = checklist_template_id
        AND ct.organization_id = (current_setting('request.jwt.claims', true)::jsonb->>'organization_id')::uuid
    )
  );

-- WA participant mappings: via wa_groups
CREATE POLICY "org_isolation_wa_participant_mappings" ON acct_ctrl.wa_participant_mappings
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM acct_ctrl.wa_groups wg
      WHERE wg.id = wa_group_id
        AND wg.organization_id = (current_setting('request.jwt.claims', true)::jsonb->>'organization_id')::uuid
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM acct_ctrl.wa_groups wg
      WHERE wg.id = wa_group_id
        AND wg.organization_id = (current_setting('request.jwt.claims', true)::jsonb->>'organization_id')::uuid
    )
  );

-- WA messages: via wa_groups
CREATE POLICY "org_isolation_wa_messages" ON acct_ctrl.wa_messages
  FOR ALL TO authenticated
  USING (
    wa_group_id IS NULL OR EXISTS (
      SELECT 1 FROM acct_ctrl.wa_groups wg
      WHERE wg.id = wa_group_id
        AND wg.organization_id = (current_setting('request.jwt.claims', true)::jsonb->>'organization_id')::uuid
    )
  )
  WITH CHECK (
    wa_group_id IS NULL OR EXISTS (
      SELECT 1 FROM acct_ctrl.wa_groups wg
      WHERE wg.id = wa_group_id
        AND wg.organization_id = (current_setting('request.jwt.claims', true)::jsonb->>'organization_id')::uuid
    )
  );

-- AI extraction runs: via wa_messages
CREATE POLICY "org_isolation_ai_extraction_runs" ON acct_ctrl.ai_extraction_runs
  FOR ALL TO authenticated
  USING (
    wa_message_id IS NULL OR EXISTS (
      SELECT 1 FROM acct_ctrl.wa_messages wm
      JOIN acct_ctrl.wa_groups wg ON wg.id = wm.wa_group_id
      WHERE wm.id = wa_message_id
        AND wg.organization_id = (current_setting('request.jwt.claims', true)::jsonb->>'organization_id')::uuid
    )
  )
  WITH CHECK (
    wa_message_id IS NULL OR EXISTS (
      SELECT 1 FROM acct_ctrl.wa_messages wm
      JOIN acct_ctrl.wa_groups wg ON wg.id = wm.wa_group_id
      WHERE wm.id = wa_message_id
        AND wg.organization_id = (current_setting('request.jwt.claims', true)::jsonb->>'organization_id')::uuid
    )
  );

-- Audit samples: via work_items
CREATE POLICY "org_isolation_audit_samples" ON acct_ctrl.audit_samples
  FOR ALL TO authenticated
  USING (organization_id = (current_setting('request.jwt.claims', true)::jsonb->>'organization_id')::uuid)
  WITH CHECK (organization_id = (current_setting('request.jwt.claims', true)::jsonb->>'organization_id')::uuid);

-- Audit findings: via audit_samples
CREATE POLICY "org_isolation_audit_findings" ON acct_ctrl.audit_findings
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM acct_ctrl.audit_samples as2
      WHERE as2.id = audit_sample_id
        AND as2.organization_id = (current_setting('request.jwt.claims', true)::jsonb->>'organization_id')::uuid
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM acct_ctrl.audit_samples as2
      WHERE as2.id = audit_sample_id
        AND as2.organization_id = (current_setting('request.jwt.claims', true)::jsonb->>'organization_id')::uuid
    )
  );

-- Dead letter events: admin only via service_role (no authenticated policy)
CREATE POLICY "dead_letter_admin_only" ON acct_ctrl.dead_letter_events
  FOR ALL TO authenticated
  USING (false);

-- Template versions: via task_templates
CREATE POLICY "org_isolation_template_versions" ON acct_ctrl.template_versions
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM acct_ctrl.task_templates tt
      WHERE tt.id = template_id
        AND tt.organization_id = (current_setting('request.jwt.claims', true)::jsonb->>'organization_id')::uuid
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM acct_ctrl.task_templates tt
      WHERE tt.id = template_id
        AND tt.organization_id = (current_setting('request.jwt.claims', true)::jsonb->>'organization_id')::uuid
    )
  );

-- Recurrence rules: via task_templates
CREATE POLICY "org_isolation_recurrence_rules" ON acct_ctrl.recurrence_rules
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM acct_ctrl.task_templates tt
      WHERE tt.id = template_id
        AND tt.organization_id = (current_setting('request.jwt.claims', true)::jsonb->>'organization_id')::uuid
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM acct_ctrl.task_templates tt
      WHERE tt.id = template_id
        AND tt.organization_id = (current_setting('request.jwt.claims', true)::jsonb->>'organization_id')::uuid
    )
  );
