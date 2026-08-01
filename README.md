# Accounting Operations Control Tower

Accounting Operations Control Tower adalah aplikasi Next.js untuk mengelola work item accounting dengan kontrol maker-checker-approver, checklist, evidence, reminder, audit trail, dan integrasi operasional.

## Menjalankan lokal

1. Salin `.env.local.example` menjadi `.env.local`.
2. Isi `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, dan `SUPABASE_SERVICE_ROLE_KEY` tanpa memasukkan secret ke repository.
3. Jalankan `npm install --legacy-peer-deps`.
4. Jalankan `npm run dev`.
5. Buka `http://localhost:3000`.

## Testing

- `npm test` menjalankan test reguler.
- `npm run test:integration` menjalankan live test hanya jika `RUN_LIVE_INTEGRATION=true` dan `LIVE_INTEGRATION_TARGET=staging`.
- Live integration membutuhkan credential `INTEGRATION_*` terpisah dan tidak boleh diarahkan ke production.

## Deployment

Deployment menggunakan Coolify dan `nixpacks.toml`. Environment production dijelaskan dalam [DEPLOYMENT.md](DEPLOYMENT.md). `INTEGRATION_*` hanya untuk staging integration test dan tidak diperlukan di production.
