ALTER TABLE acct_ctrl.assignments
  ADD COLUMN IF NOT EXISTS authority_id UUID,
  ADD COLUMN IF NOT EXISTS delegation_id UUID,
  ADD COLUMN IF NOT EXISTS delegation_principal_id UUID,
  ADD COLUMN IF NOT EXISTS authorization_limit NUMERIC(20,2),
  ADD COLUMN IF NOT EXISTS authorization_level INTEGER,
  ADD COLUMN IF NOT EXISTS authorization_snapshot JSONB;

ALTER TABLE acct_ctrl.approvals
  ADD COLUMN IF NOT EXISTS authorization_source TEXT,
  ADD COLUMN IF NOT EXISTS authority_id UUID,
  ADD COLUMN IF NOT EXISTS delegation_id UUID,
  ADD COLUMN IF NOT EXISTS delegation_principal_id UUID,
  ADD COLUMN IF NOT EXISTS approval_level INTEGER,
  ADD COLUMN IF NOT EXISTS authorized_amount NUMERIC(20,2),
  ADD COLUMN IF NOT EXISTS authorized_currency_code CHAR(3),
  ADD COLUMN IF NOT EXISTS authority_snapshot JSONB;

CREATE OR REPLACE FUNCTION acct_ctrl.resolve_effective_authority(
  p_organization_id UUID, p_client_id UUID, p_entity_id UUID, p_profile_id UUID,
  p_role TEXT, p_amount NUMERIC, p_currency_code TEXT, p_risk_level TEXT,
  p_approval_level INTEGER, p_at TIMESTAMPTZ DEFAULT now()
)
RETURNS TABLE(authorized BOOLEAN, authorization_source TEXT, authority_id UUID, delegation_id UUID, principal_id UUID, authorization_limit NUMERIC, authorization_level INTEGER, snapshot JSONB)
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = acct_ctrl, pg_catalog AS $$
  WITH direct AS (
    SELECT a.id, a.max_amount, a.approval_level, a.profile_id
    FROM acct_ctrl.approval_authorities a
    WHERE a.organization_id = p_organization_id AND a.profile_id = p_profile_id AND a.role = p_role AND a.is_active
      AND a.currency_code = p_currency_code AND a.max_amount >= p_amount AND a.approval_level >= p_approval_level
      AND CASE WHEN a.max_risk_level = 'critical' THEN 4 WHEN a.max_risk_level = 'high' THEN 3 WHEN a.max_risk_level = 'medium' THEN 2 ELSE 1 END >= CASE WHEN p_risk_level = 'critical' THEN 4 WHEN p_risk_level = 'high' THEN 3 WHEN p_risk_level = 'medium' THEN 2 ELSE 1 END
      AND a.effective_from <= p_at AND (a.effective_until IS NULL OR a.effective_until > p_at)
      AND (a.client_id IS NULL OR a.client_id = p_client_id) AND (a.entity_id IS NULL OR a.entity_id = p_entity_id)
    ORDER BY (a.entity_id IS NOT NULL) DESC, (a.client_id IS NOT NULL) DESC, a.max_amount ASC LIMIT 1
  ), delegated AS (
    SELECT d.id, d.principal_id, d.max_amount, d.approval_level, aa.id AS authority_id
    FROM acct_ctrl.delegations d
    JOIN acct_ctrl.approval_authorities aa ON aa.organization_id = d.organization_id AND aa.profile_id = d.principal_id AND aa.role = d.role AND aa.is_active
      AND aa.currency_code = d.currency_code AND aa.max_amount >= d.max_amount AND aa.approval_level >= d.approval_level
    WHERE d.organization_id = p_organization_id AND d.delegate_id = p_profile_id AND d.role = p_role AND d.status = 'active'
      AND d.currency_code = p_currency_code AND d.max_amount >= p_amount AND d.approval_level >= p_approval_level
      AND CASE WHEN d.max_risk_level = 'critical' THEN 4 WHEN d.max_risk_level = 'high' THEN 3 WHEN d.max_risk_level = 'medium' THEN 2 ELSE 1 END >= CASE WHEN p_risk_level = 'critical' THEN 4 WHEN p_risk_level = 'high' THEN 3 WHEN p_risk_level = 'medium' THEN 2 ELSE 1 END
      AND d.effective_from <= p_at AND d.effective_until > p_at
      AND (d.client_id IS NULL OR d.client_id = p_client_id) AND (d.entity_id IS NULL OR d.entity_id = p_entity_id)
    ORDER BY (d.entity_id IS NOT NULL) DESC, (d.client_id IS NOT NULL) DESC, d.max_amount ASC LIMIT 1
  )
  SELECT true, 'direct', direct.id, NULL::UUID, direct.profile_id, direct.max_amount, direct.approval_level, jsonb_build_object('source','direct','authority_id',direct.id,'limit',direct.max_amount,'level',direct.approval_level) FROM direct
  UNION ALL
  SELECT true, 'delegated', delegated.authority_id, delegated.id, delegated.principal_id, delegated.max_amount, delegated.approval_level, jsonb_build_object('source','delegated','authority_id',delegated.authority_id,'delegation_id',delegated.id,'principal_id',delegated.principal_id,'limit',delegated.max_amount,'level',delegated.approval_level) FROM delegated
  WHERE NOT EXISTS (SELECT 1 FROM direct)
  UNION ALL
  SELECT false, NULL, NULL, NULL, NULL, NULL, NULL, '{}'::JSONB
  WHERE NOT EXISTS (SELECT 1 FROM direct) AND NOT EXISTS (SELECT 1 FROM delegated)
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION acct_ctrl.resolve_effective_authority(UUID,UUID,UUID,UUID,TEXT,NUMERIC,TEXT,TEXT,INTEGER,TIMESTAMPTZ) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION acct_ctrl.resolve_effective_authority(UUID,UUID,UUID,UUID,TEXT,NUMERIC,TEXT,TEXT,INTEGER,TIMESTAMPTZ) TO service_role;
