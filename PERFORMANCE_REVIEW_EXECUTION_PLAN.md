# Performance Review & Execution Plan

Dokumen ini merangkum seluruh temuan review performa dan kualitas UX untuk aplikasi **Accounting Operations Control Tower**, lalu mengubah semua rekomendasi menjadi pekerjaan yang **harus dieksekusi**.

Tujuan dokumen ini:

- Menyatukan semua temuan dalam satu tempat.
- Mengubah rekomendasi menjadi backlog implementasi yang konkret.
- Menentukan urutan eksekusi berdasarkan dampak dan risiko.
- Menyediakan kriteria selesai dan cara verifikasi untuk tiap item.

## Ringkasan Eksekutif

Masalah performa utama aplikasi ini bukan berasal dari satu file atau satu dependency, tetapi dari kombinasi beberapa pola yang terjadi berulang:

- Auth dicek berlapis di middleware, layout server, API route, dan client.
- Dashboard masih memakai pola client-side fan-out ke banyak endpoint internal.
- Beberapa API melakukan over-fetch lalu filter di app server, bukan di database.
- Endpoint list terlalu berat untuk dipakai juga sebagai autocomplete/search.
- Shell global memuat data dan komponen berat terlalu dini.
- Beberapa interaksi UI memicu request terlalu sering, termasuk per karakter.
- Monitoring performa belum cukup matang sehingga bottleneck masih sulit diukur secara objektif.

## Prinsip Eksekusi

Semua rekomendasi di bawah harus dianggap sebagai action item implementasi.

- Tidak ada item yang bersifat opsional.
- Semua item harus menghasilkan perubahan kode, konfigurasi, atau observability yang bisa diverifikasi.
- Setiap item wajib selesai dengan bukti verifikasi.
- Jika implementasi sebuah item memerlukan pemecahan menjadi beberapa PR, urutannya harus tetap mengikuti prioritas dokumen ini.

## Prioritas Utama

Urutan eksekusi yang direkomendasikan:

1. Hilangkan duplikasi auth dan bootstrap user yang berulang.
2. Ubah dashboard menjadi server-first atau agregasi tunggal.
3. Ringankan endpoint `work-items` untuk list dan search.
4. Kurangi request yang dipicu terlalu sering dari UI.
5. Lazy-load data dan komponen global yang tidak perlu dimuat sejak awal.
6. Rapikan middleware sesuai Next.js 16.
7. Tambahkan monitoring performa dan error tracking.

## Temuan dan Backlog Eksekusi

### 1. Auth Berlapis di Banyak Lapisan

**Temuan**

- `src/middleware.ts` melakukan `supabase.auth.getUser()` pada hampir semua request.
- `src/app/(dashboard)/layout.tsx` kembali memeriksa user dan authorization context.
- `src/lib/authorization.ts` kembali memuat user, membership, organization, dan locale.
- `src/hooks/use-auth.ts` memanggil `/api/auth/me` setelah hydrasi.
- `src/components/layout/app-shell.tsx` menyembunyikan seluruh UI saat auth store belum siap.

**Dampak**

- Menambah latency pada navigasi dan request API.
- Menambah jumlah query ke Supabase per interaksi.
- Meningkatkan risiko blank state saat initial load dashboard.

**Eksekusi**

- Jadikan server layout dashboard sebagai sumber utama auth state untuk halaman dashboard.
- Hapus kebutuhan fetch `/api/auth/me` saat mount jika data user, organisasi, dan locale sudah bisa di-hydrate dari server.
- Ubah `DashboardLayoutClient` agar menerima initial auth payload dari server.
- Ubah `AppShell` agar tidak `return null` penuh saat state client belum siap; gunakan shell skeleton atau server-provided state.
- Audit semua API route yang memanggil auth lebih dari sekali dalam satu request path, lalu konsolidasikan agar hanya memakai satu context per request.

**Target File**

