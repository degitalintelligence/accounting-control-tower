# Debug Live Supabase URL

Status: COMPLETE

## Hipotesis

- Helper live test membaca nama env yang berbeda dari convention project.
- Nilai URL kosong atau tidak ter-load dari `.env.local`.
- Nilai URL bukan absolute HTTPS URL yang valid.
- Test integration live tidak memiliki guard mode yang memadai.
- Error konfigurasi dapat membocorkan nilai env.

## Observasi Awal

- Gejala: live integration test gagal dengan `Invalid supabaseUrl`.
- Target: validasi URL fail-fast dengan pesan aman dan verifikasi non-live.

## Bukti

- Helper live memakai `INTEGRATION_SUPABASE_URL`, bukan `NEXT_PUBLIC_SUPABASE_URL` dari `.env.local`.
- Saat live tidak aktif, suite tidak memanggil `config()` dan seluruh test live di-skip.
- Validasi URL kini berjalan sebelum `createClient`, menerima HTTPS untuk Supabase, dan menerima HTTP/HTTPS untuk app URL.
- Pesan error hanya menyebut nama env dan format yang diwajibkan; nilai env tidak pernah dimasukkan ke pesan atau log.
- Debug server tidak dapat dijalankan karena Python tidak tersedia pada environment Windows ini; tidak ada log runtime yang dibuat.

## Kesimpulan

Root cause yang dapat dipastikan dari helper: konfigurasi live memiliki namespace env terpisah dan URL sebelumnya diteruskan langsung ke Supabase client tanpa validasi format. `.env.local` aplikasi tidak menjadi sumber otomatis untuk live test. Isi `INTEGRATION_SUPABASE_URL`, `INTEGRATION_SUPABASE_ANON_KEY`, `INTEGRATION_SUPABASE_SERVICE_ROLE_KEY`, `INTEGRATION_APP_URL`, `RUN_LIVE_INTEGRATION=true`, serta `LIVE_INTEGRATION_TARGET=staging` secara eksplisit untuk menjalankan live test.
