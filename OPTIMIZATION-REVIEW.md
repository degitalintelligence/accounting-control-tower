# Optimization Review

## Ringkasan

Review ini mencakup performa, UX, keamanan, reliability, authorization, middleware, rate limiting, API, database, background jobs, migration, dan validasi build pada Accounting Operations Control Tower.

Perubahan source-level yang aman telah diterapkan pada dashboard fetching, scoping client, parent-child grouping, authorization lookup, middleware authentication, rate limiting, dan endpoint statistik dashboard. Beberapa rekomendasi lain tidak dapat diterapkan secara bertanggung jawab tanpa akses atau bukti runtime, terutama migration database, distributed rate limiting, durable queue, rotasi credential, dan pengujian database live. Bagian tersebut ditandai secara eksplisit agar tidak dianggap sudah selesai.

**Kesimpulan saat ini:** aplikasi belum boleh disebut production-ready. Type-check, full lint, dan full unit test sekarang sudah lulus, tetapi production build masih gagal karena masalah build artifact emission pada Next.js 16 di environment Windows ini, dan validasi database live masih belum tersedia.

## Ruang lingkup dan batasan

- Stack yang direview: Next.js 16 App Router, React 19, TypeScript strict, Tailwind v4, Supabase Postgres, Vitest, dan Playwright.
- Schema aplikasi: `acct_ctrl`.
- Schema aplikasi lain pada database bersama tidak disentuh.
- Migration lama diperlakukan sebagai append-only history. Tidak ada migration lama yang dihapus, di-rename, atau diedit.
- Tidak ada secret, credential, PII, data finansial, organization ID, client ID, atau payload bisnis sensitif yang dicantumkan dalam dokumen ini.
- Supabase CLI tidak digunakan.

## Status implementasi

| Area | Temuan | Perubahan atau keputusan | Status |
|---|---|---|---|
| Dashboard fetching | Request lama dapat menimpa workspace baru | `AbortController`, cancellation, cleanup, dan stale-response protection | Selesai |
| Locale switching | Pergantian bahasa memicu refetch business data | Event bahasa tidak lagi memicu refetch data bisnis | Selesai |
| Client scoping | Filtering terjadi setelah pagination limit | Filter `client_id` diterapkan sebelum `.limit(250)` | Selesai |
| Parent-child grouping | Lookup berulang memakai `.some()` dan `.filter()` | Grouping satu kali dengan `Map` | Selesai |
| Dashboard stats | Agregasi di Node.js memuat terlalu banyak data | RPC database-side disiapkan sebagai candidate; runtime belum diverifikasi | Tertunda infrastruktur |
| Supabase errors | Error dapat tampil sebagai `{}` dan status terlalu umum | Normalisasi `{ message, code, hint, details }`, response generik, `503` untuk schema/cache error | Selesai |
| Authorization | Permission identik dapat di-query berulang dalam satu request | Request-local `WeakMap` cache berbasis `AuthContext` | Selesai |
| Middleware | Auth lookup tidak diperlukan pada sebagian route | Lookup dilewati pada callback/reset-password; login tetap diperiksa | Selesai |
| Rate limiting | Store tidak bounded dan input dapat invalid | Normalisasi input, pruning expired bucket, batas 10.000 bucket | Selesai dengan batasan |
| Typed Supabase schema | Query/RPC tertentu jatuh ke `never` dan `undefined` pada TypeScript | Definisi tabel, RPC, generic schema, dan relationship Supabase dilengkapi untuk `acct_ctrl`; mock security test diselaraskan ke `NextResponse` | Selesai |
| Dead-letter API | Response berpotensi membocorkan field private dan raw error | DTO publik, pagination contract, permission/org scoping, generic errors, dan regression test sudah diterapkan | Selesai source-level; runtime production belum tervalidasi |
| Migration registry | Registry dan filesystem tidak sama | History tidak diubah secara sembarangan; perlu rekonsiliasi terkontrol | Belum selesai |
| Background jobs | Process-local/background fire-and-forget tidak cukup durable | Rekomendasi durable queue dan retry policy | Belum diterapkan |
| Credential security | Credential sempat terlihat saat inspeksi lokal | Tidak dimasukkan ke output; rotasi harus dilakukan operator | Memerlukan tindakan eksternal |

