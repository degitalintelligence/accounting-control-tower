# Debug Return Workspace 400

Status: [OPEN]

## Gejala

Memilih organisasi sebelumnya dari dropdown menghasilkan `POST /api/auth/organization 400`.

## Hipotesis

1. ID organisasi yang dikirim dari dropdown bukan UUID valid.
2. State `organizations` di auth store memuat data lama atau bentuk payload yang tidak sesuai.
3. Tombol organisasi lama tidak benar-benar mengirim ID organisasi yang ditampilkan.
4. Server menerima body yang kosong atau malformed akibat klik saat state switching.

## Rencana Bukti

- Catat bentuk aman payload client tanpa mengirim token atau nama sensitif.
- Catat hasil validasi route dan panjang/format ID yang diterima.
- Reproduksi perpindahan kembali ke organisasi lama.
- Terapkan perbaikan minimal berdasarkan bukti.
