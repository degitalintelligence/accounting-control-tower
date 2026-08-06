# Debug WhatsApp Disconnected Delete

Status: [OPEN]

## Symptom

Deleting a WhatsApp connection returns HTTP 502 even though the local connection status is `disconnected`.

## Hypotheses

1. The retire action still calls WAHA even when the remote session is already gone.
2. WAHA returns 404, but the route maps the error to a generic 502.
3. Local `disconnected` status does not indicate whether the remote session still exists.
4. The database retirement update is not reached because remote deletion fails first.
5. The action is retire, while the expected operation is archive/delete from the local list.

## Evidence

The terminal reports two `POST /api/admin/whatsapp 502` responses while deleting a locally disconnected session.

## Next step

Inspect the retire handler and capture the upstream WAHA status before changing deletion behavior.