## Temuan performa

### Dashboard request lifecycle

Hook dashboard sebelumnya tidak membatalkan request ketika workspace berubah. Akibatnya request lama dapat selesai setelah request baru dan menimpa state dengan data workspace yang salah. Perubahan sekarang menggunakan `AbortController`, meneruskan `signal` ke `fetch`, mengabaikan `AbortError`, dan mencegah stale response mengubah state terbaru.

Dampak yang diharapkan:

- Lebih sedikit pekerjaan jaringan dan parsing yang tidak diperlukan.
- Tidak ada data workspace lama yang tampil setelah perpindahan workspace.
- Loading state lebih konsisten saat pengguna berpindah konteks dengan cepat.

Pengukuran P95/P99 belum tersedia. Instrumentasi latency perlu ditambahkan sebelum klaim kuantitatif dibuat.

### Client-scoped pagination

Query sections sebelumnya berisiko membatasi hasil sebelum filter client diterapkan. Pada workspace client-scoped, row client lain dapat menghabiskan limit dan membuat hasil yang terlihat tidak lengkap.

Perubahan menerapkan:

```ts
if (!isOrgWide) {
  query = query.in("client_id", clientIds);
}

const result = await query.limit(250);
```

Filter sekarang berjalan di database sebelum pagination. Ini juga memperkecil risiko data tenant lain ikut terbaca oleh layer aplikasi.

### Parent-child grouping

Pengelompokan parent-child yang melakukan pencarian berulang melalui `.some()` dan `.filter()` diganti dengan `Map`. Child dikumpulkan satu kali berdasarkan `parent_id`, kemudian parent melakukan lookup langsung.

Perubahan menurunkan kerja CPU yang tidak perlu dan membuat kompleksitas lebih dekat ke linear terhadap jumlah row yang diproses.

### Pengurangan client-side work

Rekomendasi arsitektur jangka menengah tetap berlaku:

- Pindahkan bagian dashboard yang tidak interaktif ke Server Component.
- Gunakan Suspense dan streaming untuk blok yang independen.
- Lazy-load activity feed dan AI insights.
- Hindari mengirim data agregat mentah ke browser jika kartu statistik sudah cukup.
- Evaluasi penggabungan endpoint yang selalu dimuat bersamaan.

Rekomendasi ini belum seluruhnya diterapkan karena membutuhkan perubahan UX dan arsitektur halaman dashboard, bukan patch lokal yang aman tanpa regression test visual.

### Query work items dan pencarian

Endpoint work items menggunakan pola `ilike` dengan wildcard. Untuk dataset besar, evaluasi berikut diperlukan melalui query plan nyata:

- `pg_trgm` untuk pencarian substring.
- Full-text search untuk pencarian berbasis kata.
- Prefix search bila kebutuhan bisnis memungkinkan.
- Cursor pagination untuk menggantikan offset atau limit besar.
- Mengurangi penggunaan `count: "exact"` pada request yang tidak membutuhkan total akurat.

Tanpa `EXPLAIN (ANALYZE, BUFFERS)` pada database runtime, perubahan index tidak diterapkan agar tidak menambah beban atau konflik pada database bersama.

## Temuan UX dan usability

### Perpindahan workspace

Perubahan workspace sekarang lebih aman terhadap race condition. Bahasa UI dipisahkan dari reload business data sehingga perubahan locale tidak menyebabkan request dashboard yang tidak perlu.

### Error state dashboard

Endpoint stats sekarang mengembalikan pesan generik berbahasa Indonesia kepada client ketika RPC gagal, tidak memiliki row, atau schema/cache PostgREST belum siap. Detail database hanya diproses server-side dalam bentuk structured error.

### Rekomendasi UX yang belum memerlukan database

Perbaikan berikut masih perlu dikerjakan sebagai pekerjaan produk terpisah:

- Tampilkan skeleton per kartu, bukan satu loading state untuk seluruh dashboard.
- Tampilkan empty state yang membedakan “belum ada data” dari “gagal memuat”.
- Sediakan retry yang tidak menggandakan request lama.
- Tampilkan timestamp “terakhir diperbarui”.
- Pertahankan filter dan workspace saat navigasi kembali.
- Pastikan tabel dan dialog dapat digunakan pada viewport mobile.

