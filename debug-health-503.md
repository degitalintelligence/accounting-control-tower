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

## Changes

- No business logic changed.
