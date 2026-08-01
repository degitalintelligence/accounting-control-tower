ALTER TABLE acct_ctrl.work_items
  ADD COLUMN IF NOT EXISTS amount NUMERIC(20,2),
  ADD COLUMN IF NOT EXISTS currency_code CHAR(3) DEFAULT 'IDR',
  ADD COLUMN IF NOT EXISTS materiality_amount NUMERIC(20,2),
  ADD COLUMN IF NOT EXISTS approval_requirement TEXT DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS required_approval_level INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS approval_policy_id UUID,
  ADD COLUMN IF NOT EXISTS approval_policy_version INTEGER,
  ADD COLUMN IF NOT EXISTS policy_evaluated_at TIMESTAMPTZ;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'work_items_amount_nonnegative') THEN ALTER TABLE acct_ctrl.work_items ADD CONSTRAINT work_items_amount_nonnegative CHECK (amount IS NULL OR amount >= 0); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'work_items_materiality_nonnegative') THEN ALTER TABLE acct_ctrl.work_items ADD CONSTRAINT work_items_materiality_nonnegative CHECK (materiality_amount IS NULL OR materiality_amount >= 0); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'work_items_currency_code_format') THEN ALTER TABLE acct_ctrl.work_items ADD CONSTRAINT work_items_currency_code_format CHECK (currency_code IS NULL OR currency_code ~ '^[A-Z]{3}$'); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'work_items_approval_requirement_valid') THEN ALTER TABLE acct_ctrl.work_items ADD CONSTRAINT work_items_approval_requirement_valid CHECK (approval_requirement IN ('none','checker','approver','multi_level')); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'work_items_approval_level_valid') THEN ALTER TABLE acct_ctrl.work_items ADD CONSTRAINT work_items_approval_level_valid CHECK (required_approval_level >= 0); END IF;
END $$;

CREATE TABLE acct_ctrl.approval_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), organization_id UUID NOT NULL REFERENCES acct_ctrl.organizations(id), client_id UUID REFERENCES acct_ctrl.clients(id), entity_id UUID REFERENCES acct_ctrl.entities(id), name TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1, is_active BOOLEAN NOT NULL DEFAULT false, effective_from TIMESTAMPTZ NOT NULL DEFAULT now(), effective_until TIMESTAMPTZ, default_currency_code CHAR(3) NOT NULL DEFAULT 'IDR', created_by UUID NOT NULL REFERENCES acct_ctrl.profiles(id), created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(), CONSTRAINT approval_policy_period CHECK (effective_until IS NULL OR effective_until > effective_from), CONSTRAINT approval_policy_currency CHECK (default_currency_code ~ '^[A-Z]{3}$'), UNIQUE (organization_id, client_id, entity_id, version)
);
CREATE UNIQUE INDEX idx_one_active_approval_policy_scope ON acct_ctrl.approval_policies (organization_id, COALESCE(client_id, '00000000-0000-0000-0000-000000000000'::uuid), COALESCE(entity_id, '00000000-0000-0000-0000-000000000000'::uuid)) WHERE is_active;

CREATE TABLE acct_ctrl.approval_policy_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), approval_policy_id UUID NOT NULL REFERENCES acct_ctrl.approval_policies(id) ON DELETE CASCADE, work_item_type TEXT, risk_level TEXT, priority TEXT, min_amount NUMERIC(20,2) NOT NULL DEFAULT 0, max_amount NUMERIC(20,2), currency_code CHAR(3) NOT NULL DEFAULT 'IDR', requires_checker BOOLEAN NOT NULL DEFAULT true, requires_approver BOOLEAN NOT NULL DEFAULT false, required_approval_level INTEGER NOT NULL DEFAULT 0, approver_role TEXT, rule_order INTEGER NOT NULL DEFAULT 0, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), CONSTRAINT approval_rule_amounts CHECK (min_amount >= 0 AND (max_amount IS NULL OR max_amount >= min_amount)), CONSTRAINT approval_rule_level CHECK (required_approval_level >= 0), CONSTRAINT approval_rule_currency CHECK (currency_code ~ '^[A-Z]{3}$')
);
CREATE INDEX idx_approval_policy_rules_lookup ON acct_ctrl.approval_policy_rules(approval_policy_id, currency_code, min_amount, max_amount, rule_order);

ALTER TABLE acct_ctrl.approval_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE acct_ctrl.approval_policy_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY approval_policies_org_access ON acct_ctrl.approval_policies FOR ALL TO authenticated USING (organization_id = acct_ctrl.current_organization_id()) WITH CHECK (organization_id = acct_ctrl.current_organization_id());
CREATE POLICY approval_policy_rules_org_access ON acct_ctrl.approval_policy_rules FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM acct_ctrl.approval_policies p WHERE p.id = approval_policy_rules.approval_policy_id AND p.organization_id = acct_ctrl.current_organization_id())) WITH CHECK (EXISTS (SELECT 1 FROM acct_ctrl.approval_policies p WHERE p.id = approval_policy_rules.approval_policy_id AND p.organization_id = acct_ctrl.current_organization_id()));