- `src/middleware.ts`
- `src/app/(dashboard)/layout.tsx`
- `src/app/(dashboard)/dashboard-layout-client.tsx`
- `src/hooks/use-auth.ts`
- `src/components/layout/app-shell.tsx`
- `src/lib/authorization.ts`
- `src/app/api/auth/me/route.ts`

**Definition of Done**

- Dashboard tidak lagi memerlukan bootstrap auth tambahan dari client untuk render awal.
- `AppShell` tidak lagi blank saat loading auth.
- Jumlah auth lookup per navigasi dashboard berkurang signifikan.

**Verifikasi**

- Buka dashboard dengan cache kosong dan pastikan UI langsung muncul tanpa blank screen.
- Audit network tab dan pastikan request `/api/auth/me` tidak lagi menjadi syarat render dashboard.
- Pastikan login, logout, workspace switch, dan redirect unauthorized tetap bekerja benar.

### 2. Middleware Terlalu Lebar dan Sudah Deprecated di Next 16

**Temuan**

- Build menunjukkan warning bahwa konvensi `middleware` sudah deprecated dan perlu pindah ke `proxy`.
- Matcher middleware masih sangat lebar dan membungkus hampir semua request.

**Dampak**

- Menambah overhead runtime pada banyak request yang sebenarnya tidak butuh auth refresh.
- Menambah debt teknis terhadap versi Next.js yang sedang dipakai.

**Eksekusi**

- Review ulang semua route yang benar-benar membutuhkan proteksi global di edge/proxy.
- Pindahkan implementasi `middleware` ke pola `proxy` yang direkomendasikan Next.js 16.
- Persempit matcher agar hanya mengenai route yang relevan.
- Pastikan bypass route untuk webhook, job endpoint, static asset, dan route publik tetap aman.
- Ukur ulang request yang lewat proxy setelah refactor.

**Target File**

- `src/middleware.ts`
- Dokumentasi Next.js 16 terkait `proxy`

**Definition of Done**

- Warning deprecated tidak muncul lagi pada build.
- Scope proxy lebih sempit dan sesuai kebutuhan nyata aplikasi.

**Verifikasi**

- Jalankan `npm run build` dan pastikan warning deprecation hilang.
- Uji route publik, login, dashboard, webhook, dan job endpoint.

### 3. Dashboard Masih Client-Side Fan-Out

**Temuan**

- `src/hooks/use-dashboard.ts` memanggil 5 endpoint sekaligus dari browser.
- Setiap endpoint dashboard tetap membangun authorization context sendiri.
- `src/app/(dashboard)/dashboard/page.tsx` masih bergantung pada loading client untuk data utama.

**Dampak**

- Time-to-data menjadi lambat.
- Dashboard terasa berat walaupun server sebenarnya bisa menyiapkan data lebih awal.
- Beban query dan serialisasi meningkat.

**Eksekusi**

- Refactor dashboard menjadi server-first.
- Pilih salah satu dari dua pendekatan ini dan eksekusi penuh:
  - Server Component yang mengambil seluruh data dashboard di server.
  - Endpoint agregat tunggal seperti `/api/dashboard/overview` yang menggabungkan stats, KPI, sections, deadlines, dan activity.
- Pindahkan logika agregasi dashboard dari hook client ke server.
- Simpan hook client hanya untuk refresh manual atau interaksi sekunder, bukan initial load.
- Pastikan error handling tetap granular walau data diagregasi.

**Target File**

- `src/hooks/use-dashboard.ts`
- `src/app/(dashboard)/dashboard/page.tsx`
- `src/app/api/dashboard/stats/route.ts`
- `src/app/api/dashboard/kpis/route.ts`
- `src/app/api/dashboard/upcoming-deadlines/route.ts`
- `src/app/api/dashboard/activity-feed/route.ts`
- `src/app/api/dashboard/sections/route.ts`

**Definition of Done**

- Initial load dashboard tidak lagi membutuhkan 5 fetch paralel dari browser.
- Dashboard tetap menampilkan data utama pada render awal.

**Verifikasi**

- Periksa network tab dan pastikan fan-out request dashboard berkurang drastis.
- Ukur waktu render awal sebelum dan sesudah perubahan.

