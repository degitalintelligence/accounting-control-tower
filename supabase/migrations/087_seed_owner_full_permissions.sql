-- Memastikan role owner & administrator memiliki SEMUA permission yang ada di
-- permission_catalog. Sebagian organisasi yang dibuat sebelum permission
-- `work_items.execute` ditambahkan ke catalog (migrasi 081) tidak diberi
-- permission tersebut, sehingga owner/administrator mendapat 403 saat aksi
-- seperti upload bukti pendukung (files/checklist).
--
-- Re-seed idempotent: hanya menambah permission yang belum ada.
INSERT INTO acct_ctrl.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM acct_ctrl.organization_roles r
CROSS JOIN acct_ctrl.permission_catalog p
WHERE r.role_key IN ('owner', 'administrator')
  AND r.is_active = true
  AND r.deleted_at IS NULL
ON CONFLICT (role_id, permission_id) DO NOTHING;
