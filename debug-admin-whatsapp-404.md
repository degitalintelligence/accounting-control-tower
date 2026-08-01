# Debug Session: Admin WhatsApp 404

Status: [OPEN]
Session: admin-whatsapp-404
Symptom: POST /api/admin/whatsapp returns 404 while GET /api/auth/me returns 200.

## Hypotheses

1. The development server is using a stale build and has not loaded the route.
2. The route is not detected because of an invalid route path or route compilation issue.
3. The browser is sending the request to a different origin or application instance.
4. Middleware or proxy rewrites the POST path before it reaches the route.
5. The deployed application does not contain the latest source changes.

## Evidence

- User-provided terminal output shows `POST /api/admin/whatsapp 404`.
- The same output shows `GET /api/auth/me 200`, so the application server is reachable.
- Source contains `src/app/api/admin/whatsapp/route.ts` with an exported POST handler.

## Changes

No business logic changes.
