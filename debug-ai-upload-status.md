# Debug AI Upload Status

Status: [OPEN]

## Symptom

The AI Inbox polls `GET /api/ai-intake?intake_id=...` successfully, but no draft appears and the UI does not clearly explain whether processing failed or is still waiting for a worker.

## Hypotheses

1. The intake is still queued because no worker has claimed its outbox event.
2. The worker claimed the event and recorded a provider or database error.
3. The worker completed successfully but extracted zero actionable tasks.
4. The UI receives the status but does not clearly present the terminal or waiting state.

## Initial Evidence

- Intake `abee8d09-25a3-4717-a43e-ab67704af872` is `queued`.
- Its `attempt_count` is `0` and `processing_started_at` is null.
- Its `ai_intake_requested` outbox event is `pending`, with `claimed_by` and `last_error` null.
- Repeated status requests return HTTP 200, which confirms only that the status endpoint responds; it does not mean AI processing completed.
