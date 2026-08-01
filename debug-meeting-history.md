# Debug Meeting History

Status: [RESOLVED]

## Symptoms

- Meeting history cannot be opened.
- History only offers Parse dengan AI.
- Parsed action items appear in Inbox AI, although they belong to the meeting.

## Hypotheses

1. Meeting cards have no detail/open handler.
2. Meeting parsing stores drafts in the generic AI inbox without a meeting-specific view.
3. No meeting detail or action-item endpoint exists.
4. Repeated parsing can create duplicate drafts for the same meeting.

## Evidence

Initial code inspection indicates the meeting page renders summary cards and only exposes the parse action. Runtime reproduction is not required to confirm the missing UI path, but will be used after the fix.

## Confirmed Root Cause

- Meeting history cards had no open/detail action.
- Meeting action items were stored with `meeting_id` but the generic AI inbox query did not exclude them.
- No meeting detail or meeting action-item endpoint existed.
- Re-parsing did not retire prior active meeting drafts.

## Fix

- Added meeting detail and action-item APIs.
- Added a Buka Meeting dialog with notes and meeting-scoped action items.
- Excluded meeting drafts from the generic AI Inbox.
- Re-parsing soft-deletes prior unconfirmed meeting drafts to avoid duplicates.
- Preserved meeting ID in confirmed work-item source metadata.
- Added an index for meeting-scoped draft lookup.
- Added structured meeting fields for date, attendance, discussion, action, blockers, and next steps.
- Added a one-time `parsed_at` guard so the same meeting cannot be parsed twice.

## Changes

No business logic changes yet.
