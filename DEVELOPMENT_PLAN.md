# Development Plan — Accounting Operations Control Tower

> Last updated: 2026-08-01
> Status: Phase 0 COMPLETE, Phase 1 IN PROGRESS

---

## Ringkasan Eksekusi

| Phase | Nama | Est. Sprint | Status |
|-------|------|-------------|--------|
| 0 | Foundation & Schema | — | ✅ DONE |
| 1 | Auth + Layout Shell + Dashboard | Sprint 1–2 | 🔵 IN PROGRESS |
| 2 | Work Item Engine + API | Sprint 3–5 | ⬜ TODO |
| 3 | Template & Project Engine | Sprint 6–7 | ⬜ TODO |
| 4 | Notification & Escalation Engine | Sprint 8–9 | ⬜ TODO |
| 5 | WhatsApp + SOP + Review Engine | Sprint 10–12 | ⬜ TODO |
| 6 | AI Integration + Refinements | Sprint 13–15 | ⬜ TODO |
| 7 | Polish, UAT & Launch | Sprint 16–17 | ⬜ TODO |

---

## Phase 0 — Foundation & Schema ✅

Sudah selesai. Yang sudah dikerjakan:

- [x] Inisialisasi Next.js 16 + React 19 + TypeScript + Tailwind v4
- [x] Install Shadcn UI components (button, card, input, label, select, separator, badge, avatar, dropdown-menu, dialog, sheet, table, tabs, toast, tooltip)
- [x] Setup Supabase client (browser + server/service_role) dengan schema `acct_ctrl`
- [x] Buat schema `acct_ctrl` di database Supabase
- [x] Jalankan migration `001_create_acct_ctrl_schema.sql` (9 enum, 44 tabel, 13 index, RLS)
- [x] Expose schema `acct_ctrl` di Supabase PostgREST settings
- [x] Buat `.env.local.example` dengan semua env vars
- [x] Buat `nixpacks.toml` untuk Coolify deployment
- [x] Buat folder structure lengkap (app routes, lib, components, hooks, stores, types)
- [x] Buat GitHub repo `degitalintelligence/accounting-control-tower` + push
- [x] Buat AGENTS.md (295 lines, lengkap)

---

## Phase 1 — Auth + Layout Shell + Dashboard

**Goal**: User bisa login, lihat dashboard, dan navigasi ke semua halaman utama.

### Epic 1.1 — Authentication

- [ ] **1.1.1** Install & setup `@supabase/ssr` (cookie-based auth untuk Next.js App Router)
- [ ] **1.1.2** Buat middleware `src/middleware.ts` — protect semua route kecuali `/login`
- [ ] **1.1.3** Buat halaman `/login` — email + password login form
- [ ] **1.1.4** Buat API route `POST /api/auth/login` — server action untuk Supabase Auth
- [ ] **1.1.5** Buat API route `POST /api/auth/logout` — sign out + redirect
- [ ] **1.1.6** Buat hook `useAuth()` — ambil user session, profile, org_id
- [ ] **1.1.7** Seed data awal: 1 org + 3 profiles (admin, finance_staff, finance_manager) di Supabase Auth
- [ ] **1.1.8** Buat store `auth-store.ts` (Zustand) — simpan session & profile

### Epic 1.2 — App Layout Shell

- [ ] **1.2.1** Buat `AppSidebar` component — navigasi utama (Dashboard, Work Items, Templates, Projects, Reports, Settings, WA Inbox)
- [ ] **1.2.2** Buat `AppHeader` component — user avatar, org name, dropdown logout
- [ ] **1.2.3** Buat layout group `(dashboard)/layout.tsx` — sidebar + header + main content area
- [ ] **1.2.4** Responsive sidebar — collapse di mobile, icon-only mode
- [ ] **1.2.5** Active state highlighting di sidebar links
- [ ] **1.2.6** Breadcrumb component untuk navigasi

### Epic 1.3 — Dashboard

- [ ] **1.3.1** Buat `GET /api/dashboard/stats` — query aggregate (active, overdue, pending_review, blocked counts)
- [ ] **1.3.2** Buat `GET /api/dashboard/upcoming-deadlines` — top 5 work items due soon
- [ ] **1.3.3** Buat `GET /api/dashboard/activity-feed` — recent audit_logs (10 terakhir)
- [ ] **1.3.4** Render stat cards di halaman `/dashboard`
- [ ] **1.3.5** Render upcoming deadlines list
- [ ] **1.3.6** Render activity feed
- [ ] **1.3.7** Loading skeleton states untuk semua card

