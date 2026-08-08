-- 084_harden_client_scope_rls_policies.sql
-- ------------------------------------------------------------
-- Tujuan: menutup gap tenancy RLS. Beberapa tabel yang menginduk ke tabel
-- client-scoped (work_items, task_templates, teams, wa_groups) masih memakai
-- policy org-level dari migration 001. Ini memungkinkan user yang hanya punya
-- akses ke satu client (dalam org yang sama) membaca data child milik client
-- lain. Perbaikan: ganti policy jadi client-level via join ke induk client-scoped.
--
-- Yang TETAP org-wide (keputusan desain):
--   - sop_templates / sop_versions / checklist_templates / files
--   - checklist_items / outbox_events / notification_deliveries / audit_samples
--
-- Helper: acct_ctrl.has_client_access(org, client) & current_organization_id()
-- sudah ada dari migration 013.

SET search_path = acct_ctrl, pg_catalog;

-- ============================================================
-- 1. Tabel via work_items (induk client-scoped)
-- ============================================================

DO $$
DECLARE
  t TEXT;
  tables_via_work_item TEXT[] := ARRAY[
    'assignments', 'work_item_status_history', 'checklist_responses',
    'work_item_files', 'reviews', 'approvals', 'comments', 'escalation_instances',
    'projects', 'dependencies'
  ];
BEGIN
  FOREACH t IN ARRAY tables_via_work_item LOOP
    EXECUTE format('DROP POLICY IF EXISTS "org_isolation_%s" ON acct_ctrl.%I', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "org_client_isolation_%s" ON acct_ctrl.%I', t, t);
    EXECUTE format(
      'CREATE POLICY "org_client_isolation_%s" ON acct_ctrl.%I
       FOR ALL TO authenticated
       USING (
         EXISTS (
           SELECT 1 FROM acct_ctrl.work_items wi
           WHERE wi.id = %I.work_item_id
             AND acct_ctrl.has_client_access(wi.organization_id, wi.client_id)
         )
       )
       WITH CHECK (
         EXISTS (
           SELECT 1 FROM acct_ctrl.work_items wi
           WHERE wi.id = %I.work_item_id
             AND acct_ctrl.has_client_access(wi.organization_id, wi.client_id)
         )
       )',
      t, t, t, t
    );
  END LOOP;
END $$;

-- milestones: via projects -> work_items
DROP POLICY IF EXISTS "org_isolation_milestones" ON acct_ctrl.milestones;
DROP POLICY IF EXISTS "org_client_isolation_milestones" ON acct_ctrl.milestones;
CREATE POLICY "org_client_isolation_milestones" ON acct_ctrl.milestones
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM acct_ctrl.projects p
      JOIN acct_ctrl.work_items wi ON wi.id = p.work_item_id
      WHERE p.id = project_id
        AND acct_ctrl.has_client_access(wi.organization_id, wi.client_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM acct_ctrl.projects p
      JOIN acct_ctrl.work_items wi ON wi.id = p.work_item_id
      WHERE p.id = project_id
        AND acct_ctrl.has_client_access(wi.organization_id, wi.client_id)
    )
  );

-- review_findings: via reviews -> work_items
DROP POLICY IF EXISTS "org_isolation_review_findings" ON acct_ctrl.review_findings;
DROP POLICY IF EXISTS "org_client_isolation_review_findings" ON acct_ctrl.review_findings;
CREATE POLICY "org_client_isolation_review_findings" ON acct_ctrl.review_findings
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM acct_ctrl.reviews r
      JOIN acct_ctrl.work_items wi ON wi.id = r.work_item_id
      WHERE r.id = review_id
        AND acct_ctrl.has_client_access(wi.organization_id, wi.client_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM acct_ctrl.reviews r
      JOIN acct_ctrl.work_items wi ON wi.id = r.work_item_id
      WHERE r.id = review_id
        AND acct_ctrl.has_client_access(wi.organization_id, wi.client_id)
    )
  );

