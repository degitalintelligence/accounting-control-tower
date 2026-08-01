CREATE OR REPLACE FUNCTION acct_ctrl.evaluate_approval_policy(p_organization_id UUID, p_client_id UUID, p_entity_id UUID, p_work_item_type TEXT, p_risk_level TEXT, p_priority TEXT, p_amount NUMERIC, p_currency_code TEXT)
RETURNS TABLE(requires_checker BOOLEAN, requires_approver BOOLEAN, approval_requirement TEXT, required_approval_level INTEGER, policy_id UUID, policy_version INTEGER, rule_id UUID)
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = acct_ctrl, pg_catalog AS $$
  SELECT r.requires_checker, r.requires_approver, CASE WHEN r.required_approval_level > 0 THEN 'multi_level' WHEN r.requires_approver THEN 'approver' WHEN r.requires_checker THEN 'checker' ELSE 'none' END, r.required_approval_level, p.id, p.version, r.id
  FROM acct_ctrl.approval_policies p
  JOIN acct_ctrl.approval_policy_rules r ON r.approval_policy_id = p.id
  WHERE p.organization_id = p_organization_id AND p.is_active
    AND (p.client_id IS NULL OR p.client_id = p_client_id)
    AND (p.entity_id IS NULL OR p.entity_id = p_entity_id)
    AND (p.effective_from <= now() AND (p.effective_until IS NULL OR p.effective_until > now()))
    AND (r.work_item_type IS NULL OR r.work_item_type = p_work_item_type)
    AND (r.risk_level IS NULL OR r.risk_level = p_risk_level)
    AND (r.priority IS NULL OR r.priority = p_priority)
    AND r.currency_code = p_currency_code AND p_amount >= r.min_amount AND (r.max_amount IS NULL OR p_amount <= r.max_amount)
  ORDER BY (p.entity_id IS NOT NULL) DESC, (p.client_id IS NOT NULL) DESC, (r.work_item_type IS NOT NULL) DESC, (r.risk_level IS NOT NULL) DESC, (r.priority IS NOT NULL) DESC, r.rule_order
  LIMIT 1;
$$;
REVOKE ALL ON FUNCTION acct_ctrl.evaluate_approval_policy(UUID,UUID,UUID,TEXT,TEXT,TEXT,NUMERIC,TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION acct_ctrl.evaluate_approval_policy(UUID,UUID,UUID,TEXT,TEXT,TEXT,NUMERIC,TEXT) TO service_role;
