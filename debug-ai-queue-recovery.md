# Debug Session: AI Queue Recovery

Status: [OPEN]
Session: ai-queue-recovery

## Symptom

`ai_extraction_requested` events appear in the failed queue after the server is back online. The user wants all recoverable failed events processed without hiding the underlying failure.

## Hypotheses

1. Production OpenRouter configuration or provider availability is causing extraction failures.
2. The database schema or privileges are not aligned with the current worker.
3. Existing failed event payloads are incompatible with the current worker.
4. Failure occurs while creating suggestions or processing a downstream WhatsApp action.
5. Retry is repeating the same failure because the UI does not expose the underlying error.

## Evidence

Pending runtime evidence from failed outbox events, dead-letter records, worker response, and server logs.

## Fix

Not started. No business logic changed during evidence collection.

## Verification

Pending.