-- evidence_requirements: via work_items ATAU via task_templates (keduanya client-scoped)
DROP POLICY IF EXISTS "org_isolation_evidence_requirements" ON acct_ctrl.evidence_requirements;
DROP POLICY IF EXISTS "org_client_isolation_evidence_requirements" ON acct_ctrl.evidence_requirements;
CREATE POLICY "org_client_isolation_evidence_requirements" ON acct_ctrl.evidence_requirements
  FOR ALL TO authenticated
  USING (
    (work_item_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM acct_ctrl.work_items wi
      WHERE wi.id = evidence_requirements.work_item_id
        AND acct_ctrl.has_client_access(wi.organization_id, wi.client_id)
    ))
    OR
    (template_version_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM acct_ctrl.template_versions tv
      JOIN acct_ctrl.task_templates tt ON tt.id = tv.template_id
      WHERE tv.id = evidence_requirements.template_version_id
        AND acct_ctrl.has_client_access(tt.organization_id, tt.client_id)
    ))
  )
  WITH CHECK (
    (work_item_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM acct_ctrl.work_items wi
      WHERE wi.id = evidence_requirements.work_item_id
        AND acct_ctrl.has_client_access(wi.organization_id, wi.client_id)
    ))
    OR
    (template_version_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM acct_ctrl.template_versions tv
      JOIN acct_ctrl.task_templates tt ON tt.id = tv.template_id
      WHERE tv.id = evidence_requirements.template_version_id
        AND acct_ctrl.has_client_access(tt.organization_id, tt.client_id)
    ))
  );

-- ============================================================
-- 2. Tabel via task_templates (induk client-scoped)
-- ============================================================

DROP POLICY IF EXISTS "org_isolation_template_versions" ON acct_ctrl.template_versions;
DROP POLICY IF EXISTS "org_client_isolation_template_versions" ON acct_ctrl.template_versions;
CREATE POLICY "org_client_isolation_template_versions" ON acct_ctrl.template_versions
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM acct_ctrl.task_templates tt
      WHERE tt.id = template_id
        AND acct_ctrl.has_client_access(tt.organization_id, tt.client_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM acct_ctrl.task_templates tt
      WHERE tt.id = template_id
        AND acct_ctrl.has_client_access(tt.organization_id, tt.client_id)
    )
  );

DROP POLICY IF EXISTS "org_isolation_recurrence_rules" ON acct_ctrl.recurrence_rules;
DROP POLICY IF EXISTS "org_client_isolation_recurrence_rules" ON acct_ctrl.recurrence_rules;
CREATE POLICY "org_client_isolation_recurrence_rules" ON acct_ctrl.recurrence_rules
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM acct_ctrl.task_templates tt
      WHERE tt.id = template_id
        AND acct_ctrl.has_client_access(tt.organization_id, tt.client_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM acct_ctrl.task_templates tt
      WHERE tt.id = template_id
        AND acct_ctrl.has_client_access(tt.organization_id, tt.client_id)
    )
  );

-- ============================================================
-- 3. Tabel via teams (induk client-scoped)
-- ============================================================

DROP POLICY IF EXISTS "org_isolation_team_members" ON acct_ctrl.team_members;
DROP POLICY IF EXISTS "org_client_isolation_team_members" ON acct_ctrl.team_members;
CREATE POLICY "org_client_isolation_team_members" ON acct_ctrl.team_members
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM acct_ctrl.teams t
      WHERE t.id = team_members.team_id
        AND acct_ctrl.has_client_access(t.organization_id, t.client_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM acct_ctrl.teams t
      WHERE t.id = team_members.team_id
        AND acct_ctrl.has_client_access(t.organization_id, t.client_id)
    )
  );

-- ============================================================
-- 4. Tabel WhatsApp (intelemen via wa_groups yang client-scoped)
--    FIX bypass `wa_group_id IS NULL` (celah lintas-org) di wa_messages
-- ============================================================

