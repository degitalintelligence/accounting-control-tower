# Debug New Workspace Missing

Status: [OPEN]

## Gejala

Workspace baru berhasil dibuat, tetapi tidak muncul pada dropdown workspace di sidebar.

## Hipotesis

1. Database berhasil membuat organisasi, tetapi auth store masih menyimpan daftar lama.
2. `/api/auth/me` mengembalikan data yang stale karena cache.
3. Membership atau organisasi baru tidak ditemukan oleh query auth context.
4. Sidebar tidak melakukan refresh auth setelah onboarding selesai.

## Rencana Bukti

- Instrumentasi response organisasi pada `/api/auth/me`.
- Instrumentasi state organisasi yang dirender sidebar.
- Reproduksi dengan membuka ulang halaman dan dropdown.
- Bandingkan data server dengan data client.

Jangan mencatat email, token, nama client, payload sensitif, atau secret.
