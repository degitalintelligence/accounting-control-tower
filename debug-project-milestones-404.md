# Debug Session: project-milestones-404
- **Status**: [OPEN]
- **Issue**: GET `/api/projects/:id/milestones` menghasilkan 404 pada halaman detail project.
- **Debug Server**: Tidak tersedia karena Python tidak terpasang di environment.
- **Log File**: `.dbg/trae-debug-log-project-milestones-404.ndjson`

## Reproduction Steps
1. Buka halaman detail project.
2. Buka tab Milestone.
3. Amati request GET `/api/projects/d9e7e8fb-89a4-4971-a80f-fc474ddfc0ac/milestones`.

## Hypotheses & Verification
| ID | Hypothesis | Likelihood | Effort | Evidence |
|----|------------|------------|--------|----------|
| A | Route milestones tidak terdaftar | High | Low | Rejected: route ditemukan dan handler berjalan |
| B | Handler mencari kolom tenant langsung pada projects | High | Low | Rejected: handler mengambil scope dari work item utama |
| C | Handler memakai relasi projects-work_items ambigu | Medium | Low | Confirmed: setelah FK diperbaiki, semua `work_items!inner` perlu FK hint |
| D | Project/work item utama tidak lolos scope | Medium | Medium | Pending |
| E | Frontend memakai URL yang salah | Low | Low | Pending |

## Log Evidence
User log: GET `/api/projects/d9e7e8fb-89a4-4971-a80f-fc474ddfc0ac/milestones` returns 404.

## Verification Conclusion
Perbaikan diterapkan dengan relationship hint `projects_work_item_id_fkey` pada GET/POST milestones serta PATCH/DELETE milestone. Menunggu verifikasi ulang dari browser.
