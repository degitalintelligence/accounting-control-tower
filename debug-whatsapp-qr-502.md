# Debug Session: WhatsApp QR 502

Status: [OPEN]

## Symptom

`GET /api/admin/whatsapp?action=qr&id=902033b8-36fe-49c9-a2a9-a20ab077df31` returns HTTP 502.

## Hypotheses

1. WAHA is unreachable because `WAHA_BASE_URL` is wrong or the WAHA service is unavailable.
2. The QR endpoint path or method does not match the active WAHA version.
3. The session is not in a state where QR can be requested.
4. WAHA credentials or token are invalid or missing.
5. The application hides the upstream error behind a generic 502 response.

## Evidence

| Hypothesis | Status | Evidence |
|---|---|---|
| H1 | Pending | |
| H2 | Pending | |
| H3 | Pending | |
| H4 | Pending | |
| H5 | Pending | |

## Changes

No business logic changes have been made before runtime evidence collection.