### Epic 1.4 — Settings & Profile Pages

- [ ] **1.4.1** Buat halaman `/settings` (placeholder — tab: General, Members, Billing)
- [ ] **1.4.2** Buat halaman `/settings/members` — daftar anggota org dengan role badge
- [ ] **1.4.3** API `GET /api/settings/members` — list profiles di org

---

## Phase 2 — Work Item Engine + API

**Goal**: Core engine yang bisa create, assign, transition, dan comment pada work items.

### Epic 2.1 — Work Item State Machine

- [ ] **2.1.1** Implementasi state machine di `src/lib/work-engine/status-machine.ts`
  - Status: `draft → open → in_progress → pending_review → approved → closed`
  - Transisi valid per role (staff, manager, system)
- [ ] **2.1.2** Buat type definitions di `src/types/work-item.ts`
- [ ] **2.1.3** Buat `src/lib/work-engine/assignments.ts` — helper assign/unassign
- [ ] **2.1.4** Buat `src/lib/work-engine/due-date.ts` — hitung due_date berdasarkan recurrence_rule
- [ ] **2.1.5** Unit test untuk state machine transitions

### Epic 2.2 — Work Item CRUD API

- [ ] **2.2.1** `GET /api/work-items` — list dengan filter (status, type, assignee, priority, overdue)
- [ ] **2.2.2** `POST /api/work-items` — create work item + auto-assignment
- [ ] **2.2.3** `GET /api/work-items/[id]` — detail dengan assignments, comments, files
- [ ] **2.2.4** `PATCH /api/work-items/[id]` — update field non-status
- [ ] **2.2.5** `POST /api/work-items/[id]/transition` — status change (dengan validasi state machine)
- [ ] **2.2.6** `POST /api/work-items/[id]/assign` — assign staff/manager/approver
- [ ] **2.2.7** `POST /api/work-items/[id]/comments` — tambah komentar
- [ ] **2.2.8** `GET /api/work-items/[id]/comments` — list komentar
- [ ] **2.2.9** `POST /api/work-items/[id]/files` — upload file attachment (Supabase Storage)
- [ ] **2.2.10** Middleware validasi: cek role user sebelum transition

### Epic 2.3 — Work Item UI

- [ ] **2.3.1** Buat halaman `/work-items` — list view dengan filter bar & tab (All, Mine, Overdue)
- [ ] **2.3.2** Buat `WorkItemList` component — table/card hybrid responsive
- [ ] **2.3.3** Buat `WorkItemCard` component — compact card dengan status badge, assignee avatar, due date
- [ ] **2.3.4** Buat halaman `/work-items/[id]` — detail view
- [ ] **2.3.5** Buat `WorkItemDetail` component — full detail dengan tabs (Overview, Comments, Files, History)
- [ ] **2.3.6** Buat `StatusTransitionButton` — dropdown aksi sesuai role & status saat ini
- [ ] **2.3.7** Buat `CommentThread` component — komentar dengan timestamp & author
- [ ] **2.3.8** Buat `FileAttachment` component — upload & list file
- [ ] **2.3.9** Buat dialog "Create Work Item" — form type, title, description, priority, assignee, due_date
- [ ] **2.3.10** Realtime subscription — Supabase Realtime untuk update live (opsional, bisa Phase 7)

### Epic 2.4 — Audit Trail

- [ ] **2.4.1** Buat trigger function `log_change()` di SQL — auto-log ke audit_logs saat INSERT/UPDATE
- [ ] **2.4.2** Attach trigger ke tabel: work_items, assignments, reviews, payments
- [ ] **2.4.3** Buat `GET /api/work-items/[id]/history` — query audit_logs per work_item
- [ ] **2.4.4** Render history tab di detail view — siapa, kapan, apa yang berubah

---

## Phase 3 — Template & Project Engine

**Goal**: Manager bisa buat template untuk pekerjaan berulang, dan group work items ke dalam project.

### Epic 3.1 — Template System

