# Debug Health 503

Status: [OPEN]

## Symptom

`GET https://ops.kreasheet.com/api/health` returns HTTP 503 from PowerShell.

## Hypotheses

1. A required production environment variable is missing in Coolify.
2. The application cannot connect to Supabase or the health query fails.
3. The domain or reverse proxy routes to an unhealthy deployment.
4. Environment changes were made but the application was not redeployed.
5. The application is crash-looping or restarting after startup.

## Evidence

- Initial report: PowerShell `Invoke-WebRequest` received HTTP 503.
- Live request returned `503` with `Content-Type: application/json` and `Server: cloudflare`.
- Live response body was `{"status":"degraded","checks":{"env":"invalid","database":"not_checked"}}`.
- The application route generated the response, so the issue is not a Cloudflare-only routing failure.
- The database check was skipped because production environment validation failed first.

## Changes

- No business logic changed.

## Current Finding

Hypothesis 1 is confirmed: at least one required production environment variable is missing or invalid in the running Coolify container. Hypotheses 2 and 3 are not the current cause; database access was not attempted and the application route responded normally.
