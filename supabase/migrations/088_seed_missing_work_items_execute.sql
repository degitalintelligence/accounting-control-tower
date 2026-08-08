-- Menambahkan permission `work_items.execute` yang hilang dari permission_catalog
-- pada sebagian database yang tidak menjalankan migrasi 081 secara penuh, lalu
-- memastikan role owner & administrator mendapatkan SEMUA permission yang ada.
--
-- Gejala: owner/administrator mendapat 403 "Anda tidak memiliki permission untuk
-- aksi ini" saat upload bukti pendukung (files/checklist), karena
-- requirePermission("work_items.execute") gagal — permission tsb tidak ada di
-- catalog sehingga CROSS JOIN re-seed 087 tidak pernah menyertakannya.
--
-- Idempotent: INSERT catalog + re-seed hanya menambah yang belum ada.

INSERT INTO acct_ctrl.permission_catalog (permission_key, name, description, category)
VALUES (
  'work_items.execute',
  'Jalankan pekerjaan',
  'Mengisi checklist dan mengirimkan bukti pendukung pada pekerjaan yang ditugaskan',
  'Pekerjaan'
)
ON CONFLICT (permission_key) DO UPDATE
SET name = EXCLUDED.name,
    description = EXCLUDED.description,
    category = EXCLUDED.category;

INSERT INTO acct_ctrl.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM acct_ctrl.organization_roles r
CROSS JOIN acct_ctrl.permission_catalog p
WHERE r.role_key IN ('owner', 'administrator')
  AND r.is_active = true
  AND r.deleted_at IS NULL
ON CONFLICT (role_id, permission_id) DO NOTHING;
