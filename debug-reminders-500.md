# Debug Reminders 500

Status: [OPEN]

## Symptom

The scheduled request to `POST /api/jobs/reminders` returns HTTP 500. The scheduler reports: `Job permanently failed after 1 attempts`.

## Hypotheses

1. The reminders worker fails while accessing a Supabase table or RPC.
2. The scheduler secret is inconsistent, although this would normally return HTTP 401.
3. A reminder queue item or configuration causes an exception while processing a batch.
4. An additional runtime/provider environment variable required by reminders is missing or invalid.
5. The scheduler treats an application failure as permanent instead of retrying it.

## Evidence

- User report: scheduler output includes `curl: (22) The requested URL returned error: 500`.
- The response body and Coolify runtime log have not yet been collected.
- The endpoint's route returns HTTP 500 when either `runDeadlineReminderSweep` or `runBasicDigestSweep` throws.

## Code Inspection Boundary

- Reminder processing queries `work_items`, `profiles`, `notification_preferences`, and `assignments`.
- It also publishes notification events through the notification publisher.
- Static inspection cannot identify which runtime query, data row, timezone, or publisher operation failed.
- A manual request to the reminders endpoint returned `401 Unauthorized`, proving the request used an absent or mismatched cron secret at that attempt.
- A subsequent authorized manual request returned `500` with `{"error":"Gagal menjalankan reminder sweep."}`.
- Authentication is now confirmed; the failure occurs inside the reminder worker.
- Duplicate non-null `domain_events.event_key` values were absent.
- The database had a partial unique index for `event_key`, while the publisher uses `onConflict: "event_key"`.
- Migration `045_fix_domain_event_upsert_conflict` was applied successfully, adding a regular unique constraint on `acct_ctrl.domain_events(event_key)`.
- Post-migration authorized request still returned HTTP 500 with the generic reminder error.

## Current Finding

The conflict-target mismatch was not sufficient to resolve the issue, so it is not confirmed as the root cause. Runtime error details from the Coolify application log are still required before another fix.

## Changes

- No business logic changed.
