<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# AGENTS.md

Panduan ini untuk AI agent (Trae, Cursor, Claude, dsb.) yang bekerja di project
**Accounting Operations Control Tower**.

## Project at a glance

- Stack: **Next.js 16 (App Router) + React 19 + TypeScript + Tailwind v4 + Shadcn UI**
- Database: Supabase Postgres 17, project ref `iqughznrpihzyorewlif`
- Database dipakai **bersama** dengan project lain (multi-tenant, multi-app)
- Schema utama project ini: `acct_ctrl`
- Schema lain yang hidup di database yang sama: `public`, `graphql_public`,
  `storage`, `webhook_router`, `lolosats`
- Deployment: Coolify (nixpacks.toml)
- GitHub: https://github.com/degitalintelligence/accounting-control-tower

## Project purpose

Sistem multi-client untuk menggerakkan, mengawasi, dan mengaudit pekerjaan tim
accounting. Mengelola empat jenis pekerjaan: **Routine**, **Project**, **Ad Hoc**,
dan **Report/Deliverable** — semuanya dengan control layer maker–checker–approver,
SOP/checklist, evidence, deadline, reminder, escalation, dan immutable audit trail.

WhatsApp menjadi operational signal layer (bukan sumber kebenaran utama) via
WAHA adapter MVP.

## Hard rules untuk database Supabase

1. **Jangan pernah** jalankan `ALTER ROLE <role> SET pgrst.db_schemas = '...'`
   dengan value yang tidak menyertakan **semua** schema yang dipakai project
   lain di database yang sama.
   - Value aman: `'public, graphql_public, storage, webhook_router, lolosats, acct_ctrl'`
   - Value bermasalah: apapun yang me-exclude salah satu schema di atas.
   - Dampak salah: project lain langsung error `PGRST106 Invalid schema: ...`
     dan tidak bisa di-fix dari Dashboard UI saja.

2. **Cara benar** mengelola exposed schemas: buka
   **Supabase Dashboard → Settings → API → Exposed Schemas** dan klik Save.
   Jangan pernah via SQL. Bisa juga via Management API PATCH
   `/v1/projects/{ref}/postgrest` dengan body `{ db_schema: "..." }`.

3. **Kalau terlanjur** (muncul `PGRST106` dan Dashboard Save tidak mempan),
   jalankan SQL ini:

   ```sql
   ALTER ROLE authenticator RESET pgrst.db_schemas;
   ALTER ROLE anon RESET pgrst.db_schemas;
   ALTER ROLE authenticated RESET pgrst.db_schemas;
   ALTER ROLE service_role RESET pgrst.db_schemas;
   NOTIFY pgrst, 'reload config';
   NOTIFY pgrst, 'reload schema';
   ```

4. Selalu baca error PostgREST apa adanya:
   - `PGRST106` = schema tidak di-expose (config level).
   - `PGRST205` = tabel tidak ada di schema cache (cache level, fix dengan
     `NOTIFY pgrst, 'reload schema';`).

5. Selalu log Supabase error sebagai `{ message, code, hint, details }` di
   Server Component, karena `PostgrestError` punya property non-enumerable dan
   akan tampil `{}` di console browser kalau di-`console.error` langsung.

6. **Selalu** set `db: { schema: 'acct_ctrl' }` saat create Supabase client.
   Schema default harus `acct_ctrl`, bukan `public`. Jangan pernah query
   langsung ke schema lain dari app ini.

## Hard rules untuk menjalankan migration

1. **Selalu** jalankan migration via **Supabase MCP** (`apply_migration`) atau
   **Supabase Management API** menggunakan `SUPABASE_ACCESS_TOKEN` (PAT) dari
   `.env.local`. Jangan pakai Supabase CLI (tidak ter-setup di project ini).

2. Format perintah via Management API (PowerShell):

   ```powershell
   $pat = "<SUPABASE_ACCESS_TOKEN dari .env.local>"
   $projectRef = "iqughznrpihzyorewlif"
   $sql = Get-Content "supabase/migrations/<nama_file>.sql" -Raw
   $body = @{ query = $sql } | ConvertTo-Json -Compress
   $headers = @{ Authorization = "Bearer $pat"; "Content-Type" = "application/json" }
   $url = "https://api.supabase.com/v1/projects/$projectRef/database/query"
   Invoke-WebRequest -Uri $url -Method Post -Headers $headers -Body $body -UseBasicParsing
   ```

3. Response sukses: **Status 201**, body `[]` (DDL tidak return rows).

4. **Selalu** taruh file migration di `supabase/migrations/` dengan format
   nama `NNN_deskripsi.sql` (incremental number, underscore, deskripsi).

5. **Jangan** jalankan migration yang mengubah schema di luar `acct_ctrl`.
   Milik kita: `acct_ctrl` saja.

6. **Partial unique index** (WHERE clause) tidak bisa inline di CREATE TABLE
   saat pakai MCP `apply_migration`. Buat tabel dulu, lalu CREATE INDEX
   terpisah.

