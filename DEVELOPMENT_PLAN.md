# Development Plan — Accounting Operations Control Tower

> Last updated: 2026-08-01
> Status: Phase 0–4 COMPLETE, Phase 5 NEXT

---

## Ringkasan Eksekusi

| Phase | Nama | Est. Sprint | Status |
|-------|------|-------------|--------|
| 0 | Foundation & Schema | — | ✅ DONE |
| 1 | Auth + Layout Shell + Dashboard | Sprint 1–2 | ✅ DONE* |
| 2 | Work Item Engine + API | Sprint 3–5 | ✅ DONE* |
| 3 | Template & Project Engine | Sprint 6–7 | ✅ DONE |
| 4 | Notification & Escalation Engine | Sprint 8–9 | ✅ DONE* |
| 5 | WhatsApp + SOP + Review Engine | Sprint 10–12 | 🔵 NEXT |
| 6 | AI Integration + Refinements | Sprint 13–15 | ⬜ TODO |
| 7 | Polish, UAT & Launch | Sprint 16–17 | ⬜ TODO |


`*` Memiliki item backlog yang ditunda dan dikerjakan pada tahap testing/polish.

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

- [x] **1.1.1** Install & setup `@supabase/ssr` (cookie-based auth untuk Next.js App Router)
- [x] **1.1.2** Buat proxy `src/proxy.ts` (Next.js 16, renamed from middleware) — protect semua route kecuali `/login`
- [x] **1.1.3** Buat halaman `/login` — email + password login form
- [x] **1.1.4** Server action `login()` di `src/app/actions/auth.ts`
- [x] **1.1.5** Server action `logout()` di `src/app/actions/auth.ts`
- [x] **1.1.6** Buat hook `useAuth()` + `GET /api/auth/me` — ambil user session, profile, org_id, role
- [x] **1.1.7** Seed data: trigger `handle_new_user()` + org seed (migrations 002, 003) + `scripts/seed-users.mjs`
- [x] **1.1.8** Buat store `auth-store.ts` (Zustand) — simpan session & profile

### Epic 1.2 — App Layout Shell

- [x] **1.2.1** Buat `AppSidebar` component — navigasi utama (Dashboard, Work Items, Templates, Projects, Reports, Settings, WA Inbox)
- [x] **1.2.2** Buat `AppHeader` component — user avatar, org name
- [x] **1.2.3** Buat layout group `(dashboard)/layout.tsx` — sidebar + header + main content area
- [x] **1.2.4** Responsive sidebar — collapse di mobile (overlay), lg: breakpoint
- [x] **1.2.5** Active state highlighting di sidebar links
- [x] **1.2.6** Breadcrumb component untuk navigasi

### Epic 1.3 — Dashboard

- [x] **1.3.1** Buat `GET /api/dashboard/stats` — query aggregate (overdue, pending_review, blocked, on-time rate)
- [x] **1.3.2** Buat `GET /api/dashboard/upcoming-deadlines` — top 5 work items due soon + assignee
- [x] **1.3.3** Buat `GET /api/dashboard/activity-feed` — recent audit_logs (10 terakhir)
- [x] **1.3.4** Stat cards menggunakan data real dari API (StatCard component with props)
- [x] **1.3.5** useDashboard hook — fetch stats + deadlines + activity
- [x] **1.3.6** Loading skeleton states (StatCardSkeleton)
- [ ] **1.3.7** Render upcoming deadlines list dengan data real (saat ada data work_items)
- [ ] **1.3.8** Render activity feed dengan data real (saat ada data audit_logs)

### Epic 1.4 — Settings & Profile Pages

- [x] **1.4.1** Buat halaman `/settings` (tab: General, Members) — info org read-only
- [x] **1.4.2** Buat halaman `/settings/members` — daftar anggota org dengan role badge
- [x] **1.4.3** API `GET /api/settings/members` — list profiles di org

---

## Phase 2 — Work Item Engine + API

