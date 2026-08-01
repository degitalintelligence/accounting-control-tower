CREATE OR REPLACE FUNCTION acct_ctrl.assert_review_actor(p_work_item_id UUID, p_actor_id UUID, p_required_role TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = acct_ctrl, pg_catalog AS $$
DECLARE item acct_ctrl.work_items%ROWTYPE;
BEGIN
  SELECT * INTO item FROM acct_ctrl.work_items WHERE id = p_work_item_id AND deleted_at IS NULL FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'work item tidak ditemukan' USING ERRCODE = 'P0002'; END IF;
  IF NOT EXISTS (SELECT 1 FROM acct_ctrl.memberships m WHERE m.organization_id = item.organization_id AND m.profile_id = p_actor_id AND m.is_active) THEN RAISE EXCEPTION 'aktor tidak memiliki membership aktif' USING ERRCODE = '42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM acct_ctrl.assignments a WHERE a.work_item_id = p_work_item_id AND a.profile_id = p_actor_id AND a.role = p_required_role AND a.unassigned_at IS NULL) THEN RAISE EXCEPTION 'aktor tidak memiliki assignment role yang diperlukan' USING ERRCODE = '42501'; END IF;
  IF p_required_role = 'checker' AND EXISTS (SELECT 1 FROM acct_ctrl.assignments a WHERE a.work_item_id = p_work_item_id AND a.profile_id = p_actor_id AND a.role = 'maker' AND a.unassigned_at IS NULL) THEN RAISE EXCEPTION 'separation of duties dilanggar' USING ERRCODE = '42501'; END IF;
  IF p_required_role = 'approver' AND EXISTS (SELECT 1 FROM acct_ctrl.assignments a WHERE a.work_item_id = p_work_item_id AND a.profile_id = p_actor_id AND a.role IN ('maker','checker') AND a.unassigned_at IS NULL) THEN RAISE EXCEPTION 'separation of duties dilanggar' USING ERRCODE = '42501'; END IF;
END;
$$;

CREATE OR REPLACE FUNCTION acct_ctrl.record_review_decision(
  p_work_item_id UUID, p_actor_id UUID, p_kind TEXT, p_decision acct_ctrl.review_decision,
  p_comment TEXT DEFAULT NULL, p_checklist_template_id UUID DEFAULT NULL, p_findings JSONB DEFAULT '[]'::JSONB
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = acct_ctrl, pg_catalog AS $$
DECLARE
  item acct_ctrl.work_items%ROWTYPE;
  decision_id UUID;
  finding JSONB;
  authority RECORD;
BEGIN
  SELECT * INTO item FROM acct_ctrl.work_items WHERE id = p_work_item_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'work item tidak ditemukan' USING ERRCODE = 'P0002'; END IF;
  IF p_kind NOT IN ('review','approval') THEN RAISE EXCEPTION 'jenis keputusan tidak valid' USING ERRCODE = '22P02'; END IF;
  IF p_decision <> 'approved' AND NULLIF(BTRIM(p_comment), '') IS NULL AND jsonb_array_length(COALESCE(p_findings, '[]'::JSONB)) = 0 THEN RAISE EXCEPTION 'alasan atau finding wajib diisi' USING ERRCODE = '23514'; END IF;

  IF p_kind = 'review' THEN
    PERFORM acct_ctrl.assert_review_actor(p_work_item_id, p_actor_id, 'checker');
    IF item.status NOT IN ('submitted','under_review') THEN RAISE EXCEPTION 'work item belum berada pada tahap review' USING ERRCODE = '23514'; END IF;
    INSERT INTO acct_ctrl.reviews(work_item_id, reviewer_id, decision, comment, checklist_template_id) VALUES (p_work_item_id, p_actor_id, p_decision, NULLIF(BTRIM(p_comment), ''), p_checklist_template_id) RETURNING id INTO decision_id;
    FOR finding IN SELECT * FROM jsonb_array_elements(COALESCE(p_findings, '[]'::JSONB)) LOOP
      IF NULLIF(BTRIM(finding->>'description'), '') IS NOT NULL THEN
        INSERT INTO acct_ctrl.review_findings(review_id, checklist_item_id, finding_type, description, severity) VALUES (decision_id, NULLIF(finding->>'checklist_item_id','')::UUID, COALESCE(finding->>'finding_type','observation'), BTRIM(finding->>'description'), NULLIF(finding->>'severity',''));
      END IF;
    END LOOP;
    IF item.status = 'submitted' THEN PERFORM acct_ctrl.transition_work_item(p_work_item_id, 'under_review', p_actor_id, NULL); END IF;
    IF p_decision = 'approved' THEN
      PERFORM acct_ctrl.transition_work_item(p_work_item_id, 'approved', p_actor_id, NULL);
      IF item.approval_requirement IN ('approver','multi_level') OR item.required_approval_level > 0 THEN PERFORM acct_ctrl.transition_work_item(p_work_item_id, 'awaiting_approval', p_actor_id, NULL); ELSE PERFORM acct_ctrl.transition_work_item(p_work_item_id, 'completed', p_actor_id, NULL); END IF;
    ELSE
      PERFORM acct_ctrl.transition_work_item(p_work_item_id, 'revision_required', p_actor_id, COALESCE(p_comment, 'Review memerlukan revisi'));
    END IF;
  ELSE
    PERFORM acct_ctrl.assert_review_actor(p_work_item_id, p_actor_id, 'approver');
    IF item.status <> 'awaiting_approval' THEN RAISE EXCEPTION 'work item belum menunggu approval' USING ERRCODE = '23514'; END IF;
    IF item.approval_requirement NOT IN ('approver','multi_level') AND item.required_approval_level = 0 THEN RAISE EXCEPTION 'policy tidak memerlukan approval' USING ERRCODE = '42501'; END IF;
    SELECT * INTO authority FROM acct_ctrl.resolve_effective_authority(item.organization_id, item.client_id, item.entity_id, p_actor_id, 'approver', COALESCE(item.amount, 0), COALESCE(item.currency_code, 'IDR'), item.risk_level, COALESCE(item.required_approval_level, 0), now());
    IF authority.authorized IS DISTINCT FROM true THEN RAISE EXCEPTION 'INSUFFICIENT_APPROVAL_AUTHORITY' USING ERRCODE = '42501'; END IF;
    IF p_decision = 'approved' AND EXISTS (SELECT 1 FROM acct_ctrl.approvals a WHERE a.work_item_id = item.id AND a.approver_id = p_actor_id AND a.decision = 'approved') THEN RAISE EXCEPTION 'approval sudah tercatat' USING ERRCODE = '23505'; END IF;
    INSERT INTO acct_ctrl.approvals(work_item_id, approver_id, decision, comment, authorization_source, authority_id, delegation_id, delegation_principal_id, approval_level, authorized_amount, authorized_currency_code, authority_snapshot)
    VALUES (p_work_item_id, p_actor_id, p_decision, NULLIF(BTRIM(p_comment), ''), authority.authorization_source, authority.authority_id, authority.delegation_id, authority.principal_id, authority.authorization_level, authority.authorization_limit, item.currency_code, authority.snapshot) RETURNING id INTO decision_id;
    IF p_decision = 'approved' THEN PERFORM acct_ctrl.transition_work_item(p_work_item_id, 'completed', p_actor_id, NULL); ELSE PERFORM acct_ctrl.transition_work_item(p_work_item_id, 'revision_required', p_actor_id, COALESCE(p_comment, 'Approval memerlukan revisi')); END IF;
  END IF;
  RETURN jsonb_build_object('id', decision_id, 'kind', p_kind, 'decision', p_decision);
END;
$$;

REVOKE ALL ON FUNCTION acct_ctrl.assert_review_actor(UUID,UUID,TEXT), acct_ctrl.record_review_decision(UUID,UUID,TEXT,acct_ctrl.review_decision,TEXT,UUID,JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION acct_ctrl.assert_review_actor(UUID,UUID,TEXT), acct_ctrl.record_review_decision(UUID,UUID,TEXT,acct_ctrl.review_decision,TEXT,UUID,JSONB) TO service_role;
