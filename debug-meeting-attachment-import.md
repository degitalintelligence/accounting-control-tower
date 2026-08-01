# Debug Meeting Attachment Import

Status: [RESOLVED]

## Symptoms

- `/api/meetings/[id]/attachments` returns 500.
- Next.js reports `Module not found: Can't resolve '@/lib/env'`.
- Meeting detail receives HTML error output, causing `Response.json()` to fail.

## Hypotheses

1. The imported `@/lib/env` module does not exist.
2. The compile failure causes the attachment response to be HTML instead of JSON.
3. Meeting detail and action-item endpoints are healthy because both return 200.
4. After the import fix, Storage configuration or attachment columns may expose a secondary runtime error.

## Evidence

- Terminal evidence shows the missing module at `attachments/route.ts:3`.
- `GET /api/meetings/[id]` returns 200.
- `GET /api/meetings/[id]/action-items` returns 200.
- Browser error `Unexpected token '<'` is consistent with parsing a Next.js HTML error page as JSON.

## Root Cause

The attachment routes imported `getRequiredServerEnv` from `@/lib/env`, but the project defines it in `@/lib/server-env`.

## Fix

Both attachment routes now import the existing server environment helper from `@/lib/server-env`. The detail and action-item endpoints were already returning 200, so their behavior was not changed.

## Verification

- Type diagnostics are clean for both attachment routes.
- `npm run lint` exits successfully.
- The remaining lint output is one pre-existing warning in planned leaves.

## Follow-up Evidence

The requested attachment ID belongs to the earlier attachment format, which stored extracted text but had no `storage_path`. The download route therefore returned 404.

## Compatibility Fix

When `storage_path` exists, the route still redirects to a short-lived signed Storage URL. When it is absent, the route now returns the safely stored extracted text with a sanitized filename, so legacy attachments remain openable.
