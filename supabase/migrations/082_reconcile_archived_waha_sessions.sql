-- WAHA cleanup is the sole durable automation allowed after archive.
-- The archived-organization guard from migration 078 must allow this event so
-- legacy sessions can be reconciled without reopening the organization.
CREATE OR REPLACE FUNCTION acct_ctrl.reject_archived_organization_automation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = acct_ctrl, pg_catalog
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM acct_ctrl.organizations
    WHERE id = NEW.organization_id
      AND deleted_at IS NOT NULL
  )
  AND NOT (
    TG_TABLE_NAME IN ('domain_events', 'outbox_events')
    AND NEW.event_type = 'waha_session_cleanup_requested'
  ) THEN
    RAISE EXCEPTION 'Organisasi telah diarsipkan; automation tidak diizinkan' USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION acct_ctrl.reconcile_archived_waha_cleanup()
RETURNS TABLE(
  organizations_scanned INTEGER,
  events_created INTEGER,
  sessions_enqueued INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = acct_ctrl, public
AS $$
DECLARE
  v_organization RECORD;
  v_sessions JSONB;
  v_session_count INTEGER;
  v_event_id UUID;
  v_scanned INTEGER := 0;
  v_created INTEGER := 0;
  v_enqueued INTEGER := 0;
BEGIN
  FOR v_organization IN
    SELECT organization.id
    FROM acct_ctrl.organizations AS organization
    WHERE organization.deleted_at IS NOT NULL
    ORDER BY organization.deleted_at, organization.id
  LOOP
    v_scanned := v_scanned + 1;

    SELECT
      COALESCE(
        jsonb_agg(
          jsonb_build_object(
            'connection_id', connection.id,
            'session_id', connection.session_id
          )
          ORDER BY connection.id
        ),
        '[]'::jsonb
      ),
      COUNT(*)::INTEGER
    INTO v_sessions, v_session_count
    FROM acct_ctrl.integration_connections AS connection
    WHERE connection.organization_id = v_organization.id
      AND connection.provider = 'waha'
      AND NULLIF(BTRIM(connection.session_id), '') IS NOT NULL
      AND connection.deleted_at IS NULL;

    IF v_session_count = 0 THEN
      CONTINUE;
    END IF;

    IF EXISTS (
      SELECT 1
      FROM acct_ctrl.domain_events AS event
      WHERE event.organization_id = v_organization.id
        AND event.event_type = 'waha_session_cleanup_requested'
    ) THEN
      CONTINUE;
    END IF;

    INSERT INTO acct_ctrl.domain_events (
      organization_id,
      event_type,
      aggregate_type,
      aggregate_id,
      event_key,
      payload
    )
    VALUES (
      v_organization.id,
      'waha_session_cleanup_requested',
      'organization',
      v_organization.id,
      'organization.reconcile.waha_cleanup.' || v_organization.id::TEXT,
      jsonb_build_object(
        'organization_id', v_organization.id,
        'source', 'legacy_archived_organization_reconciliation',
        'sessions', v_sessions
      )
    )
    RETURNING id INTO v_event_id;

    INSERT INTO acct_ctrl.outbox_events (
      organization_id,
      domain_event_id,
      event_type,
      payload,
      max_retries
    )
    VALUES (
      v_organization.id,
      v_event_id,
      'waha_session_cleanup_requested',
      jsonb_build_object(
        'organization_id', v_organization.id,
        'source', 'legacy_archived_organization_reconciliation',
        'sessions', v_sessions
      ),
      12
    );

    v_created := v_created + 1;
    v_enqueued := v_enqueued + v_session_count;
  END LOOP;

  RETURN QUERY
  SELECT v_scanned, v_created, v_enqueued;
END;
$$;

REVOKE ALL
ON FUNCTION acct_ctrl.reconcile_archived_waha_cleanup()
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE
ON FUNCTION acct_ctrl.reconcile_archived_waha_cleanup()
TO service_role;

DO $$
BEGIN
  PERFORM acct_ctrl.reconcile_archived_waha_cleanup();
END;
$$;
