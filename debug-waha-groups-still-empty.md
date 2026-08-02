# Debug WAHA Groups Still Empty

Status: [OPEN]

## Symptom

Daftar grup WAHA masih belum terlihat setelah discovery group ditambahkan.

## Hypotheses

1. Bundle browser belum memuat perubahan discovery.
2. Request discovery memakai connection ID atau session yang salah.
3. Response discovery memiliki field yang tidak cocok dengan selector UI.
4. Panel atau dropdown discovery tertutup oleh layout.
5. Error discovery tidak terlihat jelas di UI.

## Evidence

- Browser request `GET /api/admin/whatsapp?action=discover-groups&id=8b80067b-ecae-4763-b18d-c7e13574c4dd` returned HTTP 200 with 678 options.
- The WAHA group payload uses nested identifiers: `groupMetadata.id._serialized` and `groupMetadata.subject`.
- The UI previously rendered the nested group object as `[object Object]`, so the selected provider group ID was invalid.

## Changes

- Added nested WAHA identifier normalization for group and participant IDs.
- Added group name normalization from `groupMetadata.subject`.
- TypeScript diagnostics and `tsc --noEmit` pass.
