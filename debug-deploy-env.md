# Debug Deploy Environment

Status: [OPEN]

## Symptom

Coolify deployments intermittently start without readable environment variables. A restart without code changes often makes the same deployment work.

## Hypotheses

1. Coolify secrets are configured on a different resource or deployment scope than the running container.
2. Next.js build-time and runtime environment variables are mixed.
3. The container or process starts before environment injection is complete, or an old image/container is reused.
4. Variable names, environment scope, or target environment do not match the names read by the application.
5. Application startup fails when variables are absent and succeeds after a later restart due to provisioning order.

## Evidence

- The provided Coolify log reaches `npm start` and starts Next.js 16.2.12 successfully.
- The log contains an npm warning about the deprecated `production` config; this is not an environment-read failure.
- The log contains a Supabase JS runtime warning recommending Node.js 22 or later; this is not evidence that an environment variable is missing.
- The displayed local address is redacted, so the actual bind/port cannot be verified from this excerpt.
- The excerpt does not include `npm run build`, `/api/health`, HTTP status, or the exact startup error from the failed deployment.
- The deployment reaches `npm run build`, completes dependency installation, and then starts the app.
- Coolify reports `New container is not healthy, rolling back to the old container` at deployment log lines 719-725.
- Dependency installation reports Node `v20.18.1` while several installed packages require Node 22 or newer, including Supabase packages, `file-type`, and `pdfjs-dist`.
- The direct build failure is not shown in the supplied excerpt; the actionable failure is the new container failing Coolify health validation.

## Changes

Changed `nixpacks.toml` to use `nodejs_22` instead of `nodejs_20`.
