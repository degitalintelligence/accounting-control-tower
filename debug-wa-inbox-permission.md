# Debug Session: WA Inbox Permission

Status: [OPEN]

## Symptom
`GET /api/wa-inbox?limit=100&period=7d` returns HTTP 500 because Supabase reports `permission denied for table whatsapp_delivery_attempts` (Postgres code `42501`).

## Hypotheses
1. `service_role` lacks `SELECT` on `acct_ctrl.whatsapp_delivery_attempts`.
2. The endpoint is using a database role other than `service_role`.
3. The table grant was applied to the wrong schema or role.
4. RLS/policy configuration is blocking the query after table privilege succeeds.

## Evidence
- Supabase error hint explicitly recommends granting `SELECT` to `service_role`.
- Runtime evidence supplied by user is recorded above.

## Plan
Inspect the endpoint client and existing migrations/grants before deciding whether a database migration or client-role fix is required.