Perubahan ini tidak dipaksakan dalam review ini karena memerlukan keputusan desain dan regression test komponen.

## Reliability dan error handling

### Dashboard stats API

`GET /api/dashboard/stats` sekarang:

- Menormalisasi unknown Supabase error menjadi `message`, `code`, `hint`, dan `details`.
- Mengembalikan `503` untuk `PGRST205` dan `PGRST106`, karena keduanya menunjukkan schema/cache/configuration belum siap.
- Mengembalikan `503` jika RPC berhasil tetapi tidak menghasilkan row.
- Menangani exception langsung dari RPC.
- Mengirim pesan generik kepada browser.
- Tidak mengirim detail internal database sebagai response.

Validasi lint terarah untuk file endpoint berhasil.

### Background jobs

Arsitektur yang dibutuhkan untuk reliability production:

- Durable queue.
- Job idempotent dan retryable.
- Exponential backoff.
- Dead-letter queue.
- Worker endpoint dengan `CRON_SECRET` atau proteksi setara.
- Supabase Cron hanya sebagai scheduler, bukan satu-satunya mekanisme reliability.
- Webhook mengirim acknowledgement di bawah lima detik.
- AI extraction dijalankan asynchronous setelah acknowledgement.

Durable queue belum diterapkan. Memasang queue provider membutuhkan keputusan infrastruktur, secret baru, observability, dan pengujian failure mode. Karena itu rekomendasi ini tidak diklaim selesai.

## Security dan authorization

### Authorization cache

Permission lookup sekarang memakai cache request-local:

```ts
const permissionCache =
  new WeakMap<AuthContext, Map<string, Promise<boolean>>>();
```

Cache tidak dibagikan lintas request dan promise yang gagal dihapus kembali. Pola ini mengurangi query duplikat tanpa menyimpan authorization state secara global.

### Middleware authentication

Route publik yang dipertahankan:

- `/login`
- `/auth/callback`
- `/reset-password`

Route bypass yang terdaftar untuk webhook, health check, dan job worker harus tetap memiliki validasi secret atau signature di route masing-masing. Middleware bypass bukan pengganti authorization.

Optimasi auth lookup yang diterapkan:

- Callback dan reset password tidak melakukan lookup session yang tidak diperlukan.
- Login tetap melakukan lookup agar user yang sudah authenticated dapat diarahkan dengan benar.
- Protected routes tetap menjalani auth lookup.
- Security headers tetap dipasang pada response middleware.

Verifikasi menyeluruh terhadap secret/signature setiap bypass route belum selesai dan harus dilakukan sebelum deployment publik.

### Rate limiting

Rate limiter process-local sekarang:

- Menolak konfigurasi limit/window yang bukan positive safe integer dengan fallback aman.
- Memangkas expired bucket.
- Membatasi store pada maksimal 10.000 bucket.
- Menyediakan header rate-limit pada response `429`.
- Membedakan kategori AI, webhook, job, dan mutation.

Batasan yang harus diterima:

- Counter tidak dibagi antar instance.
- Counter hilang ketika process restart.
- Tidak atomic lintas worker.
- Tidak cukup untuk enforcement global pada deployment multi-instance.

Distributed store seperti Redis atau Upstash belum dipasang karena memerlukan layanan dan credential eksternal.

### Dead-letter response sanitization

Validasi aktual pada endpoint dead-letter telah menyelaraskan kontrak GET menjadi `{ items, total, has_more }` dengan `count: "exact"`. DTO publik hanya mengembalikan `id`, `event_type`, `status`, `retry_count`, `last_retry_at`, `replayed_at`, dan `created_at`; `payload`, `error_message`, serta `last_error` tidak dipilih dan tidak dikirim ke client. Error GET/POST dan replay RPC dicatat server-side melalui `structuredSupabaseError`, sedangkan response client menggunakan pesan generik. Regression test menutup private fields, raw DB/RPC errors, batch exception, permission, dan organization scoping. Status: selesai berdasarkan test yang dijalankan di bawah; belum ada klaim validasi production/runtime.