**Goal**: Core engine yang bisa create, assign, transition, dan comment pada work items.

### Epic 2.1 — Work Item State Machine

- [x] **2.1.1** Implementasi state machine di `src/lib/work-engine/status-machine.ts`
  - Status: `draft → assigned → in_progress → blocked → submitted → under_review → revision_required → awaiting_approval → approved → completed → cancelled`
  - Transisi valid per role (maker, checker, approver)
- [x] **2.1.2** Buat type definitions di `src/types/work-item.ts`
- [x] **2.1.3** Buat `src/lib/work-engine/assignments.ts` — helper assign/unassign
- [x] **2.1.4** Buat `src/lib/work-engine/due-date.ts` — hitung due_date berdasarkan recurrence_rule
- [ ] **2.1.5** Unit test untuk state machine transitions

### Epic 2.2 — Work Item CRUD API

- [x] **2.2.1** `GET /api/work-items` — list dengan filter (status, type, assignee, priority, overdue)
- [x] **2.2.2** `POST /api/work-items` — create work item + auto-assignment
- [x] **2.2.3** `GET /api/work-items/[id]` — detail dengan assignments, comments, files
- [x] **2.2.4** `PATCH /api/work-items/[id]` — update field non-status
- [x] **2.2.5** `POST /api/work-items/[id]/transition` — status change (dengan validasi state machine)
- [x] **2.2.6** `POST /api/work-items/[id]/assign` — assign staff/manager/approver
- [x] **2.2.7** `POST /api/work-items/[id]/comments` — tambah komentar
- [x] **2.2.8** `GET /api/work-items/[id]/comments` — list komentar
- [ ] **2.2.9** `POST /api/work-items/[id]/files` — upload file attachment (Supabase Storage)
- [x] **2.2.10** Middleware validasi: cek role user sebelum transition

### Epic 2.3 — Work Item UI

- [x] **2.3.1** Buat halaman `/work-items` — list view dengan filter bar & tab (All, Mine, Overdue)
- [x] **2.3.2** Buat `WorkItemList` component — table/card hybrid responsive
- [x] **2.3.3** Buat `WorkItemCard` component — compact card dengan status badge, assignee avatar, due date
- [x] **2.3.4** Buat halaman `/work-items/[id]` — detail view
- [x] **2.3.5** Buat `WorkItemDetail` component — full detail dengan tabs (Overview, Comments, Files, History)
- [x] **2.3.6** Buat `StatusTransitionButton` — dropdown aksi sesuai role & status saat ini
- [x] **2.3.7** Buat `CommentThread` component — komentar dengan timestamp & author
- [ ] **2.3.8** Buat `FileAttachment` component — upload & list file
- [x] **2.3.9** Buat dialog "Create Work Item" — form type, title, description, priority, assignee, due_date
- [ ] **2.3.10** Realtime subscription — Supabase Realtime untuk update live (opsional, bisa Phase 7)

### Epic 2.4 — Audit Trail

- [x] **2.4.1** Buat trigger function `log_change()` di SQL — auto-log ke audit_logs saat INSERT/UPDATE/DELETE
- [x] **2.4.2** Attach trigger ke tabel: work_items, assignments
- [x] **2.4.3** Buat `GET /api/work-items/[id]/history` — query audit_logs per work_item
- [x] **2.4.4** Render history tab di detail view — siapa, kapan, apa yang berubah

---

## Phase 3 — Template & Project Engine

**Goal**: Manager bisa buat template untuk pekerjaan berulang, dan group work items ke dalam project.

### Epic 3.1 — Template System