## Hard rules untuk Row Level Security (RLS) & multi-tenancy

1. Semua tabel tenant-owned **wajib** punya kolom `organization_id` (UUID).
   Tabel yang juga client-scoped punya `client_id`.
2. RLS di-enable di **semua** tabel `acct_ctrl`. Policy wajib memfilter
   berdasarkan `organization_id` (dan `client_id` bila applicable).
3. `service_role` bypass RLS — hanya boleh dipakai di Server Component /
   API route (Node runtime). **Jangan** import admin client dari komponen client.
4. Parent dan child task harus belong ke organization/client yang sama.
5. User dari Client A **tidak boleh** bisa query, infer, download, atau
   menerima notifikasi milik Client B — baik melalui UI maupun direct API.
6. Semua tabel tenant-owned menggunakan **soft delete** (`deleted_at` nullable).
   Audit log immutable (append-only, tidak boleh dihapus/diupdate dari app).

## Hard rules untuk work item engine

1. Semua jenis pekerjaan (Routine, Project, Ad Hoc, Report) menggunakan
   satu mesin `work_items` yang sama dengan type-specific behavior.
2. Status hanya boleh berubah sesuai transition yang diizinkan server-side.
   UI tidak boleh bypass state machine.
3. Maker **tidak boleh** menjadi checker pada work item yang sama (separation
   of duties). System menolak assignment yang konflik, bukan hanya warning.
4. Checker **tidak boleh** menjadi approver pada work item yang sama bila
   policy membutuhkan tiga pihak.
5. Parent task otomatis selesai hanya jika seluruh child mandatory telah
   Approved/Completed. Progress parent dihitung dari bobot child.
6. Maksimal hierarchy depth: 3 level (parent → child → sub-child).
7. Overdue adalah computed flag dari perhitungan sistem, bukan status manual.
8. Instance recurring template immutable — edit template tidak mengubah
   instance historis, berlaku mulai effective period berikutnya.

## Hard rules untuk WhatsApp integration

1. Satu nomor WhatsApp operasional khusus dihubungkan sebagai session via
   WAHA adapter. Adapter dipisah dari domain service agar provider bisa
   diganti (Meta Groups API, dll.) tanpa mengubah core.
2. **Hanya** grup yang di-whitelist yang diproses. Default: tidak ada grup
   yang dibaca. Admin yang mengaktifkan.
3. Chat pribadi **tidak dibaca** pada MVP.
4. Message ingestion wajib **idempotent** berdasarkan provider message ID.
5. Webhook harus di-acknowledge dalam < 5 detik; heavy work (AI extraction)
   dijalankan secara asynchronous.
6. **Explicit command** (deterministic) → bisa langsung create/update task
   kalau seluruh field valid.
7. **AI-detected action** (probabilistic) → selalu buat `Suggested Task`
   atau `Suggested Update`. Untuk MVP, semua natural-language inference
   **wajib konfirmasi manusia**, berapapun confidence score-nya.
8. Identity resolution: WhatsApp participant ID/phone harus di-map ke
   verified application user. Nama ambigu → minta konfirmasi, jangan asumsi.
9. Store provenance lengkap: provider/session/group/message ID, sender
   mapping, creation mode, extracted fields, confidence, confirmed by.
10. WAHA adalah integration dependency yang bisa putus, bukan system of record.
    Jangan depend on WAHA message history sebagai database aplikasi.

## Hard rules untuk AI / LLM

1. API key AI provider (mis. OpenRouter) server-only, dari `.env.local`.
   Jangan pernah expose ke client bundle.
2. Prompt dipisah di file dedicated (mis. `src/lib/ai/prompts.ts`); jangan
   hardcode di route handler.
3. Model names di-env, bukan di source.
4. AI menyarankan; manusia tetap accountable. AI **tidak boleh** menjadi
   final approver atas pekerjaan keuangan.
5. Jangan kirim data sensitif ke AI provider tanpa trimming/truncation.
6. AI provider configuration harus support no-training/data-control terms
   yang sesuai kebutuhan client.

## Hard rules untuk notification & escalation

1. Notification menggunakan event/outbox-driven dispatcher, bukan
   fire-and-forget dari route handler.
2. Deduplication key = event + recipient + object + escalation level +
   schedule window. Jangan kirim notifikasi duplikat.
3. Reminder otomatis cancel kalau triggering condition sudah tidak true
   (mis. task sudah selesai sebelum reminder terkirim).
4. Quiet hours dan timezone per user harus dihormati.
5. Escalation ladder configurable per risk/client, bukan hardcoded.

## Hard rules untuk background jobs

1. Semua background work HARUS lewat durable queue, bukan `setTimeout` /
   `setInterval` / fire-and-forget di route handler.
2. Background jobs wajib **idempotent dan retryable**.
3. Supabase Cron hanya untuk schedule triggers, bukan sebagai sole job
   reliability mechanism.
