# Debug AI Upload No Draft

Status: [OPEN]

## Symptom

File upload returns `POST /api/ai-intake 202` followed by `GET /api/ai-intake 200`, but no draft appears in the AI Inbox.

## Hypotheses

1. The asynchronous worker has not completed when the page performs its single reload.
2. The worker fails while reading or parsing the uploaded file.
3. The AI provider returns zero extractable draft items.
4. Draft rows exist but the GET query filters them out.
5. The UI does not refresh after asynchronous processing completes.

## Evidence

- `POST /api/ai-intake 202` confirms intake enqueue accepted.
- `GET /api/ai-intake 200` confirms the list request itself succeeds.
- Database showed six `ai_intake_requested` outbox events in `pending` with no claim or error.
- Manual `POST /api/jobs/ai-extraction` with the configured cron secret returned `200` and `{ processed: 6, failed: 0 }`.
- The six intake rows changed to `draft`, with `attempt_count = 1`, processing timestamps, and no error.
- The uploaded `lolosats-b74b9446.txt` intake completed but produced zero draft rows because its content is a professional profile summary rather than an explicit operational action list.

## Changes

The initial evidence phase added safe response headers for intake ID, intake status, and draft count. No business logic has been changed during the initial evidence phase.

## Conclusion

- H1 confirmed: a single reload can occur before asynchronous processing completes.
- H2 rejected for the observed uploads: the worker parsed and completed without provider or database failure.
- H3 not the primary cause: manual worker authorization succeeded.
- H4 rejected for the observed uploads: intake status and outbox events completed successfully.
- H5 confirmed: no scheduler configuration in the repository automatically invokes the worker endpoint.