- [x] **3.1.1** Buat type definitions untuk `Template` dan `TemplateStep` (`src/types/template.ts`)
- [x] **3.1.2** `GET /api/templates` — list templates (shared + org)
- [x] **3.1.3** `POST /api/templates` — create template dengan steps
- [x] **3.1.4** `PATCH /api/templates/[id]` — update template
- [x] **3.1.5** `DELETE /api/templates/[id]` — soft delete (set active=false)
- [x] **3.1.6** `POST /api/templates/[id]/instantiate` — generate work items dari template (dengan due date calculation)
- [x] **3.1.7** Buat halaman `/templates` — list template cards
- [x] **3.1.8** Buat halaman `/templates/[id]` — detail template dengan steps editor
- [x] **3.1.9** Buat `TemplateCard` component — nama, deskripsi, step count, "Use" button
- [x] **3.1.10** Buat `TemplateStepEditor` — reorder steps, set title, assignee_role, offset_days

### Epic 3.2 — Project Grouping

- [x] **3.2.1** `GET /api/projects` — list projects
- [x] **3.2.2** `POST /api/projects` — create project
- [x] **3.2.3** `GET /api/projects/[id]` — detail dengan linked work items
- [x] **3.2.4** `PATCH /api/projects/[id]` — update project
- [x] **3.2.5** Link work_item ke project (update `work_items.project_id`)
- [x] **3.2.6** Buat halaman `/projects` — list project cards
- [x] **3.2.7** Buat halaman `/projects/[id]` — detail project + milestone + work items
- [x] **3.2.8** Buat `ProjectCard` component — nama, progress bar (completed/total), deadline

---

## Phase 4 — Notification & Escalation Engine

**Goal**: Sistem notifikasi real-time (in-app + email) dan auto-escalation untuk overdue items.

### Epic 4.1 — Notification System

- [x] **4.1.1** Buat `src/lib/notification/dispatcher.ts` — fungsi `dispatchNotification(event)`
- [x] **4.1.2** Buat event types: `item_assigned`, `status_changed`, `comment_added`, `deadline_approaching`, `item_overdue`, `review_requested`, `review_approved`
- [x] **4.1.3** Buat durable outbox worker untuk memproses `domain_events` dan `outbox_events`
- [x] **4.1.4** `GET /api/notifications` — list notifikasi user (unread first)
- [x] **4.1.5** `PATCH /api/notifications/[id]/read` — mark as read
- [x] **4.1.6** `PATCH /api/notifications/read-all` — mark all as read
- [x] **4.1.7** Buat `NotificationBell` component di header — badge count + dropdown list
- [x] **4.1.8** Buat `NotificationItem` component — icon berdasarkan event type, timestamp, link ke work item
- [ ] **4.1.9** Supabase Realtime subscription untuk push notifikasi live (opsional)

### Epic 4.2 — Email Notifications

- [x] **4.2.1** Setup Resend client di `src/lib/notification/resend-client.ts`
- [x] **4.2.2** Buat email templates (HTML string):
  - Assignment notification
  - Status change notification
  - Deadline reminder (H-1)
  - Overdue alert
  - Review requested
- [x] **4.2.3** Integrasi email dispatch ke durable notification worker — kirim email berdasarkan user preference
- [x] **4.2.4** Buat user notification preference (`notification_preferences`)

### Epic 4.3 — Escalation Engine

- [x] **4.3.1** Buat `src/lib/notification/escalation.ts` — logic auto-escalate
- [x] **4.3.2** Escalation rules:
  - Overdue > 24 jam → notify manager + set priority ke HIGH
  - Overdue > 48 jam → notify admin + set priority ke URGENT
  - Overdue > 72 jam → notify director (opsional, Phase 7)
- [x] **4.3.3** Buat API endpoint `POST /api/jobs/escalation-check` — dipanggil cron
- [ ] **4.3.4** Buat cron job di Coolify — jalankan escalation check setiap 1 jam

---

## Phase 5 — WhatsApp + SOP + Review Engine

**Goal**: Integrasi WhatsApp (WAHA), SOP checklist system, dan review workflow.

**Progress**: Epic 5.1 selesai. Langkah berikutnya adalah Epic 5.2 — SOP Checklist, lalu Epic 5.3 — Review & Approval Workflow.

### Epic 5.1 — WhatsApp Integration (WAHA)

