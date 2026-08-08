-- Backfill 4 system roles (owner/administrator/team_leader/staff) ke SEMUA
-- organisasi yang sudah ada, lalu konversi membership legacy dan atur ulang
-- role_permissions. Migration ini HANYA menyentuh data roles/permissions dan
-- TIDAK menyentuh fungsi create_organization_with_owner (yang sudah versi 095).

DO $$
DECLARE
  v_org RECORD;
BEGIN
  FOR v_org IN
    SELECT id FROM acct_ctrl.organizations WHERE deleted_at IS NULL
  LOOP
    -- 1) Upsert 4 role sistem (aktif kembali bila sempat dinonaktifkan).
    INSERT INTO acct_ctrl.organization_roles (organization_id, role_key, name, description, is_system)
    VALUES
      (v_org.id, 'owner', 'Owner', 'Akses penuh workspace dan kepemilikan organisasi', true),
      (v_org.id, 'administrator', 'Administrator', 'Mengelola workspace, akses, dan konfigurasi operasi', true),
      (v_org.id, 'team_leader', 'Team Leader', 'Mengelola pekerjaan, kapasitas, review, dan eskalasi tim', true),
      (v_org.id, 'staff', 'Staff', 'Menjalankan pekerjaan dan mengirimkan hasil untuk ditinjau', true)
    ON CONFLICT (organization_id, role_key) DO UPDATE
      SET name = EXCLUDED.name,
          description = EXCLUDED.description,
          is_system = true,
          is_active = true,
          deleted_at = NULL,
          updated_at = now();

    -- 2) Konversi membership legacy -> role sistem baru.
    UPDATE acct_ctrl.memberships m
    SET role = CASE
          WHEN m.role IN ('admin') THEN 'administrator'
          WHEN m.role IN ('manager', 'finance_manager', 'accounting_manager') THEN 'team_leader'
          WHEN m.role IN ('finance_staff', 'accounting_staff') THEN 'staff'
          ELSE m.role
        END
    WHERE m.organization_id = v_org.id
      AND m.role IN ('admin', 'manager', 'finance_manager', 'accounting_manager', 'finance_staff', 'accounting_staff');

    -- 3) Sinkronkan role_id pada membership yang kini memakai role sistem.
    UPDATE acct_ctrl.memberships m
    SET role_id = r.id
    FROM acct_ctrl.organization_roles r
    WHERE m.organization_id = v_org.id
      AND r.organization_id = m.organization_id
      AND r.role_key = m.role
      AND m.role IN ('owner', 'administrator', 'team_leader', 'staff');

    -- 4) Nonaktifkan role legacy (konsisten dengan migration 081).
    UPDATE acct_ctrl.organization_roles
    SET is_active = false,
        updated_at = now()
    WHERE organization_id = v_org.id
      AND role_key IN ('admin', 'manager', 'finance_manager', 'accounting_manager', 'finance_staff', 'accounting_staff');
  END LOOP;
END $$;

-- 5) Reset permission untuk 4 role sistem di semua org, lalu grant ulang.
--    owner & administrator: seluruh permission di katalog (sama dgn fungsi 095).
--    team_leader & staff: subset tetap sesuai default sistem.
DELETE FROM acct_ctrl.role_permissions rp
USING acct_ctrl.organization_roles r
WHERE r.id = rp.role_id
  AND r.role_key IN ('owner', 'administrator', 'team_leader', 'staff');

INSERT INTO acct_ctrl.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM acct_ctrl.organization_roles r
JOIN acct_ctrl.permission_catalog p ON (
  r.role_key IN ('owner', 'administrator')
  OR (
    r.role_key = 'team_leader'
    AND p.permission_key IN (
      'workspace.view', 'members.view', 'clients.view',
      'work_items.view', 'work_items.create', 'work_items.manage', 'work_items.due_date.manage',
      'work_items.review', 'work_items.approve',
      'reports.view', 'reports.manage', 'sop.view', 'sop.manage',
      'checklists.view', 'checklists.manage', 'approval_policies.view', 'approval_authorities.view',
      'escalations.view', 'escalations.manage', 'ai_review.view', 'ai_review.use', 'ai_review.decide',
      'planned_leaves.view', 'planned_leaves.manage', 'planned_leaves.approve'
    )
  )
  OR (
    r.role_key = 'staff'
    AND p.permission_key IN (
      'workspace.view', 'clients.view', 'work_items.view', 'work_items.create', 'work_items.execute',
      'sop.view', 'checklists.view', 'reports.view', 'planned_leaves.view',
      'ai_review.view', 'ai_review.use'
    )
  )
)
WHERE r.role_key IN ('owner', 'administrator', 'team_leader', 'staff')
  AND r.is_active = true
  AND r.deleted_at IS NULL
ON CONFLICT DO NOTHING;
