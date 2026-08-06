# Debug WhatsApp Group Loading

Status: [OPEN]

## Symptom

Loading groups from a newly created WhatsApp session appears stuck, while an existing session loads groups quickly.

## Hypotheses

1. The new session is not yet `WORKING`, so WAHA is still waiting for WhatsApp Web readiness.
2. The group discovery request reaches WAHA but hangs or times out.
3. The new session is not authenticated or does not have an active WhatsApp connection.
4. The API does not expose a timeout/error clearly, leaving the UI in a loading state.
5. The new connection uses a mismatched session status or session identifier.

## Evidence

The screenshot shows the group loading button in a busy state and zero registered groups for a newly created session. Existing sessions reportedly load quickly.

## Next step

Inspect the discovery request and session status handling, then capture the upstream response timing and status.
