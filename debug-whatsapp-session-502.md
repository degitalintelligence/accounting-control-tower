# Debug WhatsApp Session 502

Status: [OPEN]

## Symptom

Creating a new WhatsApp session returns `POST /api/admin/whatsapp 502`.

## Hypotheses

1. WAHA is unreachable or configured with an invalid URL.
2. The WAHA session creation request fails or times out.
3. Session creation succeeds but the subsequent start request fails.
4. The database write fails after WAHA responds.
5. The adapter loses the upstream error details and returns only a generic 502.

## Evidence

Initial terminal evidence reports `POST /api/admin/whatsapp 502 in 1006ms` during new session creation, without the response body.

## Next step

Capture sanitized runtime details for the connection request and the upstream WAHA response, then correlate them with the hypotheses.