### Credential rotation

Credential Supabase yang pernah terlihat saat inspeksi lokal tidak ditulis ke dokumen ini. Credential tersebut harus dirotasi oleh pemilik environment dan secret baru harus disimpan hanya pada secret manager atau `.env.local` yang tidak di-commit.

Rotasi tidak dapat dilakukan secara otomatis dari review ini tanpa tindakan operator dan akses pengelolaan credential.

## Database dan migration

### Candidate dashboard aggregation RPC

Candidate `085_dashboard_analytics_client_scope.sql` menyiapkan agregasi di PostgreSQL dengan karakteristik:

- Scope organization dan client di database.
- Explicit column selection.
- Explicit enum casts.
- `SECURITY DEFINER`.
- `SET search_path = acct_ctrl, pg_catalog`.
- Execution privilege hanya untuk `service_role`.

RPC ini dapat mengurangi row transfer dan CPU Node.js, tetapi belum diterapkan.

### Alasan migration belum dijalankan

Migration hanya boleh dijalankan melalui Supabase MCP atau Supabase Management API. Active MCP tidak berhasil diakses dan runtime migration history belum diketahui. Karena itu migration tidak diterapkan secara buta.

Sebelum penerapan, harus diverifikasi:

- Migration runtime yang sudah applied.
- Keberadaan overload `dashboard_analytics(UUID)` dan `dashboard_analytics(UUID, UUID[])`.
- Table dan column aktual.
- Enum values aktual.
- Function privileges.
- Empty dataset dan denominator zero.
- Null date behavior.
- Organization isolation dan client isolation.
- Kesetaraan hasil dengan query sebelumnya.

Tidak ada migration lama yang diubah untuk mengatasi masalah ini. Duplicate numeric prefix dipertahankan sebagai histori deployment.

### Migration registry mismatch

Full unit test menemukan registry migration mengharapkan beberapa filename yang tidak terbaca pada filesystem saat test, termasuk migration analytics, WhatsApp retirement, dan candidate analytics terbaru.

Rekonsiliasi sudah dilakukan untuk duplikat dashboard analytics: `030_dashboard_analytics_client_scope.sql` (versi non-cast enum, belum pernah di-apply) dihapus dari filesystem dan `MIGRATION_ORDER.md`; `085_dashboard_analytics_client_scope.sql` (kolom eksplisit + enum cast) dipertahankan sebagai satu-satunya definisi RPC. File lain dengan duplicate numeric prefix (mis. 045/048 WhatsApp retirement) tetap dipertahankan sebagai histori deployment tanpa di-edit. Test `migration-order` lulus (2/2).

## Validasi

Perintah dan hasil terakhir:

| Validasi | Hasil | Catatan |
|---|---|---|
| `npx tsc --noEmit` | Lulus | Typed Supabase schema, relationship, dan RPC definitions sudah cukup untuk source project saat ini |
| `npx eslint src/app/api/dashboard/stats/route.ts` | Lulus | Endpoint stats bersih dari error lint |
| `npm run lint` | Lulus dengan warning | 0 error dan 20 warning existing, dominan `react-hooks/exhaustive-deps` dan unused vars |
| `npm test` | Lulus | 33 file lulus, 113 test lulus |
| `npm run test:api` | Lulus | 6 test lulus |
| `npm run test:integration` | Blocked | Guard live integration tetap menuntut staging dan credential eksplisit |
| `npm run test:e2e` | Belum dijalankan ulang | Fokus validasi kali ini pada source, type-check, unit test, dan production build |
| `npm run build` | Gagal | `next build` default (Turbopack) gagal dengan error internal penulisan artefak `.next`; `next build --webpack` juga gagal pada fase `Collecting page data` dengan `ENOENT` artefak route yang berubah-ubah antar-run |

### Lint warning yang tersisa

Warning project-wide yang masih ada:

- `reset-password/page.tsx`: dependency `useEffect`.
- `meetings/page.tsx`: unused vars dan dependency `useEffect`.
- beberapa halaman settings: dependency `useEffect`.
- `review-assist/route.ts`, `organization/route.ts`, `wa-webhook/route.ts`, `recurrence/rules.ts`, `supabase/server.ts`, `whatsapp/adapter.ts`: unused vars/imports.

