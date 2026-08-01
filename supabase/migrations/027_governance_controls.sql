CREATE TABLE IF NOT EXISTS acct_ctrl.ai_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES acct_ctrl.organizations(id),
  client_id UUID REFERENCES acct_ctrl.clients(id),
  name TEXT NOT NULL,
  provider TEXT NOT NULL DEFAULT 'openrouter',
  model TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  require_human_confirmation BOOLEAN NOT NULL DEFAULT true,
  allow_sensitive_data BOOLEAN NOT NULL DEFAULT false,
  no_training_required BOOLEAN NOT NULL DEFAULT true,
  retention_days INTEGER NOT NULL DEFAULT 90 CHECK (retention_days BETWEEN 1 AND 3650),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(organization_id, client_id)
);

ALTER TABLE acct_ctrl.ai_policies ENABLE ROW LEVEL SECURITY;

CREATE POLICY ai_policies_org_access ON acct_ctrl.ai_policies
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM acct_ctrl.memberships m
      WHERE m.organization_id = ai_policies.organization_id
        AND m.profile_id = auth.uid()
        AND m.is_active
        AND (ai_policies.client_id IS NULL OR m.client_id IS NULL OR m.client_id = ai_policies.client_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM acct_ctrl.memberships m
      WHERE m.organization_id = ai_policies.organization_id
        AND m.profile_id = auth.uid()
        AND m.is_active
        AND (ai_policies.client_id IS NULL OR m.client_id IS NULL OR m.client_id = ai_policies.client_id)
    )
  );

CREATE INDEX IF NOT EXISTS idx_ai_policies_scope ON acct_ctrl.ai_policies(organization_id, client_id);

ALTER TABLE acct_ctrl.audit_findings
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'open',
  ADD COLUMN IF NOT EXISTS resolution TEXT,
  ADD COLUMN IF NOT EXISTS resolved_by UUID REFERENCES acct_ctrl.profiles(id),
  ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

ALTER TABLE acct_ctrl.audit_findings
  DROP CONSTRAINT IF EXISTS audit_findings_status_check;

ALTER TABLE acct_ctrl.audit_findings
  ADD CONSTRAINT audit_findings_status_check CHECK (status IN ('open', 'in_progress', 'remediated', 'accepted', 'closed', 'reopened'));

CREATE INDEX IF NOT EXISTS idx_audit_findings_status ON acct_ctrl.audit_findings(client_id, status, due_date);
