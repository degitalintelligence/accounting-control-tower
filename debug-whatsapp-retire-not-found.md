# Debug WhatsApp Retire Not Found

Status: [OPEN]

## Symptom

Retire connection menampilkan pesan `Connection tidak ditemukan.`.

## Hypotheses

1. UI mengirimkan connection ID yang kosong atau berbeda dari row yang dipilih.
2. Connection berada di organisasi berbeda dari organisasi user aktif.
3. RPC retirement tidak menemukan connection karena filter tenant atau status.
4. Data UI stale setelah daftar connection berubah.
5. Query atau schema retirement tidak konsisten dengan kolom connection terbaru.

## Evidence

Belum dikumpulkan.

## Changes

Belum ada perubahan business logic.
