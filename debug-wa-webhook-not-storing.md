# Debug Session: WAHA Webhook Not Storing

Status: [OPEN]
Session ID: wa-webhook-not-storing

## Symptom

New WAHA WhatsApp messages are still not appearing in `acct_ctrl.wa_messages`.

## Hypotheses

1. WAHA is sending the webhook to a different URL or the local server is not receiving live requests.
2. The live application is running an older route bundle that does not include the `message.any` and active-connection fixes.
3. The incoming payload is acknowledged but ignored because the active group/session lookup does not match.
4. The enqueue RPC or database insert fails after lookup.
5. The message is received, but the UI/database check uses a different group, environment, or time window.

## Evidence

Runtime evidence is pending. No business logic has been changed during bootstrap.

## Reproduction

Send one new message to `LUCULUCU DAILY OPERATION`, then compare the live webhook response, server output, and `acct_ctrl.wa_messages`.
