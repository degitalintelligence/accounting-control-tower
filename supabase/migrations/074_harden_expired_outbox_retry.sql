CREATE OR REPLACE FUNCTION acct_ctrl.recover_expired_outbox_events(p_limit INTEGER DEFAULT 100)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = acct_ctrl, public
AS $$
DECLARE
  v_row acct_ctrl.outbox_events%ROWTYPE;
  v_retry INTEGER;
  v_count INTEGER := 0;
  v_error TEXT := 'Worker lease expired sebelum job selesai.';
BEGIN
  FOR v_row IN
    SELECT *
    FROM acct_ctrl.outbox_events
    WHERE status = 'processing'
      AND lease_expires_at IS NOT NULL
      AND lease_expires_at <= now()
    ORDER BY created_at
    FOR UPDATE SKIP LOCKED
    LIMIT GREATEST(p_limit, 1)
  LOOP
    v_retry := COALESCE(v_row.retry_count, 0) + 1;

    IF v_retry >= v_row.max_retries THEN
      INSERT INTO acct_ctrl.dead_letter_events (
        organization_id,
        outbox_event_id,
        event_type,
        payload,
        error_message,
        last_error,
        retry_count,
        last_retry_at
      )
      VALUES (
        v_row.organization_id,
        v_row.id,
        v_row.event_type,
        jsonb_build_object(
          'outbox_id', v_row.id,
          'organization_id', v_row.organization_id,
          'payload', v_row.payload
        ),
        v_error,
        v_error,
        v_retry,
        now()
      )
      RETURNING id INTO v_row.dead_letter_event_id;

      UPDATE acct_ctrl.outbox_events
      SET status = 'failed',
          retry_count = v_retry,
          last_error = v_error,
          dead_letter_event_id = v_row.dead_letter_event_id,
          processed_at = NULL,
          claimed_at = NULL,
          claimed_by = NULL,
          claim_token = NULL,
          lease_expires_at = NULL,
          next_retry_at = NULL
      WHERE id = v_row.id;
    ELSE
      UPDATE acct_ctrl.outbox_events
      SET status = 'pending',
          retry_count = v_retry,
          last_error = v_error,
          claimed_at = NULL,
          claimed_by = NULL,
          claim_token = NULL,
          lease_expires_at = NULL,
          next_retry_at = now() + make_interval(
            secs => LEAST(28800, 30 * power(2, v_retry - 1)::INTEGER)
          )
      WHERE id = v_row.id;
    END IF;

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION acct_ctrl.recover_expired_outbox_events(INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION acct_ctrl.recover_expired_outbox_events(INTEGER) TO service_role;
