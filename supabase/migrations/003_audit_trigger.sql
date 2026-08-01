-- =============================================================
-- Migration 003: Audit trail trigger (auto-log changes)
-- Project: Accounting Operations Control Tower
--
-- Creates a generic trigger function log_change() that captures
-- INSERT/UPDATE/DELETE on target tables and writes to audit_logs.
-- =============================================================

-- 1. Generic trigger function
CREATE OR REPLACE FUNCTION acct_ctrl.log_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_action      TEXT;
  v_old         JSONB;
  v_new         JSONB;
  v_entity_id   UUID;
  v_org_id      UUID;
  v_actor_id    UUID;
  v_entity_type TEXT;
BEGIN
  -- Map TG_OP to action name
  IF TG_OP = 'INSERT' THEN
    v_action := 'created';
    v_old := NULL;
    v_new := to_jsonb(NEW);
  ELSIF TG_OP = 'UPDATE' THEN
    v_action := 'updated';
    v_old := to_jsonb(OLD);
    v_new := to_jsonb(NEW);
  ELSIF TG_OP = 'DELETE' THEN
    v_action := 'deleted';
    v_old := to_jsonb(OLD);
    v_new := NULL;
  END IF;

  -- Determine entity_id (always 'id' column)
  IF TG_OP = 'DELETE' THEN
    v_entity_id := OLD.id;
  ELSE
    v_entity_id := NEW.id;
  END IF;

  -- Entity type from table name
  v_entity_type := TG_TABLE_NAME;

  -- Resolve organization_id:
  -- work_items has org_id directly; assignments needs a join
  IF TG_TABLE_NAME = 'work_items' THEN
    IF TG_OP = 'DELETE' THEN
      v_org_id := OLD.organization_id;
    ELSE
      v_org_id := NEW.organization_id;
    END IF;
  ELSIF TG_TABLE_NAME = 'assignments' THEN
    IF TG_OP = 'DELETE' THEN
      SELECT wi.organization_id INTO v_org_id
      FROM acct_ctrl.work_items wi
      WHERE wi.id = OLD.work_item_id;
    ELSE
      SELECT wi.organization_id INTO v_org_id
      FROM acct_ctrl.work_items wi
      WHERE wi.id = NEW.work_item_id;
    END IF;
  END IF;

  -- Try to get actor from session variable set by app
  BEGIN
    v_actor_id := NULLIF(current_setting('app.current_user_id', true), '')::UUID;
  EXCEPTION WHEN OTHERS THEN
    v_actor_id := NULL;
  END;

  -- Insert into audit_logs (bypasses RLS because SECURITY DEFINER)
  INSERT INTO acct_ctrl.audit_logs (
    organization_id,
    actor_id,
    action,
    entity_type,
    entity_id,
    old_value,
    new_value,
    metadata
  ) VALUES (
    v_org_id,
    v_actor_id,
    v_action,
    v_entity_type,
    v_entity_id,
    v_old,
    v_new,
    jsonb_build_object(
      'trigger', true,
      'tg_op', TG_OP,
      'tg_table', TG_TABLE_NAME,
      'tg_schema', TG_TABLE_SCHEMA
    )
  );

  -- Return appropriate value
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$;

-- 2. Attach triggers to work_items
CREATE TRIGGER trg_audit_work_items
  AFTER INSERT OR UPDATE OR DELETE ON acct_ctrl.work_items
  FOR EACH ROW
  EXECUTE FUNCTION acct_ctrl.log_change();

-- 3. Attach triggers to assignments
CREATE TRIGGER trg_audit_assignments
  AFTER INSERT OR UPDATE OR DELETE ON acct_ctrl.assignments
  FOR EACH ROW
  EXECUTE FUNCTION acct_ctrl.log_change();

-- 4. Additional index for efficient history queries per work_item
CREATE INDEX idx_audit_logs_work_item
  ON acct_ctrl.audit_logs(entity_id, created_at DESC)
  WHERE entity_type = 'work_item';
