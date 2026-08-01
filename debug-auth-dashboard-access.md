# Debug Session: auth-dashboard-access

Status: [OPEN]

## Symptoms

Seeded users cannot open the dashboard.

## Hypotheses

1. Auth session or proxy protection redirects/blocks authenticated users incorrectly.
2. Seeded auth users do not have matching profiles or organization memberships.
3. Dashboard auth context queries the wrong schema or applies an incorrect membership filter.
4. Seed data creates organizations/memberships but does not link them to the actual Supabase auth user IDs.
5. Supabase data or schema-cache state is missing the expected seeded records.

## Evidence

| Phase | Observation | Result |
|---|---|---|
| Pre-fix | Seed script exited because `.env.local` was not loaded; migration `002` created profiles but no memberships; direct service-role query initially returned schema permission denied | Confirmed hypotheses 2, 4, and 5 |
| Fix | Migration `017` applied successfully with status 201; grants, trigger membership creation, and existing seeded-user backfill were installed | Fixed |
| Post-fix | Seed script is idempotent and ensures 3 active memberships; authenticated Supabase sign-in succeeds and admin resolves to the default organization; build and 19 tests pass | Confirmed |

## Changes

Implemented an idempotent seed flow, corrected schema grants, and added membership backfill/trigger behavior.
