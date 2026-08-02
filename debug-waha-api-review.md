# Debug WAHA API Review

Status: [OPEN]

## Symptom

WAHA terlihat connected, tetapi daftar group tidak muncul di halaman administrasi.

## Hypotheses

1. Endpoint discovery group tidak cocok dengan versi atau engine WAHA.
2. Status database `WORKING` tidak sama dengan status aktual session di WAHA.
3. Header autentikasi WAHA tidak diterima oleh endpoint discovery.
4. Bentuk response endpoint group berbeda dari parser aplikasi.
5. Error upstream disederhanakan sehingga penyebab sebenarnya tidak terlihat.

## Evidence

- `GET /api/sessions/ops-acctg` returned HTTP 200 with session metadata.
- `GET /api/ops-acctg/groups` returned HTTP 200 with 677 groups.
- `GET /api/ops-acctg/chats` returned HTTP 200 with 1050 chats.
- The adapter and admin route used the correct groups endpoint and returned its array.
- The UI created `discoveryPanel` but did not render it; it evaluated `void discoveryPanel` instead.

## Changes

- The discovery panel is now rendered in the QR and whitelist panel.
- TypeScript diagnostics are clean.