### 4. Query Dashboard Melakukan Over-Fetch dan Filter di App Server

**Temuan**

- `src/app/api/dashboard/sections/route.ts` mengambil hingga 250 item dengan nested assignments lalu baru memfilter `clientIds`.
- `src/app/api/dashboard/activity-feed/route.ts` mengambil audit log besar lebih dulu lalu menyaring visibilitas dengan lookup tambahan.
- `src/app/api/dashboard/stats/route.ts` menjalankan banyak count query terpisah dan menghitung `on_time_rate` di app layer.

**Dampak**

- Query lebih mahal dari yang seharusnya.
- Payload membengkak.
- CPU server terpakai untuk pekerjaan yang lebih tepat dilakukan di SQL.

**Eksekusi**

- Pindahkan filter client scope ke query database pada semua endpoint dashboard.
- Ganti pola “fetch besar lalu filter” menjadi “query scoped sejak awal”.
- Evaluasi pembuatan RPC atau query agregat SQL untuk:
  - dashboard stats
  - on-time rate
  - section summary
  - activity feed visibility
- Pastikan semua query hanya mengambil kolom yang benar-benar diperlukan.

**Target File**

- `src/app/api/dashboard/stats/route.ts`
- `src/app/api/dashboard/sections/route.ts`
- `src/app/api/dashboard/activity-feed/route.ts`
- `supabase/migrations/`

**Definition of Done**

- Tidak ada lagi filter client scope utama yang dilakukan setelah data besar ditarik ke Node.
- Count dan rate utama dashboard dihitung di database atau lewat agregasi yang jauh lebih efisien.

**Verifikasi**

- Bandingkan jumlah query, ukuran payload, dan waktu respons endpoint sebelum-sesudah.
- Uji untuk user org-wide dan user client-scoped.

### 5. Endpoint `work-items` Terlalu Berat untuk List Biasa dan Search

**Temuan**

- `src/app/api/work-items/route.ts` selalu join assignments detail.
- Endpoint selalu meminta `count: "exact"`.
- Endpoint yang sama dipakai juga oleh dependency autocomplete.

**Dampak**

- List work items lebih lambat dari perlu.
- Search/autocomplete menjadi mahal dan tidak proporsional.

**Eksekusi**

- Pecah endpoint atau mode query menjadi minimal tiga bentuk:
  - list ringan
  - search/autocomplete ringan
  - detail/expanded
- Untuk autocomplete, kembalikan hanya field minimum seperti `id`, `title`, `status`, `due_at`.
- Hindari exact count untuk use case yang tidak membutuhkannya.
- Jadikan join assignments bersifat opt-in, bukan default.
- Tambahkan parameter eksplisit seperti `view=summary` atau endpoint terpisah yang lebih jelas.

**Target File**

- `src/app/api/work-items/route.ts`
- `src/components/work-items/dependency-panel.tsx`
- `src/hooks/use-work-items.ts`

**Definition of Done**

- Search/autocomplete tidak lagi memanggil query berat yang sama dengan halaman list.
- List default work items memuat payload lebih ringan.

**Verifikasi**

- Uji pencarian dependency dan pastikan request lebih kecil dan lebih cepat.
- Uji pagination work items dan pastikan total data tetap benar untuk list utama.

### 6. Search dan Filter Memicu Request Terlalu Sering

**Temuan**

- `src/components/work-items/work-item-filters.tsx` melakukan `router.push()` pada setiap perubahan input search.
- `src/hooks/use-work-items.ts` langsung fetch saat filter berubah.

**Dampak**

- UX terasa berat saat mengetik.
- Router, fetch, dan render terpanggil berulang kali.

**Eksekusi**

- Tambahkan debounce untuk input search minimal 300-500ms.
- Pisahkan state input lokal dari state URL.
- Sinkronkan URL hanya setelah debounce selesai atau saat submit.
- Gunakan transisi yang ramah App Router jika diperlukan.

**Target File**