-- wa_participant_mappings
DROP POLICY IF EXISTS "org_isolation_wa_participant_mappings" ON acct_ctrl.wa_participant_mappings;
DROP POLICY IF EXISTS "org_client_isolation_wa_participant_mappings" ON acct_ctrl.wa_participant_mappings;
CREATE POLICY "org_client_isolation_wa_participant_mappings" ON acct_ctrl.wa_participant_mappings
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM acct_ctrl.wa_groups wg
      WHERE wg.id = wa_group_id
        AND acct_ctrl.has_client_access(wg.organization_id, wg.client_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM acct_ctrl.wa_groups wg
      WHERE wg.id = wa_group_id
        AND acct_ctrl.has_client_access(wg.organization_id, wg.client_id)
    )
  );

-- wa_messages: hapus bypass wa_group_id IS NULL
DROP POLICY IF EXISTS "org_isolation_wa_messages" ON acct_ctrl.wa_messages;
DROP POLICY IF EXISTS "org_client_isolation_wa_messages" ON acct_ctrl.wa_messages;
CREATE POLICY "org_client_isolation_wa_messages" ON acct_ctrl.wa_messages
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM acct_ctrl.wa_groups wg
      WHERE wg.id = wa_messages.wa_group_id
        AND acct_ctrl.has_client_access(wg.organization_id, wg.client_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM acct_ctrl.wa_groups wg
      WHERE wg.id = wa_messages.wa_group_id
        AND acct_ctrl.has_client_access(wg.organization_id, wg.client_id)
    )
  );

-- ai_extraction_runs: via wa_messages -> wa_groups
DROP POLICY IF EXISTS "org_isolation_ai_extraction_runs" ON acct_ctrl.ai_extraction_runs;
DROP POLICY IF EXISTS "org_client_isolation_ai_extraction_runs" ON acct_ctrl.ai_extraction_runs;
CREATE POLICY "org_client_isolation_ai_extraction_runs" ON acct_ctrl.ai_extraction_runs
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM acct_ctrl.wa_messages wm
      JOIN acct_ctrl.wa_groups wg ON wg.id = wm.wa_group_id
      WHERE wm.id = wa_message_id
        AND acct_ctrl.has_client_access(wg.organization_id, wg.client_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM acct_ctrl.wa_messages wm
      JOIN acct_ctrl.wa_groups wg ON wg.id = wm.wa_group_id
      WHERE wm.id = wa_message_id
        AND acct_ctrl.has_client_access(wg.organization_id, wg.client_id)
    )
  );

-- ============================================================
-- 5. Tabel dengan kolom client_id langsung yang policy-nya masih org-level
-- ============================================================

-- audit_findings: punya client_id (dari 025) tapi policy lama org-only via audit_samples
DROP POLICY IF EXISTS "org_isolation_audit_findings" ON acct_ctrl.audit_findings;
DROP POLICY IF EXISTS "org_client_isolation_audit_findings" ON acct_ctrl.audit_findings;
CREATE POLICY "org_client_isolation_audit_findings" ON acct_ctrl.audit_findings
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM acct_ctrl.audit_samples as2
      WHERE as2.id = audit_sample_id
        AND acct_ctrl.has_client_access(as2.organization_id, audit_findings.client_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM acct_ctrl.audit_samples as2
      WHERE as2.id = audit_sample_id
        AND acct_ctrl.has_client_access(as2.organization_id, audit_findings.client_id)
    )
  );

-- ai_review_notes: punya client_id (dari 025) tapi policy lama org-only
DROP POLICY IF EXISTS "org_isolation_ai_review_notes" ON acct_ctrl.ai_review_notes;
DROP POLICY IF EXISTS "org_client_isolation_ai_review_notes" ON acct_ctrl.ai_review_notes;
CREATE POLICY "org_client_isolation_ai_review_notes" ON acct_ctrl.ai_review_notes
  FOR ALL TO authenticated
  USING (acct_ctrl.has_client_access(organization_id, client_id))
  WITH CHECK (acct_ctrl.has_client_access(organization_id, client_id));
