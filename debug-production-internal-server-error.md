# Debug Production Internal Server Error

Status: [OPEN]

## Symptom

Production deployment completes successfully during build, but accessing the deployed application returns Internal Server Error.

## Hypotheses

1. Required production environment variables are missing or use different names from the variables read by the application.
2. Production Supabase configuration is invalid, incomplete, or cannot access the `acct_ctrl` schema.
3. A server-rendered path throws at runtime because a server-only environment variable is missing.
4. The deployment runtime command or platform configuration differs from the successful build configuration.
5. The error is caused by auth or redirect configuration rather than live integration-test variables.

## Evidence

Runtime logs and deployment configuration are still required to confirm or reject these hypotheses.
