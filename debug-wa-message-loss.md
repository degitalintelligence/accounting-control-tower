# Debug Session: WhatsApp Message Loss

Status: [OPEN]
Session ID: wa-message-loss

## Symptom

The WAHA export contains many WhatsApp events, but fewer messages appear in `acct_ctrl.wa_messages`.

## Hypotheses

1. Many exported events are not ordinary chat messages and are correctly ignored.
2. WAHA sends duplicate `message.any` and `message` events, and the application stores only one idempotent copy.
3. Some messages are rejected because their group is not active/whitelisted.
4. Some webhook requests fail due to malformed payload or transport/authentication issues.
5. Some valid messages are lost because the webhook handler does not normalize all WAHA message identifiers or event shapes.

## Evidence

The export contains 37 events, including 10 `message`, 10 `message.any`, 3 group updates, 11 session statuses, and 3 revoked messages. The 10 chat messages are duplicated across `message` and `message.any`.

The application route previously accepted only `message`, so `message.any` events were acknowledged and ignored. The route now accepts both event names; the existing database idempotency key keeps each provider message stored once.

## Changes

No business logic has been changed during this bootstrap phase.