- [x] **5.1.1** Setup WAHA adapter dan token verification di `src/lib/whatsapp/`
- [x] **5.1.2** Buat `POST /api/wa-webhook` — terima webhook dari WAHA
- [x] **5.1.3** Parse incoming WhatsApp messages → simpan ke `wa_messages` secara idempotent
- [x] **5.1.4** Resolve group whitelist dan participant mapping
- [x] **5.1.5** Siapkan action suggestion pending untuk konfirmasi manusia
- [x] **5.1.6** Buat halaman `/wa-inbox` — list suggestion pending
- [x] **5.1.7** Buat `WAInboxItem` component — preview pesan dan aksi konfirmasi/tolak
- [x] **5.1.8** Buat API konfirmasi suggestion menjadi work item
- [ ] **5.1.9** Kirim WhatsApp reply via WAHA saat task di-assign (optional, bisa Phase 7)
- [x] **5.1.10** Harden ingestion constraints dan index untuk dead-letter/retry

### Epic 5.2 — SOP Checklist System

- [x] **5.2.1** Buat `ChecklistPanel` component — render checklist dari `checklist_templates` dan `checklist_items`
- [x] **5.2.2** Editable checklist — staff bisa mengisi checkbox, text, number, dan date
- [x] **5.2.3** Progress bar — X/Y items completed
- [x] **5.2.4** Auto-create checklist response saat work_item di-assign
- [x] **5.2.5** Validasi required checklist sebelum status → `submitted`

### Epic 5.3 — Review & Approval Workflow

- [x] **5.3.1** `GET/POST /api/work-items/[id]/reviews` — review dan approval dengan keputusan `approved`, `revision_required`, atau `rejected`
- [x] **5.3.2** Jika `revision_required` atau `rejected` → status `revision_required` + alasan/finding tersimpan
- [x] **5.3.3** Jika `approved` → status `approved`; work item high-risk masuk `awaiting_approval`, lalu approver dapat menyelesaikan
- [x] **5.3.4** Buat `ReviewPanel` component di detail view — form review, finding, approval, dan komentar
- [ ] **5.3.5** Multi-level review (opsional) — staff → manager → admin approve chain
- [x] **5.3.6** Review history — review findings dan approval history

### Epic 5.4 — Reports & Deliverables

- [ ] **5.4.1** Buat halaman `/reports` — list report/deliverable work items
- [ ] **5.4.2** Filter by report_type (financial_statement, tax_report, bank_reconciliation, audit_report)
- [ ] **5.4.3** Upload deliverable file — linked ke work_item
- [ ] **5.4.4** Track delivery status (draft → submitted → reviewed → approved → filed)

---

## Phase 6 — AI Integration + Refinements

**Goal**: AI assist untuk task extraction, review, dan insights.

### Epic 6.1 — AI Task Extraction

- [x] **6.1.1** Buat `src/lib/ai/openrouter-client.ts` — setup OpenRouter API client
- [x] **6.1.2** Buat prompt di `src/lib/ai/prompts.ts` — extract tasks dari WhatsApp message
- [x] **6.1.3** Worker async `POST /api/jobs/ai-extraction` — proses pesan melalui durable outbox
- [x] **6.1.4** Tampilkan suggested tasks di `/wa-inbox` — user bisa konfirmasi/tolak
- [x] **6.1.5** Confidence score per extracted task

### Epic 6.2 — AI Review Assistant

- [x] **6.2.1** Buat prompt untuk review assistance — cek completeness, flag anomalies
- [x] **6.2.2** `GET/POST /api/ai/review-assist` — kirim work item context → dapat AI suggestion
- [x] **6.2.3** Tampilkan AI suggestion di ReviewPanel — "AI Notes" section
- [x] **6.2.4** Manager bisa accept/reject AI suggestion tanpa mengubah keputusan work item otomatis

### Epic 6.3 — Dashboard Insights (AI-Powered)

