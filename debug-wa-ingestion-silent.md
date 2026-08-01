# Debug Session: WA Ingestion Silent

Status: [OPEN]
Session: wa-ingestion-silent
Symptom: WhatsApp connection is connected, but incoming WhatsApp messages are not appearing in the application.

## Hypotheses

1. WAHA does not deliver the webhook request to the application, or sends a non-message event.
2. The webhook token is missing or invalid and the request is rejected.
3. The WAHA session in the payload does not match the application's integration connection.
4. The chat ID is not present in an active whitelist record, or the ID format differs from the stored value.
5. Ingestion succeeds, but durable outbox processing is not running.

## Evidence

- Database query found three WAHA connections: session `acctg` is `disconnected`; two connections use session `ops-acctg` and are `WORKING`.
- All three connections currently have zero `wa_groups` records and zero active whitelist groups.
- `acct_ctrl.wa_messages` currently contains zero messages.
- Supabase API and Postgres log retrieval did not return logs from the MCP environment.
- Local debug server could not start because Python is unavailable on the machine.

## Changes

Pending instrumentation.
