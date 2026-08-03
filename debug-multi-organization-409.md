# Debug Multi Organization 409

Status: [OPEN]

## Gejala

POST `/api/organizations` mengembalikan HTTP 409 dengan pesan `Anda sudah memiliki organisasi aktif.` ketika user mencoba membuat organisasi baru.

## Hipotesis

1. RPC menolak semua user yang sudah memiliki membership organisasi aktif.
2. Penolakan dipicu membership org-wide aktif (`client_id IS NULL`).
3. Organisasi kedua sebenarnya valid, tetapi active-organization context belum mendukung multi-organisasi.
4. Constraint slug unik adalah penyebab alternatif.

## Rencana Bukti

- Periksa implementasi route dan RPC yang sedang digunakan.
- Ambil status membership dan organisasi user secara aman tanpa mencatat PII atau secret.
- Reproduksi request dengan slug baru.
- Bandingkan hasil sebelum dan sesudah perbaikan.

## Catatan

Jangan mencatat email, token, nama client, payload sensitif, atau service-role key.
