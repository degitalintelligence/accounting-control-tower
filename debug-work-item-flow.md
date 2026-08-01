# Debug Work Item Flow

Status: [OPEN]

## Scope

- Recurrence harian, mingguan, dan custom period
- Dependency pada setup checklist
- Error MenuGroupContext saat mengubah status
- Relasi project ke task
- Wrapper dan margin halaman detail work item

## Hypotheses

1. Recurrence belum terhubung penuh antara UI, validasi, API, atau model data.
2. Dependency belum terhubung ke form atau endpoint setup checklist.
3. Komponen menu status menggunakan menu group tanpa parent group yang sesuai.
4. Relasi project-task gagal dipersist atau ditolak oleh validasi tenancy/schema.
5. Halaman detail work item kehilangan wrapper/padding layout yang dipakai task bar.

## Evidence

- Browser reproduction belum mencapai halaman work item karena `ChunkLoadError` pada dev server; `MenuGroupContext` belum dapat diuji runtime.
- Static inspection confirmed `DropdownMenuLabel` used `MenuPrimitive.GroupLabel` outside `DropdownMenuGroup`.
- Build and lint pass after wrapping the status menu contents in `DropdownMenuGroup`.
- Recurrence scheduler already supports daily and weekly RRULE processing; UI/API were missing.
- Project linking endpoint lacked client-scope validation; dependency UI required manual UUID input.

## Changes Under Verification

- Added recurrence GET/PUT/DELETE API and template editor for daily, weekly, and custom RRULE.
- Added searchable dependency candidate picker.
- Added project/task client matching validation.
- Added detail-page max-width and responsive horizontal padding.
- Wrapped status menu group label and items with `DropdownMenuGroup`.

## Verification

- `npm run lint`: passed.
- `npm run build`: passed.
- Browser verification remains pending because the prior dev server emitted stale/missing Turbopack chunks.
