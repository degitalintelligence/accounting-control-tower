# Debug Session: WhatsApp Ingestion Slow

Status: [OPEN]
Session ID: wa-ingestion-slow

## Symptom

Messages eventually appear in `wa_messages`, but ingestion is slow and sometimes only one row is visible although multiple WAHA events were observed.

## Hypotheses

1. WAHA retries or serializes webhook deliveries because production responds too slowly.
2. Duplicate event types are being deduplicated correctly, making multiple deliveries appear as one row.
3. The database RPC is slow or blocked by downstream trigger/outbox work.
4. Some events use groups that are not active in the production whitelist.
5. Some valid production webhook requests fail and WAHA retries them.

## Evidence

The latest test payload is valid for `Test Dedi` and has a unique provider message ID. Timing and queue/database evidence are pending.

## Changes

No business logic has been changed during bootstrap.
