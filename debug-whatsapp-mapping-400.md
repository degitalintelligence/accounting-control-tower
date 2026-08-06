# Debug WhatsApp Mapping 400

Status: [OPEN]

## Symptom

`POST /api/admin/whatsapp` returns HTTP 400 during WhatsApp group/contact mapping.

## Hypotheses

1. Mapping payload contains an empty `wa_group_id` or `provider_participant_id`.
2. Participant ID format returned by WAHA does not match the server validation.
3. Selected local group does not provide a valid provider group identifier.
4. Server rejects the mapping because of profile or organization/client access validation.
5. The UI submits the mapping action more than once or submits stale state.

## Evidence

Initial terminal evidence reports two HTTP 400 responses from `POST /api/admin/whatsapp`, without response bodies.

## Next step

Capture the response body and request action for the failing interaction, then correlate it with the hypotheses above.
