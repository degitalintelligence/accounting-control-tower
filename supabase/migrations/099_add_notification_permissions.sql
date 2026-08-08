-- Menambahkan permission untuk notifikasi ke dalam catalog.
INSERT INTO acct_ctrl.permission_catalog (permission_key, name, description, category)
VALUES
  ('notifications.view', 'Lihat notifikasi', 'Melihat daftar notifikasi pribadi', 'Sistem'),
  ('notifications.manage', 'Kelola notifikasi', 'Menandai notifikasi sebagai terbaca', 'Sistem')
ON CONFLICT (permission_key) DO UPDATE
SET name = EXCLUDED.name,
    description = EXCLUDED.description,
    category = EXCLUDED.category;

-- Memberikan permission notifikasi ke role standar.
INSERT INTO acct_ctrl.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM acct_ctrl.organization_roles r
JOIN acct_ctrl.permission_catalog p ON (
  r.role_key IN ('owner', 'administrator', 'team_leader', 'staff')
  AND p.permission_key IN ('notifications.view', 'notifications.manage')
)
WHERE r.is_active = true
  AND r.deleted_at IS NULL
ON CONFLICT DO NOTHING;
