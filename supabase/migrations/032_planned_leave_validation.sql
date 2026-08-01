CREATE TYPE acct_ctrl.planned_leave_status AS ENUM ('pending', 'approved', 'rejected', 'cancelled');

CREATE TABLE acct_ctrl.planned_leaves (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES acct_ctrl.organizations(id),
  profile_id UUID NOT NULL REFERENCES acct_ctrl.profiles(id),
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  status acct_ctrl.planned_leave_status NOT NULL DEFAULT 'pending',
  reason TEXT,
  created_by UUID NOT NULL REFERENCES acct_ctrl.profiles(id),
  approved_by UUID REFERENCES acct_ctrl.profiles(id),
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  CONSTRAINT planned_leaves_date_order CHECK (start_date <= end_date)
);

ALTER TABLE acct_ctrl.planned_leaves ENABLE ROW LEVEL SECURITY;
CREATE POLICY planned_leaves_org_access ON acct_ctrl.planned_leaves
  FOR ALL TO authenticated
  USING (organization_id = acct_ctrl.current_organization_id() AND EXISTS (SELECT 1 FROM acct_ctrl.memberships m WHERE m.organization_id = planned_leaves.organization_id AND m.profile_id = auth.uid() AND m.is_active))
  WITH CHECK (organization_id = acct_ctrl.current_organization_id() AND EXISTS (SELECT 1 FROM acct_ctrl.memberships m WHERE m.organization_id = planned_leaves.organization_id AND m.profile_id = auth.uid() AND m.is_active));

CREATE INDEX idx_planned_leaves_profile_dates ON acct_ctrl.planned_leaves(organization_id, profile_id, start_date, end_date, status) WHERE deleted_at IS NULL;

CREATE OR REPLACE FUNCTION acct_ctrl.check_planned_leave_conflict(
  p_organization_id UUID,
  p_profile_id UUID,
  p_start_date DATE,
  p_end_date DATE
)
RETURNS TABLE(leave_id UUID, start_date DATE, end_date DATE, status acct_ctrl.planned_leave_status)
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = acct_ctrl, pg_catalog
AS $$
  SELECT pl.id, pl.start_date, pl.end_date, pl.status
  FROM acct_ctrl.planned_leaves pl
  WHERE pl.organization_id = p_organization_id
    AND pl.profile_id = p_profile_id
    AND pl.status IN ('pending', 'approved')
    AND pl.deleted_at IS NULL
    AND pl.start_date <= p_end_date
    AND pl.end_date >= p_start_date
  ORDER BY pl.start_date;
$$;

REVOKE ALL ON FUNCTION acct_ctrl.check_planned_leave_conflict(UUID, UUID, DATE, DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION acct_ctrl.check_planned_leave_conflict(UUID, UUID, DATE, DATE) TO service_role;
