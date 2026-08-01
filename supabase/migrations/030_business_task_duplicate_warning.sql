ALTER TABLE acct_ctrl.work_items
  ADD COLUMN IF NOT EXISTS business_period TEXT,
  ADD COLUMN IF NOT EXISTS title_normalized TEXT,
  ADD COLUMN IF NOT EXISTS duplicate_warning_acknowledged_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS duplicate_warning_acknowledged_by UUID REFERENCES acct_ctrl.profiles(id);

ALTER TABLE acct_ctrl.work_items
  DROP CONSTRAINT IF EXISTS work_items_business_period_length;

ALTER TABLE acct_ctrl.work_items
  ADD CONSTRAINT work_items_business_period_length CHECK (business_period IS NULL OR length(business_period) BETWEEN 4 AND 20);

CREATE OR REPLACE FUNCTION acct_ctrl.normalize_work_item_title(p_title TEXT)
RETURNS TEXT LANGUAGE sql IMMUTABLE STRICT SET search_path = acct_ctrl, pg_catalog AS $$
  SELECT lower(regexp_replace(btrim(p_title), '\s+', ' ', 'g'));
$$;

UPDATE acct_ctrl.work_items
SET title_normalized = acct_ctrl.normalize_work_item_title(title)
WHERE title_normalized IS NULL;

CREATE OR REPLACE FUNCTION acct_ctrl.set_work_item_title_normalized()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = acct_ctrl, pg_catalog AS $$
BEGIN
  NEW.title_normalized := acct_ctrl.normalize_work_item_title(NEW.title);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_work_item_title_normalized ON acct_ctrl.work_items;
CREATE TRIGGER trg_set_work_item_title_normalized
  BEFORE INSERT OR UPDATE OF title ON acct_ctrl.work_items
  FOR EACH ROW EXECUTE FUNCTION acct_ctrl.set_work_item_title_normalized();

CREATE INDEX IF NOT EXISTS idx_work_items_business_duplicate_lookup
  ON acct_ctrl.work_items (organization_id, client_id, type, entity_id, section_id, title_normalized, business_period)
  WHERE deleted_at IS NULL AND status NOT IN ('completed', 'cancelled');

CREATE OR REPLACE FUNCTION acct_ctrl.find_business_task_duplicates(
  p_organization_id UUID,
  p_client_id UUID,
  p_type acct_ctrl.work_item_type,
  p_title TEXT,
  p_business_period TEXT DEFAULT NULL,
  p_entity_id UUID DEFAULT NULL,
  p_section_id UUID DEFAULT NULL,
  p_exclude_work_item_id UUID DEFAULT NULL
)
RETURNS TABLE (id UUID, client_id UUID, entity_id UUID, section_id UUID, type acct_ctrl.work_item_type, title TEXT, status acct_ctrl.work_item_status, due_at TIMESTAMPTZ, business_period TEXT)
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = acct_ctrl, pg_catalog AS $$
  SELECT wi.id, wi.client_id, wi.entity_id, wi.section_id, wi.type, wi.title, wi.status, wi.due_at, wi.business_period
  FROM acct_ctrl.work_items wi
  WHERE wi.organization_id = p_organization_id
    AND wi.client_id = p_client_id
    AND wi.type = p_type
    AND wi.title_normalized = acct_ctrl.normalize_work_item_title(p_title)
    AND wi.entity_id IS NOT DISTINCT FROM p_entity_id
    AND wi.section_id IS NOT DISTINCT FROM p_section_id
    AND wi.business_period IS NOT DISTINCT FROM p_business_period
    AND wi.deleted_at IS NULL
    AND wi.status NOT IN ('completed', 'cancelled')
    AND wi.id IS DISTINCT FROM p_exclude_work_item_id
  ORDER BY wi.due_at NULLS LAST, wi.created_at;
$$;

REVOKE ALL ON FUNCTION acct_ctrl.find_business_task_duplicates(UUID, UUID, acct_ctrl.work_item_type, TEXT, TEXT, UUID, UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION acct_ctrl.find_business_task_duplicates(UUID, UUID, acct_ctrl.work_item_type, TEXT, TEXT, UUID, UUID, UUID) TO service_role;
