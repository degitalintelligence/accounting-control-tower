# Debug Session: WAHA Event Payload

Status: [OPEN]
Session ID: waha-event-payload

## Symptom

The user provided `events (1).json` as the webhook payload exported from WAHA. The application must be checked against its actual event and message shape.

## Hypotheses

1. The export contains `message` events with a payload shape the route does not parse.
2. The relevant messages use nested `chatId`, `from`, `author`, or message ID fields not covered by the adapter.
3. The event session does not match the active application connection.
4. The export contains `fromMe` events that were previously discarded by the webhook route.
5. The payload is a WAHA delivery/export format rather than the exact HTTP body received by the app.

## Evidence

The file is larger than the direct read limit. Targeted inspection is pending.

## Changes

No business logic has been changed during this bootstrap phase.
