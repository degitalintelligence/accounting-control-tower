CREATE TABLE acct_ctrl.permission_catalog (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  permission_key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE acct_ctrl.organization_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES acct_ctrl.organizations(id),
  role_key TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  is_system BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  UNIQUE (organization_id, role_key)
);

CREATE TABLE acct_ctrl.role_permissions (
  role_id UUID NOT NULL REFERENCES acct_ctrl.organization_roles(id) ON DELETE CASCADE,
  permission_id UUID NOT NULL REFERENCES acct_ctrl.permission_catalog(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (role_id, permission_id)
);

ALTER TABLE acct_ctrl.memberships ADD COLUMN IF NOT EXISTS role_id UUID REFERENCES acct_ctrl.organization_roles(id);

CREATE INDEX idx_organization_roles_org_active ON acct_ctrl.organization_roles(organization_id, is_active) WHERE deleted_at IS NULL;
CREATE INDEX idx_role_permissions_permission ON acct_ctrl.role_permissions(permission_id);
CREATE INDEX idx_memberships_role_id ON acct_ctrl.memberships(role_id) WHERE is_active = true;

INSERT INTO acct_ctrl.permission_catalog (permission_key, name, description, category)
VALUES
  ('workspace.view', 'Lihat workspace', 'Melihat data workspace yang diizinkan', 'Workspace'),
  ('workspace.manage', 'Kelola workspace', 'Mengubah konfigurasi workspace', 'Workspace'),
  ('members.view', 'Lihat anggota', 'Melihat anggota workspace', 'Anggota'),
  ('members.manage', 'Kelola anggota', 'Mengundang, mengubah, dan menonaktifkan anggota', 'Anggota'),
  ('roles.view', 'Lihat peran dan permission', 'Melihat katalog peran dan permission', 'Akses'),
  ('roles.manage', 'Kelola peran dan permission', 'Mengubah peran dan permission workspace', 'Akses'),
  ('clients.view', 'Lihat client', 'Melihat client workspace', 'Client'),
  ('clients.manage', 'Kelola client', 'Membuat dan mengubah client', 'Client'),
  ('work_items.view', 'Lihat pekerjaan', 'Melihat pekerjaan sesuai scope', 'Pekerjaan'),
  ('work_items.create', 'Buat pekerjaan', 'Membuat work item', 'Pekerjaan'),
  ('work_items.manage', 'Kelola pekerjaan', 'Mengubah dan mengatur pekerjaan', 'Pekerjaan'),
  ('work_items.review', 'Review pekerjaan', 'Melakukan review pekerjaan', 'Kontrol'),
  ('work_items.approve', 'Approve pekerjaan', 'Menyetujui pekerjaan', 'Kontrol'),
  ('reports.view', 'Lihat laporan', 'Melihat laporan operasional', 'Laporan'),
  ('reports.manage', 'Kelola laporan', 'Mengelola laporan dan deliverable', 'Laporan'),
  ('integrations.manage', 'Kelola integrasi', 'Mengelola integrasi operasional', 'Administrasi'),
  ('audit.view', 'Lihat audit', 'Melihat sampel dan temuan audit', 'Administrasi'),
  ('audit.manage', 'Kelola audit', 'Mengelola sampel dan temuan audit', 'Administrasi')
ON CONFLICT (permission_key) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description, category = EXCLUDED.category;

INSERT INTO acct_ctrl.organization_roles (organization_id, role_key, name, description, is_system)
SELECT o.id, r.role_key, r.name, r.description, true
FROM acct_ctrl.organizations o
CROSS JOIN (VALUES
  ('owner', 'Owner', 'Akses penuh workspace'),
  ('admin', 'Admin', 'Mengelola workspace dan akses'),
  ('manager', 'Manager', 'Mengelola operasi dan kontrol'),
  ('finance_manager', 'Finance Manager', 'Mengelola operasi keuangan'),
  ('accounting_manager', 'Accounting Manager', 'Mengelola kontrol accounting'),
  ('finance_staff', 'Finance Staff', 'Menjalankan pekerjaan keuangan'),
  ('accounting_staff', 'Accounting Staff', 'Menjalankan pekerjaan accounting'),
  ('viewer', 'Viewer', 'Akses baca saja')
) AS r(role_key, name, description)
ON CONFLICT (organization_id, role_key) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description, is_active = true, deleted_at = NULL;

UPDATE acct_ctrl.memberships m
SET role_id = r.id
FROM acct_ctrl.organization_roles r
WHERE r.organization_id = m.organization_id AND r.role_key = m.role AND m.role_id IS NULL;

INSERT INTO acct_ctrl.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM acct_ctrl.organization_roles r
JOIN acct_ctrl.permission_catalog p ON (
  r.role_key IN ('owner', 'admin')
  OR (r.role_key IN ('manager', 'finance_manager', 'accounting_manager') AND p.permission_key NOT IN ('roles.manage'))
  OR (r.role_key IN ('finance_staff', 'accounting_staff') AND p.permission_key IN ('workspace.view', 'members.view', 'clients.view', 'work_items.view', 'work_items.create', 'work_items.manage', 'reports.view'))
  OR (r.role_key = 'viewer' AND p.permission_key IN ('workspace.view', 'members.view', 'clients.view', 'work_items.view', 'reports.view'))
)
ON CONFLICT DO NOTHING;

ALTER TABLE acct_ctrl.permission_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE acct_ctrl.organization_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE acct_ctrl.role_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY permission_catalog_read ON acct_ctrl.permission_catalog FOR SELECT TO authenticated USING (true);
CREATE POLICY organization_roles_access ON acct_ctrl.organization_roles FOR ALL TO authenticated
  USING (organization_id IN (SELECT organization_id FROM acct_ctrl.memberships WHERE profile_id = auth.uid() AND is_active))
  WITH CHECK (organization_id IN (SELECT organization_id FROM acct_ctrl.memberships WHERE profile_id = auth.uid() AND is_active));
CREATE POLICY role_permissions_access ON acct_ctrl.role_permissions FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM acct_ctrl.organization_roles r JOIN acct_ctrl.memberships m ON m.organization_id = r.organization_id WHERE r.id = role_permissions.role_id AND m.profile_id = auth.uid() AND m.is_active))
  WITH CHECK (EXISTS (SELECT 1 FROM acct_ctrl.organization_roles r JOIN acct_ctrl.memberships m ON m.organization_id = r.organization_id WHERE r.id = role_permissions.role_id AND m.profile_id = auth.uid() AND m.is_active));

GRANT SELECT ON acct_ctrl.permission_catalog TO authenticated;
GRANT SELECT, INSERT, UPDATE ON acct_ctrl.organization_roles TO authenticated;
GRANT SELECT, INSERT, DELETE ON acct_ctrl.role_permissions TO authenticated;
GRANT ALL ON acct_ctrl.permission_catalog, acct_ctrl.organization_roles, acct_ctrl.role_permissions TO service_role;
