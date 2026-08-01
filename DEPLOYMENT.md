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

## Local dan staging integration test

`.env.local` digunakan oleh aplikasi saat development. Salin `.env.local.example` menjadi `.env.local`, lalu isi credential lokal atau staging sesuai kebutuhan. Jangan menyalin secret ke file example dan jangan commit `.env.local`.

Live integration test memakai environment terpisah agar tidak salah menembak database aplikasi:

- `RUN_LIVE_INTEGRATION=true`
- `LIVE_INTEGRATION_TARGET=staging`
- `INTEGRATION_SUPABASE_URL`
- `INTEGRATION_SUPABASE_ANON_KEY`
- `INTEGRATION_SUPABASE_SERVICE_ROLE_KEY`
- `INTEGRATION_APP_URL`

Jalankan dengan `npm run test:integration` hanya terhadap project Supabase staging yang terisolasi. `LIVE_INTEGRATION_TARGET` wajib `staging`, dan test menolak `NODE_ENV=production`.

Environment `INTEGRATION_*` tidak diperlukan di production dan tidak boleh diisi dengan credential production.

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
