# Debug Session: WA Claim Ambiguous Column

Status: [OPEN]
Session ID: wa-claim-ambiguous

## Symptoms

Claim suggestion fails with PostgreSQL error `42702: column reference "review_state" is ambiguous`.

## Hypotheses

1. The PL/pgSQL output variable `review_state` conflicts with the table column of the same name.
2. Migration 065 was not applied to the connected Supabase project.
3. The request fails because of reviewer membership or permission validation.
4. The frontend sends malformed claim parameters.

## Evidence Log

| Phase | Observation |
| --- | --- |
| Pre-fix | Runtime log reports PostgreSQL `42702`, specifically stating `review_state` can refer to a PL/pgSQL variable or table column. |
| Post-fix | Pending authenticated retry. |

## Decision Log

| Hypothesis | Status | Evidence |
| --- | --- | --- |
| 1 | Confirmed | PostgreSQL identifies the exact ambiguous identifier. |
| 2 | Rejected | The function exists and is executing far enough to return a PL/pgSQL ambiguity error. |
| 3 | Rejected | Membership failure would return the function's explicit membership error, not `42702`. |
| 4 | Rejected | Malformed parameters would not cause a SQL identifier ambiguity. |
