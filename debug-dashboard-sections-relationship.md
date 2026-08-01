# Debug Session: Dashboard Sections Relationship

Status: [RESOLVED]

## Symptom

`GET /api/dashboard/sections` returns PostgREST `PGRST201` because `assignments` has two foreign-key relationships to `profiles`.

## Hypotheses

1. The route embeds `assignments` and `profiles` without an explicit relationship name.
2. The failure is isolated to the nested select in the dashboard sections route.
3. The Node.js 20 warning is independent from the PostgREST error.
4. Repeated dashboard requests amplify the same failure but do not create separate root causes.

## Evidence

| Hypothesis | Status | Evidence |
|---|---|---|
| H1 | Confirmed | PostgREST reported both `assignments_assigned_by_fkey` and `assignments_profile_id_fkey` for the unqualified embed. |
| H2 | Confirmed | The failing query was the nested `assignments -> profiles` select in the dashboard sections route. |
| H3 | Confirmed independent | The Node.js warning concerns runtime support and does not explain PostgREST `PGRST201`. |
| H4 | Confirmed | The repeated entries represent repeated dashboard requests returning the same relationship error. |

## Changes

The query relationship was made explicit with `profiles!assignments_profile_id_fkey` in dashboard sections and upcoming deadlines. Error logging now reports non-sensitive structured metadata.