- `src/components/work-items/work-item-filters.tsx`
- `src/hooks/use-work-items.ts`
- `src/app/(dashboard)/work-items/page.tsx`

**Definition of Done**

- Mengetik di search tidak lagi memicu navigasi setiap karakter.
- Filter tetap shareable lewat URL, tetapi lebih efisien.

**Verifikasi**

- Ketik cepat di search box dan pastikan request hanya terkirim setelah jeda.
- Pastikan reload halaman tetap mempertahankan filter.

### 7. Checklist Menyimpan Data Per Karakter

**Temuan**

- `src/components/work-items/checklist-panel.tsx` memanggil save langsung dari `onChange` untuk input teks, URL, dan number.

**Dampak**

- Request berlebihan.
- Risiko race condition dan state tidak konsisten.
- Input terasa tersendat.

**Eksekusi**

- Ubah perilaku save menjadi salah satu pola berikut dan implementasikan penuh:
  - save on blur
  - save dengan tombol eksplisit
  - autosave debounce
- Simpan state input secara lokal dulu.
- Tampilkan status `dirty`, `saving`, dan `saved` yang jelas.
- Hindari reload penuh checklist setelah setiap save jika cukup update state lokal.

**Target File**

- `src/components/work-items/checklist-panel.tsx`
- `src/app/api/work-items/[id]/checklist/route.ts`

**Definition of Done**

- Mengetik di field checklist tidak lagi menghasilkan request per karakter.
- UX penyimpanan terasa stabil dan jelas.

**Verifikasi**

- Isi field checklist panjang dan amati jumlah request.
- Pastikan tidak ada kehilangan data saat berpindah fokus.

### 8. Komponen Global Memuat Data Terlalu Dini

**Temuan**

- `src/hooks/use-notifications.ts` selalu fetch notifikasi saat mount.
- `src/components/work-items/create-work-item-dialog.tsx` selalu fetch checklist templates walau dialog belum dibuka.
- `src/components/layout/app-shell.tsx` selalu memuat command palette dan contextual help.

**Dampak**

- Menambah biaya awal di hampir semua halaman dashboard.
- Memperbesar bundle dan network activity tanpa interaksi user.

**Eksekusi**

- Fetch notifikasi hanya saat dropdown dibuka pertama kali, lalu cache hasilnya.
- Fetch checklist templates hanya saat dialog create work item dibuka.
- Evaluasi lazy import untuk command palette dan contextual help.
- Pastikan komponen global yang jarang dipakai tidak menjadi bagian dari critical path.

**Target File**

- `src/hooks/use-notifications.ts`
- `src/components/layout/notification-bell.tsx`
- `src/app/api/notifications/route.ts`
- `src/components/work-items/create-work-item-dialog.tsx`
- `src/components/layout/app-shell.tsx`

**Definition of Done**

- Initial load halaman dashboard tidak lagi memicu request notifikasi dan template checklist tanpa interaksi.
- Komponen global yang berat tidak ikut bundle awal jika belum diperlukan.

**Verifikasi**

- Muat halaman dashboard dan cek network tab.
- Buka notification dropdown dan create dialog untuk memastikan lazy fetch tetap berfungsi.

### 9. Notification Endpoint Masih Boros Query

**Temuan**

- `src/app/api/notifications/route.ts` mengambil list notifikasi dan unread count dengan dua query terpisah.

**Dampak**

- Menambah biaya untuk komponen yang sebenarnya global dan sering muncul.

**Eksekusi**

- Gabungkan strategi pengambilan data notifikasi agar lebih hemat.
- Pertimbangkan salah satu:
  - unread count dikirim bersama hasil query utama bila memungkinkan
  - unread count di-cache pendek
  - unread count diambil hanya saat dropdown dibuka
- Hindari exact count bila tidak dipakai untuk UI saat ini.

**Target File**

- `src/app/api/notifications/route.ts`
- `src/hooks/use-notifications.ts`

**Definition of Done**

- Jumlah query notifikasi per interaksi berkurang.

**Verifikasi**