- [ ] **3.1.1** Buat type definitions untuk `Template` dan `TemplateStep`
- [ ] **3.1.2** `GET /api/templates` — list templates (shared + org)
- [ ] **3.1.3** `POST /api/templates` — create template dengan steps
- [ ] **3.1.4** `PATCH /api/templates/[id]` — update template
- [ ] **3.1.5** `DELETE /api/templates/[id]` — soft delete (set active=false)
- [ ] **3.1.6** `POST /api/templates/[id]/instantiate` — generate work items dari template (dengan due date calculation)
- [ ] **3.1.7** Buat halaman `/templates` — list template cards
- [ ] **3.1.8** Buat halaman `/templates/[id]` — detail template dengan steps editor
- [ ] **3.1.9** Buat `TemplateCard` component — nama, deskripsi, step count, "Use" button
- [ ] **3.1.10** Buat `TemplateStepEditor` — drag-drop reorder steps, set title, assignee_role, offset_days

### Epic 3.2 — Project Grouping

- [ ] **3.2.1** `GET /api/projects` — list projects
- [ ] **3.2.2** `POST /api/projects` — create project
- [ ] **3.2.3** `GET /api/projects/[id]` — detail dengan linked work items
- [ ] **3.2.4** `PATCH /api/projects/[id]` — update project
- [ ] **3.2.5** Link work_item ke project (update `work_items.project_id`)
- [ ] **3.2.6** Buat halaman `/projects` — list project cards
- [ ] **3.2.7** Buat halaman `/projects/[id]` — detail project + Gantt-like timeline view (bisa sederhana dulu)
- [ ] **3.2.8** Buat `ProjectCard` component — nama, progress bar (completed/total), deadline

---

## Phase 4 — Notification & Escalation Engine

**Goal**: Sistem notifikasi real-time (in-app + email) dan auto-escalation untuk overdue items.

### Epic 4.1 — Notification System

- [ ] **4.1.1** Buat `src/lib/notification/dispatcher.ts` — fungsi `dispatchNotification(event)`
- [ ] **4.1.2** Buat event types: `item_assigned`, `status_changed`, `comment_added`, `deadline_approaching`, `item_overdue`, `review_requested`, `review_approved`
- [ ] **4.1.3** Buat `notification_events` insert trigger → enqueue ke `notification_queue`
- [ ] **4.1.4** `GET /api/notifications` — list notifikasi user (unread first)
- [ ] **4.1.5** `PATCH /api/notifications/[id]/read` — mark as read
- [ ] **4.1.6** `PATCH /api/notifications/read-all` — mark all as read
- [ ] **4.1.7** Buat `NotificationBell` component di header — badge count + dropdown list
- [ ] **4.1.8** Buat `NotificationItem` component — icon berdasarkan event type, timestamp, link ke work item
- [ ] **4.1.9** Supabase Realtime subscription untuk push notifikasi live (opsional)

### Epic 4.2 — Email Notifications

- [ ] **4.2.1** Setup Resend client di `src/lib/notification/resend-client.ts`
- [ ] **4.2.2** Buat email templates (React Email atau HTML string):
  - Assignment notification
  - Status change notification
  - Deadline reminder (H-1)
  - Overdue alert
  - Review requested
- [ ] **4.2.3** Integrasi email dispatch ke `dispatcher.ts` — kirim email berdasarkan user preference
- [ ] **4.2.4** Buat user notification preference (bisa simple: email_on_assignment, email_on_deadline)

### Epic 4.3 — Escalation Engine

- [ ] **4.3.1** Buat `src/lib/notification/escalation.ts` — logic auto-escalate
- [ ] **4.3.2** Escalation rules:
  - Overdue > 24 jam → notify manager + set priority ke HIGH
  - Overdue > 48 jam → notify admin + set priority ke URGENT
  - Overdue > 72 jam → notify director (opsional, Phase 7)
- [ ] **4.3.3** Buat API endpoint `POST /api/jobs/escalation-check` — dipanggil cron
- [ ] **4.3.4** Buat cron job di Coolify — jalankan escalation check setiap 1 jam

---

## Phase 5 — WhatsApp + SOP + Review Engine

**Goal**: Integrasi WhatsApp (WAHA), SOP checklist system, dan review workflow.

### Epic 5.1 — WhatsApp Integration (WAHA)