4. Worker endpoint harus di-protect dengan `CRON_SECRET` atau equivalent.
5. Provider integrations (WA, AI, Email) diisolasi melalui queue/adapter.
6. Webhook retry dengan exponential backoff dan dead-letter queue.

## Hard rules untuk data PII & security

1. Data di `acct_ctrl` mengandung informasi bisnis sensitif (financial data,
   client info, evidence files). Treat as confidential.
2. **Jangan** pernah log konten sensitif (file content, financial figures,
   client data) ke console / log aggregator.
3. `service_role` key **hanya** boleh dipakai di Server Component / API
   route (Node runtime). Jangan import admin client dari komponen client.
4. File storage menggunakan signed, expiring access. Approved evidence
   locked dari deletion/edit.
5. PII dan secrets wajib di-redact dari logs.
6. Tidak ada production financial file yang dipakai untuk training external
   AI models secara default.
7. Retention raw WhatsApp message configurable; default recommendation
   90 hari. Deletion workflow harus ada.

## Engineering conventions

- **Theme**: Clean, Professional, Terpercaya, Exception-First Dashboard.
  Light theme (bukan dark developer theme). Ikuti prinsip LolosATS:
  - Canvas: `bg-slate-50`
  - Card: `bg-white` + `shadow-sm`
  - Text: `text-slate-900`
  - Trust accent: `text-blue-600`
  - CTA: `bg-orange-500 hover:bg-orange-600 text-white font-bold`
  - Success: `text-emerald-500`
  - Danger/overdue: `text-red-500`
  - Warning/at risk: `text-amber-500`
- Pakai `--legacy-peer-deps` saat `npm install`.
- Mobile-friendly (manager dan staff bisa akses dari mobile).
- Minimum font `text-sm`/14px.
- Pakai `nixpacks.toml` untuk build di Coolify; pastikan `package-lock.json`
  sinkron sebelum `npm ci`.
- UI Bahasa Indonesia first; data model supports future English.
- Timezone default: `Asia/Jakarta`.

## Status dan state rules

Core statuses work item:
`Draft` → `Assigned` → `In Progress` → `Submitted` → `Under Review`
→ `Approved` → `Completed` (atau `Revision Required` → `Resubmitted`)

High-risk flow adds: `Awaiting Approval` antara `Approved` (checker) dan
`Completed`.

Computed flags (bukan manual status): `Overdue`, `At Risk`, `Stale`,
`Waiting External Party`, `Escalated`.

Key rules:
- Maker tidak boleh edit submitted evidence kecuali checker reject/reopen.
- Approved → Completed otomatis kecuali ada explicit delivery step.
- Rejection wajib disertai reason dan checklist finding.
- Cancellation wajib disertai reason dan authorization.
- Perubahan due date setelah assignment di-log; setelah overdue butuh
  elevated permission.

## Database tables (44 tabel di schema `acct_ctrl`)

### Tenancy & Users
`organizations`, `clients`, `entities`, `profiles`, `memberships`,
`teams`, `team_members`, `sections`

### Work Engine
`work_items`, `assignments`, `work_item_status_history`, `task_templates`,
`template_versions`, `recurrence_rules`, `projects`, `milestones`,
`dependencies`

### Controls
`sop_templates`, `sop_versions`, `checklist_templates`, `checklist_items`,
`checklist_responses`, `evidence_requirements`, `files`, `work_item_files`,
`reviews`, `review_findings`, `approvals`, `audit_samples`, `audit_findings`

### Communications & Events
`comments`, `domain_events`, `outbox_events`, `notifications`,
`notification_deliveries`, `escalation_policies`, `escalation_instances`

### WhatsApp Integration
`integration_connections`, `wa_groups`, `wa_participant_mappings`,
`wa_messages`, `ai_extraction_runs`, `action_suggestions`

### System
`dead_letter_events`, `audit_logs`

## Hal yang harus dihindari

- **Jangan** hardcode `supabase url`, `service role key`, API keys, atau
  PAT di source code. Pakai `.env.local`.
- **Jangan** import admin/service-role client di komponen client.
- **Jangan** commit `.env.local` ke git.
- **Jangan** tulis `console.log` yang membocorkan data sensitif client,
  API keys, atau tokens.
- **Jangan** hardcode schema name di query; selalu lewat
  `db: { schema: 'acct_ctrl' }` di Supabase client.
- **Jangan** jalankan migration yang mengubah schema `public`,
  `webhook_router`, `lolosats`, atau schema milik app lain. Milik kita:
  `acct_ctrl` saja.
- **Jangan** tulis query `select('*')` ke tabel yang berisi data sensitif
  di endpoint yang return ke client.
- **Jangan** letakkan business rules hanya di UI — semua enforce server-side.
- **Jangan** panggil AI secara synchronous sebelum acknowledge WhatsApp webhook.
- **Jangan** depend on WAHA message history sebagai application database.
- **Jangan** simpan mutable progress totals tanpa recalculation path.
- **Jangan** expose Supabase service-role keys ke browser.
