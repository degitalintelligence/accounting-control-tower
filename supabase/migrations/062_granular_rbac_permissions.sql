INSERT INTO acct_ctrl.permission_catalog (permission_key, name, description, category)
VALUES
  ('sop.view', 'Lihat SOP', 'Melihat template dan versi SOP', 'Kontrol'),
  ('sop.manage', 'Kelola SOP', 'Membuat, mengubah, dan mengarsipkan SOP', 'Kontrol'),
  ('checklists.view', 'Lihat checklist', 'Melihat template dan response checklist', 'Kontrol'),
  ('checklists.manage', 'Kelola checklist', 'Membuat dan mengubah template checklist', 'Kontrol'),
  ('approval_policies.view', 'Lihat kebijakan approval', 'Melihat kebijakan approval', 'Kontrol'),
  ('approval_policies.manage', 'Kelola kebijakan approval', 'Mengubah kebijakan approval', 'Kontrol'),
  ('approval_authorities.view', 'Lihat otoritas approval', 'Melihat otoritas approval', 'Kontrol'),
  ('approval_authorities.manage', 'Kelola otoritas approval', 'Mengubah otoritas approval', 'Kontrol'),
  ('delegations.view', 'Lihat delegasi', 'Melihat delegasi approval', 'Kontrol'),
  ('delegations.manage', 'Kelola delegasi', 'Mengubah delegasi approval', 'Kontrol'),
  ('planned_leaves.view', 'Lihat planned leave', 'Melihat planned leave sesuai scope', 'Operasional'),
  ('planned_leaves.manage', 'Kelola planned leave', 'Membuat, mengubah, dan membatalkan planned leave', 'Operasional'),
  ('planned_leaves.approve', 'Approve planned leave', 'Menyetujui atau menolak planned leave', 'Operasional'),
  ('escalations.view', 'Lihat escalation', 'Melihat kebijakan escalation', 'Operasional'),
  ('escalations.manage', 'Kelola escalation', 'Mengubah kebijakan escalation', 'Operasional'),
  ('organization.manage', 'Kelola organisasi', 'Mengubah pengaturan organisasi', 'Workspace'),
  ('job_health.view', 'Lihat kesehatan job', 'Melihat status background job', 'Administrasi'),
  ('dead_letters.view', 'Lihat dead letter', 'Melihat event gagal', 'Administrasi'),
  ('dead_letters.manage', 'Kelola dead letter', 'Memproses ulang event gagal', 'Administrasi'),
  ('ai_review.view', 'Lihat AI review', 'Melihat AI review notes', 'AI'),
  ('ai_review.use', 'Gunakan AI review', 'Membuat AI review notes', 'AI'),
  ('ai_review.decide', 'Putuskan AI review', 'Menerima atau menolak AI review notes', 'AI'),
  ('work_items.due_date.manage', 'Kelola due date', 'Mengubah due date pekerjaan yang sudah ditugaskan', 'Pekerjaan'),
  ('work_items.overdue.manage', 'Kelola due date overdue', 'Mengubah due date pekerjaan yang sudah overdue', 'Pekerjaan')
ON CONFLICT (permission_key) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description, category = EXCLUDED.category;

INSERT INTO acct_ctrl.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM acct_ctrl.organization_roles r
JOIN acct_ctrl.permission_catalog p ON (
  r.role_key IN ('owner', 'admin')
  OR (r.role_key IN ('manager', 'finance_manager', 'accounting_manager') AND p.permission_key NOT IN ('roles.manage'))
  OR (r.role_key IN ('finance_staff', 'accounting_staff') AND p.permission_key IN (
    'workspace.view', 'sop.view', 'checklists.view', 'clients.view', 'work_items.view', 'work_items.create',
    'work_items.manage', 'work_items.due_date.manage', 'reports.view', 'planned_leaves.view', 'planned_leaves.manage', 'ai_review.view', 'ai_review.use'
  ))
  OR (r.role_key = 'viewer' AND p.permission_key IN (
    'workspace.view', 'sop.view', 'checklists.view', 'clients.view', 'work_items.view', 'reports.view', 'planned_leaves.view', 'ai_review.view'
  ))
)
ON CONFLICT DO NOTHING;