- [x] **6.3.1** Buat `GET /api/ai/insights` — generate weekly summary dari agregasi deterministik
- [x] **6.3.2** Render insights card di dashboard
- [ ] **6.3.3** Natural language query — "apa yang overdue minggu ini?" → AI interpretasi + query

### Epic 6.4 — Performance & UX Refinements

- [ ] **6.4.1** Optimistic updates — UI update sebelum API response
- [x] **6.4.2** Keyboard shortcuts — navigasi cepat (N = new item, / = search)
- [x] **6.4.3** Command palette (Cmd+K) — quick action
- [ ] **6.4.4** Bulk actions — select multiple items → batch assign/status change
- [ ] **6.4.5** Advanced filtering — saved filters per user
- [ ] **6.4.6** Export data — CSV/Excel untuk work items & reports

---

## Phase 7 — Polish, UAT & Launch

**Goal**: Production-ready, tested, documented.

### Epic 7.1 — Testing

- [x] **7.1.1** Unit tests untuk state machine, assignments, due-date calculator
- [x] **7.1.2** API integration tests — authorization, malformed payload, dan tenant isolation pada route kritis
- [x] **7.1.3** E2E tests (Playwright) — unauthenticated health smoke test; authenticated flow menunggu fixture aman
- [ ] **7.1.4** Load testing — simulasi 50 concurrent users

### Epic 7.2 — Security Hardening

- [x] **7.2.1** Security audit — RLS policies, API authorization checks
- [x] **7.2.2** Input validation — schema Zod diterapkan pada route mutation berisiko tinggi
- [x] **7.2.3** Rate limiting — protect API routes dari abuse dengan limiter per-process
- [x] **7.2.4** CSP headers — Content Security Policy
- [x] **7.2.5** Dependency audit — audit selesai; remaining transitive vulnerabilities didokumentasikan dan tidak memakai breaking `--force`

### Epic 7.3 — Performance Optimization

- [x] **7.3.1** Database query optimization — perbaikan mapping query dashboard dan index AI
- [x] **7.3.2** Add missing indexes berdasarkan query patterns
- [x] **7.3.3** Implementasi pagination — list kritis sudah memiliki page/limit; WA suggestions dibuat opt-in dengan limit maksimum
- [ ] **7.3.4** Image/file optimization — compress uploads, CDN untuk static assets
- [ ] **7.3.5** Bundle size optimization — tree shaking, dynamic imports

### Epic 7.4 — Documentation & Deployment

- [ ] **7.4.1** API documentation — OpenAPI/Swagger spec
- [ ] **7.4.2** User guide — screenshot-based untuk staff & manager
- [x] **7.4.3** Setup Coolify deployment — nixpacks build/start config, production env validation, health endpoint, dan cron protection
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

## Backlog Ditunda

Item berikut sengaja belum dikerjakan dan dikumpulkan untuk fase testing, hardening, atau polish:

- **Dashboard**: 1.3.7–1.3.8 — render upcoming deadlines dan activity feed dengan data real.
- **Work Item**: 2.1.5 — unit test state machine; 2.2.9 — upload file Supabase Storage; 2.3.8 — FileAttachment; 2.3.10 — Realtime work item.
- **Notification**: 4.1.9 — Realtime notification; 4.3.4 — konfigurasi scheduled task Coolify.
- **Testing & Security**: 7.1.1–7.1.4 — unit, integration, E2E, load test; 7.2.1–7.2.5 — security hardening.
- **Performance & Release**: 7.3.3–7.3.5 dan 7.4.1–7.4.7 — pagination, optimasi asset/bundle, dokumentasi, monitoring, UAT, dan go-live.

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
2. ✅ ~~Phase 1 Epic 1.1 — Authentication~~
3. ✅ ~~Phase 1 Epic 1.2 — App Layout Shell~~
4. ✅ ~~Phase 1 Epic 1.3 — Dashboard~~
5. ✅ ~~Phase 1 Epic 1.4 — Settings & Profile Pages~~
6. 🔵 **Mulai Phase 2** — Work Item Engine (State Machine + CRUD API)
