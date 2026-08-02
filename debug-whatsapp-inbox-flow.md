# Debug WhatsApp Inbox Flow

Status: [OPEN]

## Symptom

Group sudah berhasil masuk whitelist, tetapi pesan belum terlihat di inbox.

## Hypotheses

1. WAHA belum mengirim webhook ke aplikasi.
2. Payload webhook tidak cocok dengan parser aplikasi.
3. Provider group ID atau connection ID tidak cocok dengan data whitelist.
4. Pesan tersimpan tetapi terfilter di halaman inbox.
5. Contact mapping belum terverifikasi dan pesan tidak dipromosikan ke inbox.

## Evidence

Belum dikumpulkan.

## Changes

Belum ada perubahan business logic.