- [ ] **5.1.1** Setup WAHA client di `src/lib/whatsapp/waha-client.ts`
- [ ] **5.1.2** Buat `POST /api/wa-webhook` — terima webhook dari WAHA
- [ ] **5.1.3** Parse incoming WhatsApp messages → simpan ke `wa_messages`
- [ ] **5.1.4** Match message ke staff berdasarkan `phone_number` di profiles
- [ ] **5.1.5** Auto-create `work_item` dari WhatsApp message (status: DRAFT, perlu konfirmasi)
- [ ] **5.1.6** Buat halaman `/wa-inbox` — list incoming messages yang belum diproses
- [ ] **5.1.7** Buat `WAInboxItem` component — message preview, sender, timestamp, "Create Task" button
- [ ] **5.1.8** Buat `POST /api/wa-webhook/[id]/confirm` — konfirmasi jadi work item
- [ ] **5.1.9** Kirim WhatsApp reply via WAHA saat task di-assign (optional, bisa Phase 7)
- [ ] **5.1.10** Dead letter handling — message yang gagal diproses masuk `wa_dead_letter`

### Epic 5.2 — SOP Checklist System

- [ ] **5.2.1** Buat `SOPChecklist` component — render checklist dari `sop_checklists.checklist_items`
- [ ] **5.2.2** Editable checklist — staff bisa centang item per item
- [ ] **5.2.3** Progress bar — X/Y items completed
- [ ] **5.2.4** Auto-create checklist saat work_item di-assign (berdasarkan template SOP)
- [ ] **5.2.5** Validasi: semua checklist items harus selesai sebelum status → `pending_review`

### Epic 5.3 — Review & Approval Workflow

- [ ] **5.3.1** `POST /api/work-items/[id]/review` — submit review (APPROVE / REVISION_REQUESTED / REJECT)
- [ ] **5.3.2** Jika REVISION_REQUESTED → kembalikan status ke `in_progress` + tambah komentar revisi
- [ ] **5.3.3** Jika APPROVE → status → `approved` → auto-close jika semua checklist done
- [ ] **5.3.4** Buat `ReviewPanel` component di detail view — form review + komentar
- [ ] **5.3.5** Multi-level review (opsional) — staff → manager → admin approve chain
- [ ] **5.3.6** Review history — siapa review, kapan, hasilnya apa

### Epic 5.4 — Reports & Deliverables

- [ ] **5.4.1** Buat halaman `/reports` — list report/deliverable work items
- [ ] **5.4.2** Filter by report_type (financial_statement, tax_report, bank_reconciliation, audit_report)
- [ ] **5.4.3** Upload deliverable file — linked ke work_item
- [ ] **5.4.4** Track delivery status (draft → submitted → reviewed → approved → filed)

---

## Phase 6 — AI Integration + Refinements

**Goal**: AI assist untuk task extraction, review, dan insights.

### Epic 6.1 — AI Task Extraction

- [ ] **6.1.1** Buat `src/lib/ai/openrouter-client.ts` — setup OpenRouter API client
- [ ] **6.1.2** Buat prompt di `src/lib/ai/prompts.ts` — extract tasks dari WhatsApp message
- [ ] **6.1.3** `POST /api/ai/extract-tasks` — kirim message → dapat suggested tasks
- [ ] **6.1.4** Tampilkan suggested tasks di `/wa-inbox` — user bisa edit sebelum confirm
- [ ] **6.1.5** Confidence score per extracted task

### Epic 6.2 — AI Review Assistant

- [ ] **6.2.1** Buat prompt untuk review assistance — cek completeness, flag anomalies
- [ ] **6.2.2** `POST /api/ai/review-assist` — kirim work item context → dapat AI suggestion
- [ ] **6.2.3** Tampilkan AI suggestion di ReviewPanel — "AI Notes" tab
- [ ] **6.2.4** Manager bisa accept/reject AI suggestion

### Epic 6.3 — Dashboard Insights (AI-Powered)

- [ ] **6.3.1** Buat `GET /api/ai/insights` — generate weekly summary (bottleneck, overdue trends)
- [ ] **6.3.2** Render insights card di dashboard
- [ ] **6.3.3** Natural language query — "apa yang overdue minggu ini?" → AI interpretasi + query

### Epic 6.4 — Performance & UX Refinements

