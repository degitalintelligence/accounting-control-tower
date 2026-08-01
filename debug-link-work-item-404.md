# Debug Session: link-work-item-404
- **Status**: [OPEN]
- **Issue**: Menghubungkan tugas ke project menghasilkan `POST /api/projects/:id/link-work-item 404`.
- **Debug Server**: Tidak dapat dijalankan karena Python tidak tersedia di environment
- **Log File**: `.dbg/trae-debug-log-link-work-item-404.ndjson`

## Reproduction Steps
1. Buka halaman detail project.
2. Buka dialog pengelolaan tugas.
3. Pilih work item lalu hubungkan ke project.
4. Amati response `POST /api/projects/:id/link-work-item`.

## Hypotheses & Verification
| ID | Hypothesis | Likelihood | Effort | Evidence |
|----|------------|------------|--------|----------|
| A | Route API tidak terdaftar atau path folder tidak cocok | High | Low | Rejected: route terdaftar dan build menampilkan endpoint |
| B | Handler route ada tetapi method/kontrak request tidak cocok | Medium | Low | Rejected: dialog dan handler sama-sama menggunakan POST + `work_item_id` |
| C | Project tidak ditemukan atau akses tenant ditolak | Medium | Medium | Rejected sebagai akar umum: query handler memakai kolom tenant yang tidak ada di schema project |
| D | Dialog mengirim endpoint atau payload yang salah | Medium | Low | Rejected: endpoint dan payload sesuai handler |
| E | Validasi relasi project/work item menghasilkan 404 | Low | Medium | Confirmed: handler memfilter `projects.organization_id`/`deleted_at`, padahal konteks berada di root work item |

## Log Evidence
- Log pengguna: `POST /api/projects/d9e7e8fb-89a4-4971-a80f-fc474ddfc0ac/link-work-item 404`.
- Route ditemukan di `src/app/api/projects/[id]/link-work-item/route.ts`.
- Schema `acct_ctrl.projects` hanya memiliki `work_item_id`; tidak memiliki `organization_id`, `client_id`, atau `deleted_at`.
- Schema `work_items.project_id` sebelumnya mereferensikan `work_items(id)`, padahal endpoint mengisinya dengan `projects(id)`.
- Migration `045_fix_project_work_item_link_fk.sql` sudah diaplikasikan via Supabase MCP.

## Verification Conclusion
Perbaikan diterapkan pada handler POST/DELETE dengan validasi tenant melalui root work item. Foreign key `work_items.project_id` juga sudah diarahkan ke `projects(id)`. Verifikasi user mengubah error menjadi `PGRST201`: setelah FK diperbaiki, PostgREST menemukan dua relasi `projects → work_items`. Query project kemudian diperbaiki dengan FK hint `projects_work_item_id_fkey` pada endpoint list, detail, link, dan unlink. Menunggu verifikasi ulang.
