CREATE TABLE acct_ctrl.whatsapp_delivery_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES acct_ctrl.organizations(id),
  notification_id UUID NOT NULL REFERENCES acct_ctrl.notifications(id),
  connection_id UUID NOT NULL REFERENCES acct_ctrl.integration_connections(id),
  session_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  chat_id TEXT NOT NULL,
  attempt_number INTEGER NOT NULL,
  outcome TEXT NOT NULL CHECK (outcome IN ('started', 'succeeded', 'failed')),
  provider_message_id TEXT,
  provider_response JSONB,
  error_code TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_whatsapp_delivery_attempts_notification
  ON acct_ctrl.whatsapp_delivery_attempts(notification_id, created_at DESC);

CREATE INDEX idx_whatsapp_delivery_attempts_organization
  ON acct_ctrl.whatsapp_delivery_attempts(organization_id, created_at DESC);

ALTER TABLE acct_ctrl.whatsapp_delivery_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY whatsapp_delivery_attempts_org_access ON acct_ctrl.whatsapp_delivery_attempts
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM acct_ctrl.memberships m
      WHERE m.organization_id = whatsapp_delivery_attempts.organization_id
        AND m.profile_id = auth.uid()
        AND m.is_active
    )
  );

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON acct_ctrl.whatsapp_delivery_attempts FROM PUBLIC, anon, authenticated;
GRANT SELECT ON acct_ctrl.whatsapp_delivery_attempts TO authenticated;
GRANT INSERT ON acct_ctrl.whatsapp_delivery_attempts TO service_role;

CREATE OR REPLACE FUNCTION acct_ctrl.prevent_whatsapp_delivery_attempt_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = acct_ctrl, pg_catalog
AS $$
BEGIN
  RAISE EXCEPTION 'WhatsApp delivery attempts bersifat append-only';
END;
$$;

CREATE TRIGGER whatsapp_delivery_attempts_append_only
  BEFORE UPDATE OR DELETE ON acct_ctrl.whatsapp_delivery_attempts
  FOR EACH ROW EXECUTE FUNCTION acct_ctrl.prevent_whatsapp_delivery_attempt_mutation();

REVOKE ALL ON FUNCTION acct_ctrl.prevent_whatsapp_delivery_attempt_mutation() FROM PUBLIC, anon, authenticated;