- Buka dropdown notifikasi dan bandingkan jumlah request/query sebelum-sesudah.

### 10. Halaman Detail Work Item Terlalu Berat Sebagai Satu Client Page

**Temuan**

- Halaman detail work item membawa banyak panel besar yang aktif dalam satu halaman client.
- Beberapa panel melakukan fetch sendiri-sendiri.

**Dampak**

- Bundle awal membesar.
- Mount cost tinggi.
- Respons tab/interaksi terasa berat.

**Eksekusi**

- Pecah panel berat menjadi dynamic import atau tab lazy mount.
- Muat data panel hanya saat panel dibuka atau terlihat.
- Pastikan data inti work item tetap tersedia di render awal.
- Pisahkan data detail dari data periferal.

**Target File**

- `src/app/(dashboard)/work-items/[id]/page.tsx`
- `src/components/work-items/checklist-panel.tsx`
- `src/components/work-items/evidence-panel.tsx`
- `src/components/work-items/review-panel.tsx`
- `src/components/work-items/comment-section.tsx`
- `src/components/work-items/dependency-panel.tsx`

**Definition of Done**

- Halaman detail terasa lebih ringan saat pertama dibuka.
- Panel sekunder tidak lagi memicu fetch sebelum diperlukan.

**Verifikasi**

- Ukur jumlah request dan waktu interaktif saat membuka detail work item.
- Pastikan semua panel tetap bekerja saat dibuka.

### 11. Board View Melakukan Perhitungan Berulang Saat Render

**Temuan**

- `src/components/work-items/work-item-view.tsx` berulang kali menjalankan `items.filter(...)` untuk setiap status.

**Dampak**

- Tidak kritikal saat data kecil, tetapi akan melambat pada list besar.

**Eksekusi**

- Pre-group item berdasarkan status sekali saja sebelum render.
- Gunakan struktur map atau memoization yang jelas.
- Pastikan perhitungan jumlah item per status tidak mengulang filter yang sama.

**Target File**

- `src/components/work-items/work-item-view.tsx`

**Definition of Done**

- Render board tidak lagi melakukan filter penuh berulang per kolom.

**Verifikasi**

- Uji dengan dataset besar dan bandingkan kelancaran render.

### 12. Dependency Search Masih Memakai Endpoint Generik

**Temuan**

- `src/components/work-items/dependency-panel.tsx` mencari kandidat dependency lewat endpoint `work-items` generik.

**Dampak**

- Search menjadi mahal.
- Coupling tinggi antara use case dependency dan list utama.

**Eksekusi**

- Buat jalur pencarian khusus untuk candidate dependency.
- Pastikan hasil pencarian mengecualikan item saat ini, dependency yang sudah ada, dan hanya mengambil field minimum.
- Tambahkan guard untuk menghindari request jika query terlalu pendek.

**Target File**

- `src/components/work-items/dependency-panel.tsx`
- `src/app/api/work-items/route.ts` atau endpoint baru khusus search

**Definition of Done**

- Dependency search memakai query ringan dan terisolasi.

**Verifikasi**

- Uji pencarian dependency pada item dengan banyak relasi.

### 13. Dependency Berat di Jalur Runtime Umum

**Temuan**

- `officeparser` ada di dependency utama dan terlihat dipakai terbatas.

**Dampak**

- Bisa menambah cold start, install time, dan build burden.

**Eksekusi**

- Audit apakah `officeparser` benar-benar harus berada di jalur runtime utama.
- Jika hanya dipakai di worker atau jalur tertentu, isolasikan import secara lazy/dynamic.
- Evaluasi alternatif yang lebih ringan bila ada.

**Target File**

- `package.json`
- `src/lib/ai/file-parser.ts`
- File worker atau route yang memakai parser dokumen

**Definition of Done**

- Dependency parser tidak lagi ikut memengaruhi jalur runtime yang tidak membutuhkannya.

**Verifikasi**

- Bandingkan build output, cold start lokal, dan bundle server setelah isolasi.

### 14. Monitoring dan Performance Visibility Belum Memadai

**Temuan**

