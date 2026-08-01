# Deployment Coolify

## Build dan start

Project memakai `nixpacks.toml` untuk memasang Node.js 20, menjalankan `npm ci --legacy-peer-deps`, membangun aplikasi, lalu menjalankan `npm start -- --hostname 0.0.0.0`.

Set health check Coolify ke `GET /api/health`. Endpoint ini tidak memakai session login, tidak di-cache, memvalidasi environment production, dan melakukan query database ringan. Status `200` berarti environment dan database siap; status `503` berarti deployment belum siap.

## Environment wajib

Isi di Coolify sebagai secret atau environment variable server:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_STORAGE_BUCKET`
- `NEXT_PUBLIC_APP_URL`
- `CRON_SECRET`

`CRON_SECRET` harus berupa secret acak dan dikirim scheduler dengan header `Authorization: Bearer <CRON_SECRET>`. Jangan masukkan nilainya ke repository, URL, atau log.

## Scheduled jobs

Semua endpoint berikut menerima `POST` dan wajib memakai header authorization tersebut:

- `/api/jobs/ai-extraction`
- `/api/jobs/escalation-check`
- `/api/jobs/notifications`
- `/api/jobs/recurrence`
- `/api/jobs/reminders`
- `/api/jobs/whatsapp-retention`

Scheduler harus menganggap response non-2xx sebagai kegagalan dan melakukan retry sesuai kebijakan durable queue. Endpoint job bersifat server-only dan menggunakan service role setelah secret tervalidasi.

## Keamanan deployment

`next.config.ts` memasang CSP, HSTS, anti-clickjacking, `nosniff`, Referrer-Policy, Permissions-Policy, dan menonaktifkan header `X-Powered-By`. TLS harus terminasi di proxy Coolify dengan redirect HTTP ke HTTPS.
