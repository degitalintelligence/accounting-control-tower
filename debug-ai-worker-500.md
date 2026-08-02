# Debug Session: AI Worker 500

Status: [OPEN]
Session ID: ai-worker-500

## Symptom

`POST /api/jobs/ai-extraction` returns HTTP 500 with `Gagal menjalankan AI extraction worker.`.

## Hypotheses

1. Supabase service-role client cannot access or query the outbox queue.
2. A claimed outbox event fails during AI extraction or OpenRouter access.
3. The summary worker encounters a database schema, constraint, or payload error.
4. The request reaches the route but `CRON_SECRET` or environment configuration is inconsistent.

## Evidence

Pre-fix evidence is pending collection from the Next.js server output and queue state.

## Changes

No business logic has been changed during the bootstrap phase.
