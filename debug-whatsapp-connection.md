# Debug WhatsApp Connection

Status: [AWAITING USER CONFIRMATION]

## Symptoms

The user requests focused repair of the WhatsApp connection flow.

## Hypotheses

1. WAHA URL or token is missing or malformed.
2. WhatsApp connection endpoints fail because of database table privileges.
3. The WAHA session is inactive or has a status mismatch with the application.
4. QR/start-session requests use an invalid provider endpoint or payload.
5. The UI hides the actual provider error behind a generic connection message.

## Evidence

Before fix: QR request returned HTTP 502 because WAHA returned 422; the UI hid the actionable provider instruction and the route changed the connection status to disconnected.
After fix: QR request returns HTTP 422 with a safe actionable message; QR failure no longer changes the stored status. Status checks use the real `GET /api/admin/whatsapp?action=status&id=...` endpoint.

## Fix

Added structured upstream status handling in the WAHA adapter and safe provider-state messaging in the admin route. Updated the administration UI to show `error` plus `action` and to use real status checks.

## Verification

Diagnostics are clean, production build succeeds, and browser verification confirms the actionable QR message and preserved connection status.
