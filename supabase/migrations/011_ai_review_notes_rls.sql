ALTER TABLE acct_ctrl.ai_review_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org_isolation_ai_review_notes" ON acct_ctrl.ai_review_notes;

CREATE POLICY "org_isolation_ai_review_notes" ON acct_ctrl.ai_review_notes
  FOR ALL TO authenticated
  USING (
    organization_id = (current_setting('request.jwt.claims', true)::jsonb->>'organization_id')::uuid
  )
  WITH CHECK (
    organization_id = (current_setting('request.jwt.claims', true)::jsonb->>'organization_id')::uuid
  );
