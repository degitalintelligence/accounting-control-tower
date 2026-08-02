# Debug WAHA Discovery Empty

Status: [OPEN]

## Symptom

WAHA sudah connected, tetapi daftar group/contact yang dapat dipilih belum muncul.

## Hypotheses

1. API admin hanya membaca whitelist database, bukan daftar dari WAHA.
2. Endpoint status belum menjalankan discovery provider.
3. Session database berbeda dari session aktif di WAHA.
4. Adapter belum memiliki fungsi discovery group/contact.
5. UI belum mengelola dan menampilkan hasil discovery provider.

## Evidence

Belum dikumpulkan.

## Changes

Belum ada perubahan business logic.
