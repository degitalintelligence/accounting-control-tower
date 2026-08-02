# Debug Session: Live WAHA Message Rejected

Status: [OPEN]
Session ID: live-waha-message-rejected

## Symptom

A live WAHA `message` payload for group `120363412531180280@g.us` with body `Test lagi` is not appearing in `acct_ctrl.wa_messages`.

## Hypotheses

1. The live production endpoint still runs an older build or receives a different webhook header.
2. The group `120363412531180280@g.us` is not active or is linked to a different production connection/organization.
3. The payload is rejected during identifier/session/group lookup.
4. `enqueue_whatsapp_message` fails after lookup because of an RPC, permission, or constraint error.
5. The webhook succeeds but the user checks a different database/project than the production application.

## Evidence

The supplied payload has a valid `message` event, session `ops-acctg`, group `120363412531180280@g.us`, provider message ID, and body. Runtime and database checks are pending.

## Changes

No business logic has been changed during bootstrap.