Warning ini belum memblokir lint karena `npm run lint` sudah exit `0`, tetapi tetap perlu dibereskan sebelum deployment dianggap bersih.

### Unit test yang sudah diperbaiki

Failure yang sebelumnya tercatat pada `tests/migration-order.test.ts` dan `tests/admin-security.test.ts` sudah diperbaiki tanpa menghapus, me-rename, atau mengedit migration lama. Validasi terbaru menunjukkan seluruh unit test lulus: 33 test file dan 113 test.

### Build failure

Masalah build telah bergeser dari error TypeScript generated validator lama ke failure artifact emission/build pipeline:

- `npm run build` dengan default `next build` (Turbopack) gagal secara internal ketika membuat artefak `.next/build/chunks` pada Windows, walau source code sudah lolos kompilasi TypeScript.
- `npx next build --webpack` lolos kompilasi dan TypeScript, tetapi gagal di fase `Collecting page data` dengan `ENOENT` pada artefak route server yang berubah antar-run, misalnya `/api/templates/[id]/versions` lalu `/api/settings/notifications`.
- Karena route yang gagal berubah dan artefaknya terlihat ada setelah proses berhenti, indikasinya lebih dekat ke race/flaky emission problem di toolchain build daripada bug deterministik pada satu route source tertentu.

Build production karenanya masih dinyatakan gagal dan tetap menjadi blocker utama.

## Rekomendasi yang aman untuk tahap berikutnya

Rekomendasi berikut adalah pekerjaan lanjutan yang masih diperlukan, bukan klaim bahwa semuanya sudah selesai:

1. Rekonsiliasi migration registry dengan filesystem tanpa mengubah histori applied; source-level test sudah lulus, tetapi runtime history tetap harus dibaca.
2. Tambahkan test khusus dashboard stats untuk error `PGRST205`, `PGRST106`, no-row, exception, empty dataset, dan scope client.
3. Verifikasi seluruh bypass route dengan secret/signature test.
4. Isolasi failure build Next.js 16 pada Windows: cek kemungkinan race artefak `.next`, pertimbangkan upgrade patch Next.js, validasi path dengan spasi, dan uji build di environment CI/Linux sebagai pembanding.
5. Migrasikan `middleware.ts` ke `proxy.ts` sesuai konvensi Next.js 16 untuk menghilangkan warning deprecation dan mengurangi kemungkinan edge-build oddities.
6. Bersihkan 20 warning lint secara bertahap.
7. Aktifkan integration test live hanya setelah credential dan environment staging siap.
8. Verifikasi runtime RPC melalui jalur Supabase yang diizinkan sebelum migration diterapkan.
9. Ukur P95/P99 dashboard sebelum dan sesudah database aggregation.
10. Pilih shared rate-limit store untuk deployment multi-instance.
11. Pilih durable queue dan tetapkan retry/dead-letter policy.
12. Rotasi credential yang pernah terekspos.

## Keputusan deployment

Deployment production ditahan sampai setidaknya kondisi berikut terpenuhi:

- Full type-check lulus.
- Full lint tidak memiliki error.
- Full unit test lulus.
- Build production lulus dari clean generated directory.
- E2E selesai dengan exit code sukses.
- Live Supabase integration test lulus atau memiliki bukti pengganti yang setara.
- Runtime migration dan RPC privilege diverifikasi.
- Dead-letter response tidak membocorkan detail internal.
- Semua bypass route tervalidasi dengan secret/signature.
- Credential dirotasi dan deployment menggunakan secret baru.
- Rate limiting dan background job reliability memiliki desain yang sesuai jumlah instance production.

## Penutup

Optimasi yang aman pada level source sudah dilakukan dan memperbaiki race condition dashboard, client scoping, grouping, duplicate permission lookup, middleware overhead, rate limiter memory safety, serta error handling endpoint stats. Temuan yang membutuhkan database runtime, layanan infrastruktur, credential rotation, atau perubahan kontrak API sengaja tidak dipaksakan karena bukti validasinya belum tersedia.

Dokumen ini menjadi catatan kondisi aktual, bukan pernyataan bahwa seluruh gate production telah lulus.