- [ ] **6.4.1** Optimistic updates — UI update sebelum API response
- [ ] **6.4.2** Keyboard shortcuts — navigasi cepat (N = new item, / = search)
- [ ] **6.4.3** Command palette (Cmd+K) — quick action
- [ ] **6.4.4** Bulk actions — select multiple items → batch assign/status change
- [ ] **6.4.5** Advanced filtering — saved filters per user
- [ ] **6.4.6** Export data — CSV/Excel untuk work items & reports

---

## Phase 7 — Polish, UAT & Launch

**Goal**: Production-ready, tested, documented.

### Epic 7.1 — Testing

- [ ] **7.1.1** Unit tests untuk state machine, assignments, due-date calculator
- [ ] **7.1.2** API integration tests — semua endpoint
- [ ] **7.1.3** E2E tests (Playwright) — critical flows (login, create item, assign, transition, review)
- [ ] **7.1.4** Load testing — simulasi 50 concurrent users

### Epic 7.2 — Security Hardening

- [ ] **7.2.1** Security audit — RLS policies, API authorization checks
- [ ] **7.2.2** Input validation — semua API input di-validate (zod)
- [ ] **7.2.3** Rate limiting — protect API routes dari abuse
- [ ] **7.2.4** CSP headers — Content Security Policy
- [ ] **7.2.5** Dependency audit — `npm audit` + fix vulnerabilities

### Epic 7.3 — Performance Optimization

- [ ] **7.3.1** Database query optimization — EXPLAIN ANALYZE semua query utama
- [ ] **7.3.2** Add missing indexes berdasarkan query patterns
- [ ] **7.3.3** Implementasi pagination (cursor-based) untuk semua list endpoints
- [ ] **7.3.4** Image/file optimization — compress uploads, CDN untuk static assets
- [ ] **7.3.5** Bundle size optimization — tree shaking, dynamic imports

### Epic 7.4 — Documentation & Deployment

- [ ] **7.4.1** API documentation — OpenAPI/Swagger spec
- [ ] **7.4.2** User guide — screenshot-based untuk staff & manager
- [ ] **7.4.3** Setup Coolify deployment — environment variables, domain, SSL
- [ ] **7.4.4** Setup monitoring — error tracking (Sentry atau equivalent)
- [ ] **7.4.5** Seed data untuk demo — realistic sample data
- [ ] **7.4.6** UAT dengan stakeholder
- [ ] **7.4.7** Go-live checklist

---

## Dependency Map

```
Phase 1 (Auth+Dashboard) ← Tidak ada dependency
Phase 2 (Work Items)     ← Phase 1
Phase 3 (Templates)      ← Phase 2
Phase 4 (Notifications)  ← Phase 2
Phase 5 (WhatsApp+SOP)   ← Phase 2, Phase 4 (email)
Phase 6 (AI)             ← Phase 2, Phase 5 (WhatsApp)
Phase 7 (Polish)         ← Semua phase sebelumnya
```

Catatan: Phase 3 dan Phase 4 bisa dikerjakan paralel setelah Phase 2 selesai.

---

## Tech Debt & Known Limitations (MVP)

1. **WhatsApp**: WAHA adapter hardcode ke satu nomor WhatsApp. Multi-device perlu refactor.
2. **AI**: Model selection via env var. Tidak ada dynamic model routing.
3. **Realtime**: Supabase Realtime untuk live updates belum diimplementasi (bisa di Phase 7).
4. **Multi-org**: Satu user = satu org. Multi-org access perlu redesign RLS.
5. **File Storage**: Menggunakan Supabase Storage default bucket. Perlu bucket policy untuk isolasi org.
6. **Escalation**: Hanya 3 level (24h/48h/72h). Configurable rules perlu Phase 7+.
7. **Reports**: Belum ada auto-generation. Semua report manual upload.

---

## Sprint Velocity Assumption

- 1 sprint = 2 minggu
- 1 developer full-time ≈ 30–40 story points per sprint
- Total estimasi: ~17 sprint (34 minggu / ~8 bulan)
- Bisa dipercepat jika ada 2+ developer paralel di Phase 3+4

---

## Next Steps (Immediate)

1. ✅ ~~Phase 0 selesai~~
2. 🔵 **Mulai Phase 1 Epic 1.1** — Authentication setup
3. Selanjutnya: Epic 1.2 — App Layout Shell
4. Lalu: Epic 1.3 — Dashboard