- Belum terlihat instrumentation yang memadai untuk web vitals, p95 endpoint, atau error tracking.
- `DEVELOPMENT_PLAN.md` juga masih menandai monitoring sebagai item yang belum selesai.

**Dampak**

- Sulit membuktikan peningkatan performa.
- Sulit mengetahui bottleneck baru setelah refactor.

**Eksekusi**

- Tambahkan monitoring error tracking.
- Tambahkan pengukuran performa minimal untuk:
  - dashboard load
  - work items list
  - work item detail
  - notification endpoint
- Tambahkan logging durasi endpoint di server untuk route utama.
- Jika memungkinkan, track p50/p95 untuk route API kritikal.

**Target File**

- Dokumentasi observability project
- Route API utama
- Konfigurasi monitoring yang dipilih
- `DEVELOPMENT_PLAN.md`

**Definition of Done**

- Ada sistem yang menangkap error dan metrik performa utama.
- Peningkatan sebelum-sesudah bisa diukur.

**Verifikasi**

- Buat satu error uji di environment dev/staging dan pastikan terlapor.
- Pastikan durasi endpoint utama terekam.

## Rencana Eksekusi Bertahap

### Fase 1 - Quick Wins Wajib

- Refactor bootstrap auth dashboard.
- Hapus blank shell saat loading auth.
- Debounce search/filter work items.
- Ubah checklist save agar tidak per karakter.
- Lazy fetch notifications.
- Lazy fetch checklist templates.
- Optimasi ringan board grouping.

### Fase 2 - Perubahan Struktural Wajib

- Konsolidasi dashboard menjadi server-first atau agregasi tunggal.
- Ringankan endpoint `work-items`.
- Pisahkan search/autocomplete dari list utama.
- Pindahkan filter client scope ke query database.
- Lazy-load panel berat work item detail.

### Fase 3 - Platform Hardening Wajib

- Migrasi `middleware` ke `proxy`.
- Audit dependency berat seperti `officeparser`.
- Pasang monitoring performa dan error tracking.

## Checklist Eksekusi

- [ ] Auth dashboard tidak lagi di-bootstrap ulang dari client.
- [ ] `AppShell` tidak blank saat loading auth.
- [ ] `middleware` sudah dimigrasi ke `proxy`.
- [ ] Dashboard initial load tidak lagi memakai 5 fetch paralel dari browser.
- [ ] Query dashboard tidak lagi over-fetch lalu filter di app server.
- [ ] `work-items` list dipisah dari search/autocomplete ringan.
- [ ] Search work items sudah debounce.
- [ ] Checklist tidak lagi save per karakter.
- [ ] Notifications hanya di-fetch saat diperlukan.
- [ ] Checklist templates hanya di-fetch saat dialog dibuka.
- [ ] Panel berat work item detail dimuat secara lazy.
- [ ] Board view tidak lagi menghitung filter berulang.
- [ ] Dependency search memakai jalur ringan khusus.
- [ ] Dependency berat diisolasi dari jalur runtime umum.
- [ ] Monitoring error dan performa sudah aktif.

## Kriteria Sukses Global

Dokumen ini dianggap tereksekusi dengan baik bila:

- Dashboard terasa lebih cepat pada first load dan refresh.
- Navigasi dashboard tidak memunculkan blank state auth.
- Search work item dan dependency terasa responsif.
- Request count pada halaman utama turun nyata.
- Query berat berpindah dari app layer ke database atau agregasi yang lebih efisien.
- Komponen global tidak lagi membebani initial load.
- Tim memiliki observability yang cukup untuk menjaga performa ke depan.

## Catatan Penutup

Dokumen ini sengaja ditulis sebagai **execution plan**, bukan hanya review. Semua rekomendasi di atas harus diterjemahkan ke PR implementasi dan diverifikasi hasilnya. Jika dikerjakan sesuai urutan prioritas, dampak paling cepat akan terlihat pada:

- `dashboard`
- `work-items`
- shell global aplikasi
- query Supabase yang paling sering dipanggil
