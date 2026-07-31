# Product Requirements Document (PRD)

## Accounting Operations Control Tower

**Version:** 1.0  
**Date:** 1 August 2026  
**Status:** Ready for Product & Engineering Review  
**Product owner:** Dedi Setiadi  
**Primary use case:** Virtual Accounting Manager

---

## 1. Executive Summary

Accounting Operations Control Tower adalah sistem multi-client untuk menggerakkan, mengawasi, dan mengaudit pekerjaan tim accounting tanpa manager harus mengingatkan atau memeriksa setiap aktivitas secara manual.

Sistem mengelola empat jenis pekerjaan utama:

1. **Routine work** — pekerjaan berulang yang dibuat otomatis dari template.
2. **Project work** — pekerjaan dengan milestone, dependency, dan deliverable.
3. **Ad hoc work** — pekerjaan sekali jalan yang bukan project dan bukan recurring.
4. **Report/deliverable** — keluaran formal dengan versi dan approval lifecycle.

Semua jenis pekerjaan menggunakan control layer yang sama: maker, checker, optional approver, SOP/checklist, evidence, deadline, reminder, escalation, dan immutable audit trail.

WhatsApp menjadi **operational signal layer**, bukan sumber kebenaran utama. Nomor operasional dapat menjadi anggota grup yang telah di-whitelist, menerima pesan melalui webhook, mendeteksi komitmen/deadline/blocker, dan mengubahnya menjadi draft task atau update task. Task hanya langsung dibuat bila menggunakan perintah eksplisit; hasil inferensi AI harus dikonfirmasi manusia, kecuali rule tertentu telah disetujui administrator.

### Product outcome

> Sebagian besar pekerjaan selesai tepat waktu dan benar tanpa manager mengejar, mengingatkan, atau menjadi checker utama.

### North-star metric

**Autonomous Completion Rate (ACR)** = persentase work item yang selesai dan lolos kontrol tanpa intervensi manager.

Target setelah tiga siklus operasi: **≥85%**.

---

## 2. Problem Statement

Aktivitas accounting tersebar di chat, spreadsheet, file, percakapan lisan, dan ingatan manager. Akibatnya:

- Pekerjaan rutin harus diingatkan berulang kali.
- Status terlihat aktif tetapi tidak dapat dibuktikan.
- Manager menjadi bottleneck cross-check.
- Instruksi di WhatsApp mudah tenggelam.
- Blocker terlambat diketahui.
- Bukti dan versi file tidak terhubung dengan pekerjaan.
- Approval berisiko menjadi formalitas.
- Tidak ada histori utuh untuk audit performa dan SOP.

Task manager generik belum cukup karena kebutuhan accounting bukan hanya “done”, melainkan **done, evidenced, independently checked, approved when required, and auditable**.

---

## 3. Goals and Non-Goals

### 3.1 Goals

- Menghasilkan task rutin otomatis tanpa reset/hapus histori periode lama.
- Mendukung parent task dan child task untuk pekerjaan berkomponen banyak.
- Memungkinkan user berwenang membuat task, menunjuk maker, checker, dan approver.
- Menampung pekerjaan ad hoc secara terstruktur tanpa membuat project palsu.
- Menyediakan lifecycle maker–checker yang tidak dapat dilewati.
- Menghubungkan SOP, checklist, evidence, komentar, dan approval.
- Mengirim reminder/digest/escalation WhatsApp berbasis event.
- Membaca sinyal dari grup WhatsApp yang disetujui dan mengubahnya menjadi draft action.
- Memberikan exception dashboard agar manager hanya menangani penyimpangan.
- Menjaga pemisahan data antar-client dan audit trail yang utuh.

### 3.2 Non-goals MVP

- Menggantikan ERP/accounting software atau general ledger.
- Menjadi document editor atau spreadsheet editor.
- Menjadikan AI final approver atas pekerjaan keuangan.
- Membaca semua grup atau chat pribadi tanpa whitelist dan consent.
- Memahami seluruh percakapan bebas dengan akurasi 100%.
- Mengotomasi pembayaran, posting journal, atau tax filing pada MVP.
- Menjadi aplikasi chat lengkap pengganti WhatsApp.

---

## 4. Product Principles

1. **Exception over surveillance:** manager melihat masalah, bukan setiap klik tim.
2. **Evidence over claims:** progress harus lahir dari pekerjaan dan bukti, bukan angka subjektif.
3. **Human accountable:** AI menyarankan; manusia tetap accountable.
4. **One work engine:** routine, project, dan ad hoc menggunakan mesin kontrol yang sama.
5. **History is immutable:** instance periode lama tidak di-reset.
6. **Quiet automation:** digest untuk kondisi normal, pesan langsung untuk urgent/escalation.
7. **Least privilege:** akses dibatasi per organization, client, entity, dan role.
8. **Explicit source:** task dari chat selalu menyimpan asal dan metode pembuatannya.

---

## 5. Definitions and Work Taxonomy

### 5.1 Hierarchy

```text
Organization / Workspace
└── Client
    └── Entity / Company (optional)
        └── Section
            ├── Routine Work
            ├── Projects
            ├── Ad Hoc Work
            └── Reports & Deliverables
```

### 5.2 Section versus group

**Section** adalah pengelompokan utama pekerjaan dan direkomendasikan sebagai istilah UI. Contoh:

- Daily Operations
- Accounts Payable
- Accounts Receivable
- Treasury & Bank
- Tax
- Payroll
- Monthly Closing
- Reporting
- Audit & Compliance
- Projects
- Ad Hoc Requests

Section bukan workflow dan bukan parent task. Section hanya untuk navigasi, filter, permission optional, dan reporting.

**Team/Group** adalah kumpulan user untuk assignment atau notification, misalnya `AP Team` atau `Senior Checker Pool`. Jangan memakai kata “Group” untuk folder task agar tidak rancu dengan WhatsApp group dan user group.

### 5.3 Work item types

| Type | Kapan digunakan | Punya jadwal berulang | Punya milestone | Contoh |
|---|---|---:|---:|---|
| Routine | Proses berulang dengan pola tetap | Ya | Tidak wajib | Rekonsiliasi bank bulanan |
| Project | Outcome besar, finite, multi-stage | Tidak | Ya | Migrasi accounting system |
| Ad Hoc | Permintaan sekali jalan dengan scope terbatas | Tidak | Tidak | Analisis selisih invoice tertentu |
| Report | Deliverable formal dan berversi | Bisa | Tidak wajib | Monthly Management Report |

**Decision rule:** jika pekerjaan selesai sekali dan tidak membutuhkan milestone/dependency kompleks, gunakan Ad Hoc—jangan membuat project baru.

---

## 6. Parent–Child Task Model

### 6.1 Recommended model

Parent task digunakan sebagai control summary; child task digunakan untuk unit kerja yang dapat mempunyai PIC, deadline, evidence, dan review sendiri.

Contoh:

```text
Rekonsiliasi Bank — August 2026 (parent)
├── BCA Operating (child)
├── BCA Payroll (child)
├── Mandiri (child)
└── OCBC (child)
```

### 6.2 Rules

- Maksimal **3 level**: parent → child → sub-child.
- Parent dapat berupa `roll-up parent` atau `executable parent`.
- Default untuk parent rekonsiliasi adalah **roll-up parent**: tidak punya maker/evidence sendiri.
- Child dapat memiliki maker, checker, due date, SOP, evidence, dan risk level berbeda.
- Parent otomatis selesai hanya jika seluruh child mandatory telah Approved/Completed.
- Child optional tidak menahan completion parent, tetapi tetap ditampilkan.
- Parent tidak boleh manual ditandai Completed bila child mandatory belum selesai.
- Progress parent dihitung dari bobot child, bukan rata-rata persentase manual.
- Bobot default sama; admin dapat mengatur bobot total 100%.
- Bila satu child Blocked/Overdue, parent diberi health flag `At Risk` sesuai rule.
- Recurrence template dapat menggandakan parent beserta seluruh child setiap periode.
- Perubahan template tidak mengubah instance historis; berlaku mulai effective period.

### 6.3 Acceptance example

Jika 3 dari 4 bank selesai dan semua bobot sama, progress parent = 75%. Parent belum Completed. Jika child bank material overdue, parent = `At Risk` walaupun progress 75%.

---

## 7. Roles and Permissions

### 7.1 Roles

| Role | Core capability |
|---|---|
| Organization Owner | Semua client, configuration, billing, security |
| Accounting Manager | Dashboard, assignments, escalation, approval sesuai matrix |
| Client Admin | Mengelola user dan konfigurasi client sendiri |
| Team Lead | Membuat/mengatur task dalam scope tim, menerima escalation |
| Maker | Mengerjakan dan submit work item |
| Checker | Review independen, approve/reject sesuai kewenangan |
| Approver | Approval final untuk high-risk/material work |
| Auditor | Read-only + audit sampling/finding |
| Client Viewer | Melihat status/deliverable yang diizinkan |

Satu user dapat memiliki lebih dari satu role, dibatasi oleh client/entity/section.

### 7.2 Separation of duties

- Maker tidak boleh menjadi checker pada work item yang sama.
- Checker tidak boleh menjadi approver pada work item yang sama bila policy membutuhkan tiga pihak.
- Creator boleh menjadi maker bila diizinkan policy.
- Manager tidak otomatis menjadi checker.
- System menolak assignment yang konflik, bukan hanya memberi warning.
- Emergency override hanya untuk role tertentu, wajib alasan, dan masuk audit log.

### 7.3 Who can create and assign tasks

Configurable permission:

- `create_own_task`
- `create_task_for_others`
- `assign_maker`
- `assign_checker`
- `assign_approver`
- `reassign_task`
- `change_due_date`
- `waive_review`

Default recommendation:

- Maker dapat membuat task untuk dirinya sendiri.
- Team Lead ke atas dapat membuat task dan assign ke orang lain dalam scope tim.
- Checker dipilih dari eligible checker pool berdasarkan section/risk.
- User biasa boleh mengusulkan checker; sistem memvalidasi kompetensi, workload, dan conflict rule.
- Perubahan maker/checker setelah task Submitted membutuhkan alasan dan audit trail.

---

## 8. Core Workflows

### 8.1 Standard maker–checker

```text
Draft → Assigned → In Progress → Submitted → Under Review
                                      ├→ Approved → Completed
                                      └→ Revision Required → Resubmitted
```

`Overdue` adalah flag hasil perhitungan sistem, bukan status manual.

### 8.2 High-risk workflow

```text
Maker Submitted → Checker Approved → Awaiting Approval → Approved → Completed
```

### 8.3 Task creation by user

Required fields:

- Title
- Client/entity
- Section
- Type: Ad Hoc by default
- Maker
- Due date/time + timezone
- Priority/risk
- Description or acceptance criteria

Conditional fields:

- Checker required berdasarkan policy/risk.
- Approver required berdasarkan materiality/delegation matrix.
- SOP/checklist/evidence requirements.
- Parent/project/report link.
- Dependency.

System actions:

1. Validate permission and separation of duties.
2. Check assignee workload and planned leave.
3. Warn on duplicate/similar open tasks.
4. Create audit event.
5. Notify maker; notify checker only when submitted unless configured otherwise.

### 8.4 Ad hoc task

Ad Hoc adalah first-class work item, bukan “miscellaneous note”.

Use cases:

- Permintaan data mendadak dari client.
- Investigasi transaksi.
- Follow-up dokumen.
- Perbaikan file/report sekali jalan.
- Action item hasil meeting atau WhatsApp.

Ad Hoc dapat:

- Berdiri sendiri di section `Ad Hoc Requests`.
- Ditautkan ke client/entity.
- Memiliki parent/child bila scope bertambah.
- Diubah menjadi Project bila melewati threshold kompleksitas.
- Diubah menjadi Routine Template bila ternyata berulang.

Suggested conversion prompt:

- Terjadi ≥3 kali dalam 90 hari → sarankan `Convert to Routine Template`.
- Memiliki ≥8 child tasks, durasi >30 hari, atau ≥2 milestone alami → sarankan `Convert to Project`.

Conversion mempertahankan original ID, source, comments, attachments, dan audit trail.

### 8.5 Blocked task

Saat memilih Blocked, user wajib mengisi:

- Blocker category
- Penjelasan
- Pihak yang ditunggu
- Tanggal follow-up berikutnya
- Dampak deadline
- Proposed resolution

Blocked tidak otomatis menghentikan SLA. Policy menentukan apakah due date tetap berjalan, pause, atau membutuhkan approval untuk extension.

---

## 9. Routine Task Engine

### 9.1 Template fields

- Name and description
- Section/client/entity
- Recurrence rule and timezone
- Generation lead time
- Maker assignment rule
- Checker assignment rule
- Approver rule
- Parent/child blueprint
- SOP/checklist version
- Required evidence schema
- Maker deadline
- Checker deadline
- Final/client deadline
- Holiday/weekend handling
- Escalation policy
- Risk/materiality
- Effective start/end period

### 9.2 Recurrence rules

Support MVP:

- Daily/weekday
- Weekly on selected day
- Monthly by calendar date
- Monthly by business day (e.g. 3rd working day)
- Quarterly
- Yearly
- Custom RRULE-compatible schedule

### 9.3 Instance generation

- Scheduler generates immutable task instances idempotently.
- Unique key prevents duplicate generation: template + period + entity.
- Missed scheduler runs must be safely replayable.
- Template edit uses versioning and effective date.
- Holidays use client-specific calendar.
- Manual skip requires reason and authorization.

---

## 10. Project Management

Project fields:

- Objective and success criteria
- Owner and team
- Start/target date
- Milestones
- Work items and dependencies
- Deliverables
- Risk register
- Blockers/decisions
- Budgeted hours optional
- Weighted progress

Progress rules:

- Default = weighted completed/approved work.
- Milestone may require specific deliverable approval.
- A blocked critical-path item sets project `At Risk`.
- Self-reported progress may exist as commentary but not core KPI.

---

## 11. Reports and Deliverables

Lifecycle:

```text
Not Started → In Preparation → Submitted → Under Review
→ Revision → Approved → Delivered
```

Each report stores:

- Period and client/entity
- Template/version
- Maker/checker/approver
- Internal and client deadline
- File versions and checksum
- Review comments and decisions
- Approval timestamp
- Delivery evidence
- Linked source tasks

Approved evidence/version is locked. Revision after approval creates a new version and, where policy requires, a new approval cycle.

---

## 12. SOP, Checklist, Evidence, and Audit

### 12.1 SOP versioning

- SOP has owner, version, effective date, review date, and status.
- Work item references the exact SOP version used.
- Updating SOP does not rewrite historical tasks.

### 12.2 Maker checklist

Checklist dapat berupa checkbox, text, number, date, file, URL, or confirmation. Required items must be complete before Submit.

### 12.3 Checker checklist

Separate from maker checklist. Checker must record findings and decision. High-risk tasks require comment even when approved.

### 12.4 Evidence

- Required evidence types configurable.
- File metadata, uploader, timestamp, version, and checksum stored.
- Virus/malware scan before availability.
- Approved evidence locked from deletion/edit.
- Sensitive files use scoped signed access.

### 12.5 SOP audit

- Auditor selects or system samples work items.
- Ratings: Compliant, Minor, Major, Critical.
- Finding contains evidence, owner, due date, and root cause.
- Major/Critical finding automatically creates corrective-action Ad Hoc task.

---

## 13. WhatsApp Group Intelligence

### 13.1 Purpose

Menangkap action item, commitment, deadline, submission signal, dan blocker dari grup operasional tanpa menjadikan chat sebagai database utama.

### 13.2 Connection model

- Satu nomor WhatsApp operasional khusus dihubungkan sebagai session.
- Nomor dimasukkan hanya ke grup kerja yang disetujui.
- Admin memetakan `WhatsApp group ID → organization/client/entity/section`.
- Webhook menerima pesan baru; tidak melakukan polling terus-menerus.
- Message ingestion harus idempotent berdasarkan provider message ID.
- Adapter provider dipisah dari domain service agar WAHA dapat diganti dengan Meta official Groups API atau provider lain.

**MVP recommendation:** WAHA untuk pilot internal dengan operational risk diterima dan monitored. Production path harus mengevaluasi kelayakan Meta Groups API resmi. WAHA wajib diperlakukan sebagai integration dependency yang bisa putus, bukan system of record.

### 13.3 Whitelist and consent

- Default: tidak ada grup yang dibaca.
- Hanya Organization Owner/Admin dapat mengaktifkan grup.
- Grup menampilkan disclosure bahwa pesan operasional diproses untuk task management.
- Pesan dari grup non-whitelist diabaikan dan tidak disimpan sebagai content.
- Chat pribadi tidak dibaca pada MVP.
- Admin dapat pause/disconnect ingestion kapan saja.
- Retention raw message configurable; default recommendation 90 days.
- Attachments sensitif tidak diunduh otomatis kecuali rule mengizinkan.

### 13.4 Message modes

#### A. Explicit command — deterministic

Examples:

```text
@ops task Rekonsiliasi BCA Juli assign @Rina due 3 Aug checker @Andi
@ops update TASK-104 blocked menunggu rekening koran client follow-up 2 Aug
@ops submit TASK-104
@ops status TASK-104
```

Jika seluruh identity dan field tervalidasi, command dapat langsung membuat/mengubah task. Bot mengirim confirmation card dan deep link. Ambiguity menghasilkan clarification, bukan asumsi.

#### B. AI-detected action — probabilistic

Contoh pesan: “Rina tolong cek selisih BCA ini besok, nanti Andi review ya.”

Pipeline:

1. Classify: action/commitment/deadline/blocker/status/noise.
2. Extract: title, maker, checker, due date, client, source context.
3. Resolve identities against verified user mapping.
4. Detect duplicate/open related task.
5. Produce confidence score and reasons.
6. Create `Suggested Task` or `Suggested Update`.
7. Authorized human confirms/edits/rejects.

Default thresholds:

- ≥0.90 + approved deterministic rule: may auto-create, marked `AI-created`.
- 0.70–0.89: create draft suggestion requiring confirmation.
- <0.70: do not create task; optionally include in daily unresolved digest.

For MVP, recommendation is **all natural-language inference requires confirmation**, regardless of score. Auto-create may be activated later per group/use case after precision is proven.

### 13.5 Context window

- AI may use bounded preceding messages in same thread/group to interpret reference.
- Store source message IDs and minimal excerpts used for decision.
- Do not merge actions across clients/groups.
- Reply/quote relationship has priority over chronological proximity.
- Edited/deleted source messages trigger re-evaluation flag, never silently rewrite an approved task.

### 13.6 Identity resolution

- WhatsApp participant ID/phone maps to a verified application user.
- Names mentioned in chat are resolved only within mapped client/team.
- Ambiguous names require confirmation.
- Unknown participant cannot be assigned until mapped or invited.
- AI may never guess recipient identity silently.

### 13.7 Bot responses

Keep group responses minimal to avoid noise:

- Confirmation of explicit command.
- Clarification required.
- Critical escalation.
- Optional daily digest sent privately or to designated ops group.

AI suggestions should primarily appear in an in-app inbox, not reply to every detected message.

### 13.8 Task provenance

Every WhatsApp-derived task/update stores:

- Provider/session/group/message ID
- Sender mapping
- Original timestamp/timezone
- Creation mode: command, AI suggestion, or authorized rule
- Extracted fields and confidence
- Confirmed by and confirmation time
- Link to source message when supported
- Model/prompt/rule version

### 13.9 Failure handling

- Session disconnected → health alert to admin.
- Webhook retry with exponential backoff and dead-letter queue.
- Duplicate event → ignored idempotently.
- AI service unavailable → retain event for delayed processing; explicit commands use fallback parser if possible.
- Message cannot resolve client/user/date → clarification queue.
- Provider outage must not block core task application.

---

## 14. Notification, Reminder, and Escalation Engine

### 14.1 Channels

- In-app required
- WhatsApp required for MVP
- Email optional

### 14.2 Notification patterns

- Daily personal digest for normal workload.
- Immediate notification for assignment, rejection, critical blocker, and escalation.
- Checker notified when submission is ready, not for every maker update.
- Reminder cancels automatically when triggering condition is no longer true.
- Quiet hours and timezone per user.

### 14.3 Default schedule

Maker: H-3, H-1, due today, H+1 overdue.  
Checker: new submission, review due today, review overdue, resubmission.  
Escalation: configurable ladder by risk/client.

Example:

```text
Overdue 1 day → Maker
Overdue 2 days → Team Lead
Overdue 3 days → Accounting Manager
Critical/client deadline at risk → Product Owner/Designated Escalation Owner
```

### 14.4 Notification deduplication

Unique notification key = event + recipient + object + escalation level + schedule window. Retries must not create duplicate user messages.

---

## 15. Status and State Rules

Core statuses:

- Draft
- Assigned / Not Started
- In Progress
- Blocked
- Submitted
- Under Review
- Revision Required
- Awaiting Approval
- Approved
- Completed
- Cancelled

Computed flags:

- Overdue
- At Risk
- Stale
- Waiting External Party
- Escalated

Key rules:

- Maker cannot edit submitted evidence unless checker rejects/reopens.
- Approved task becomes Completed automatically unless explicit delivery step exists.
- Rejection requires reason and checklist finding.
- Cancellation requires reason and authorization.
- Due date changes after assignment are logged; after overdue they require elevated permission.

---

## 16. Dashboard and Views

### 16.1 Manager exception dashboard

- Critical overdue
- Report/client deadline at risk
- Task blocked beyond threshold
- Rejected more than twice
- Task without eligible checker
- Approval requiring manager level
- Major/critical SOP finding
- WA integration health issue
- Unconfirmed high-confidence WhatsApp actions
- Team workload imbalance

### 16.2 Team dashboard

- My work today/upcoming/overdue
- Waiting for my review
- Revision required
- Blocked/waiting external
- Daily digest

### 16.3 Views

- List/table (primary for accounting)
- Calendar
- Board by status
- Parent–child outline
- Project timeline optional phase 2
- Closing period view

Filters: client, entity, section, type, period, maker, checker, status, risk, overdue, source, SOP.

---

## 17. KPIs and Analytics

| KPI | Definition |
|---|---|
| Autonomous Completion Rate | Completed without manager intervention / eligible completed |
| On-Time Completion Rate | Completed by final deadline / completed |
| First-Pass Approval Rate | Approved on first submission / reviewed |
| Average Review Time | Submitted to checker decision |
| Overdue Aging | Days overdue by bucket |
| Rework Rate | Tasks requiring revision / reviewed |
| SOP Compliance Rate | Compliant sampled tasks / audited samples |
| Manager Intervention Count | Override/reassignment/manual chase/high-level action |
| WA Suggestion Precision | Confirmed suggestions / reviewed suggestions |
| WA Suggestion Recall proxy | Manually created chat-derived actions missed by system / sampled actions |

Do not optimize WhatsApp extraction for volume. Go-live auto-create eligibility requires precision ≥95% in a representative labeled sample and no critical misassignment.

---

## 18. Functional Requirements

Priority uses MoSCoW: Must, Should, Could.

### 18.1 Work management

- **Must:** Create/edit/view/archive work items.
- **Must:** Routine, Project, Ad Hoc, Report type.
- **Must:** Parent–child hierarchy and roll-up progress.
- **Must:** Maker/checker/approver assignments with conflict validation.
- **Must:** Status transitions enforced server-side.
- **Must:** Comments, mentions, activity history.
- **Must:** Bulk create/import recurring templates.
- **Should:** Bulk reassign/reschedule with reason.
- **Should:** Duplicate detection.
- **Could:** Time tracking.

### 18.2 Controls

- **Must:** SOP/checklist/evidence requirements.
- **Must:** Review and rejection reason.
- **Must:** Delegation/materiality matrix.
- **Must:** Immutable audit events.
- **Should:** Sampling audit and corrective action.
- **Could:** Automated spreadsheet anomaly checks.

### 18.3 WhatsApp

- **Must:** Connect one operational number/session.
- **Must:** Group whitelist and client/section mapping.
- **Must:** Receive webhook message events idempotently.
- **Must:** Parse explicit commands.
- **Must:** AI suggestion inbox with confirm/edit/reject.
- **Must:** User identity mapping and ambiguity handling.
- **Must:** Provider health monitoring and reconnect alert.
- **Should:** Media metadata and controlled download.
- **Should:** Suggested task updates/blockers.
- **Could:** Approved rule-based auto-create.

### 18.4 Notifications

- **Must:** Event-driven in-app and WhatsApp notifications.
- **Must:** Daily digest, due reminder, review reminder, escalation.
- **Must:** Cancellation/deduplication/quiet hours.
- **Should:** Per-user preferences.

---

## 19. Non-Functional Requirements

### Security and privacy

- Tenant isolation enforced with database Row Level Security and server authorization.
- Encryption in transit and at rest.
- Secret/token storage outside source code; rotation supported.
- RBAC + scoped permissions.
- Signed, expiring file access.
- Audit logs append-only from application perspective.
- Data export/deletion/retention policy per client contract.
- No production financial files used to train external AI models by default.
- AI provider configuration must support no-training/data-control terms appropriate to client requirements.
- PII and secrets redacted from logs.

### Reliability

- Core task app target availability: 99.5% MVP.
- RPO ≤24 hours, RTO ≤4 hours MVP.
- Background jobs idempotent and retryable.
- Provider integrations isolated through queue/adapter.
- Daily backup and restore drill before production go-live.

### Performance

- Standard list/dashboard p95 ≤2 seconds at agreed MVP load.
- Task mutation p95 ≤1.5 seconds excluding file upload/external provider.
- Webhook acknowledgment ≤5 seconds; heavy work asynchronous.

### Observability

- Structured logs, job status, webhook delivery, error rate, notification delivery, WA session health.
- Correlation ID from webhook through task suggestion/event.
- Alerts for queue backlog, repeated job failure, session disconnect, and scheduler miss.

### Localization

- Timezone stored explicitly; default Asia/Jakarta.
- UI Bahasa Indonesia first; data model supports future English.
- Currency/materiality rules per client/entity.

---

## 20. Suggested Technical Architecture

### 20.1 Components

- **Frontend:** Next.js
- **Backend/API:** Next.js server/API layer or separate service as scale requires
- **Database/Auth:** Supabase PostgreSQL + Supabase Auth
- **Authorization:** PostgreSQL RLS plus server-side policy checks
- **Storage:** Supabase Storage; optional Google Drive adapter later
- **Background jobs:** durable queue/worker; Supabase Cron only for schedule triggers, not as sole job reliability mechanism
- **WhatsApp adapter:** WAHA MVP; Meta Groups API adapter option
- **AI extraction service:** structured-output LLM behind a provider abstraction
- **Notifications:** event/outbox-driven dispatcher
- **Observability:** error tracking, logs, metrics, uptime checks

### 20.2 Architectural pattern

```text
UI / WhatsApp Webhook
        ↓
Application Services
        ↓
PostgreSQL + Transactional Outbox
        ↓
Workers: recurrence, AI extraction, notifications, escalation, roll-ups
        ↓
WA / Email / AI / Storage adapters
```

Use transactional outbox so database change and emitted event cannot diverge.

### 20.3 Do not do

- Do not call AI synchronously before acknowledging WhatsApp webhook.
- Do not place business rules only in UI.
- Do not expose Supabase service-role keys to browser.
- Do not depend on WAHA message history as the application database.
- Do not store mutable progress totals without a recalculation path.

---

## 21. Core Data Model

Suggested tables (names illustrative):

### Tenancy and users

- `organizations`
- `clients`
- `entities`
- `profiles`
- `memberships`
- `roles`
- `role_permissions`
- `teams`
- `team_members`

### Work

- `sections`
- `work_items`
- `work_item_relations`
- `assignments`
- `task_templates`
- `template_versions`
- `recurrence_rules`
- `projects`
- `milestones`
- `dependencies`
- `work_item_status_history`

Key `work_items` fields:

```text
id, organization_id, client_id, entity_id, section_id
type, title, description, acceptance_criteria
parent_id, project_id, milestone_id, report_id
status, priority, risk_level, weight, is_optional
start_at, due_at, review_due_at, client_due_at, timezone
source_type, source_reference_id
created_by, created_at, updated_at, completed_at
```

### Controls and files

- `sop_templates`
- `sop_versions`
- `checklist_templates`
- `checklist_items`
- `checklist_responses`
- `evidence_requirements`
- `files`
- `work_item_files`
- `reviews`
- `review_findings`
- `approvals`
- `audit_samples`
- `audit_findings`

### Communications and automation

- `comments`
- `domain_events`
- `outbox_events`
- `notifications`
- `notification_deliveries`
- `escalation_policies`
- `escalation_instances`
- `integration_connections`
- `wa_groups`
- `wa_participant_mappings`
- `wa_messages`
- `ai_extraction_runs`
- `action_suggestions`
- `dead_letter_events`
- `audit_logs`

### Constraints

- All tenant-owned tables contain `organization_id`; client data additionally contains `client_id`.
- Parent and child must belong to same organization/client.
- No cyclic parent or dependency graph.
- Unique provider message ID per connection.
- One active assignment per role type unless multi-maker explicitly supported later.
- Approval/review decision is append-only; correction creates another decision event.
- Soft delete for business objects; immutable audit log remains.

---

## 22. API Surface (Illustrative)

```text
POST   /api/work-items
GET    /api/work-items
GET    /api/work-items/:id
PATCH  /api/work-items/:id
POST   /api/work-items/:id/start
POST   /api/work-items/:id/block
POST   /api/work-items/:id/submit
POST   /api/work-items/:id/reviews
POST   /api/work-items/:id/approvals
POST   /api/work-items/:id/reassign

POST   /api/task-templates
POST   /api/task-templates/:id/versions
POST   /api/task-templates/:id/generate

POST   /api/integrations/whatsapp/webhook/:connectionId
POST   /api/wa-groups/:id/activate
POST   /api/action-suggestions/:id/confirm
POST   /api/action-suggestions/:id/reject
PATCH  /api/action-suggestions/:id
```

Every mutation validates auth, tenant scope, permission, state transition, separation of duties, and idempotency where relevant.

---

## 23. Key Automation Rules

```text
WHEN recurring generation window arrives
THEN create period instances idempotently

WHEN task is submitted
THEN lock maker submission AND notify checker

WHEN checker rejects
THEN create revision cycle AND notify maker

WHEN all mandatory child items complete
THEN complete roll-up parent

WHEN mandatory child becomes critical overdue
THEN mark parent at-risk AND evaluate escalation

WHEN task is overdue 24h
THEN issue configured escalation level

WHEN WhatsApp explicit command is valid
THEN create/update task AND send compact confirmation

WHEN natural-language action is detected
THEN create suggestion with source and confidence

WHEN suggestion is confirmed
THEN create task in one transaction AND mark suggestion confirmed

WHEN critical audit finding is created
THEN create corrective-action Ad Hoc task

WHEN same ad hoc pattern repeats ≥3 times/90 days
THEN suggest conversion to routine template
```

---

## 24. Detailed Acceptance Criteria for MVP

### AC-01 Routine parent–child generation

Given a monthly Bank Reconciliation template with four bank children, when August generation runs twice, exactly one parent and four children are created for August. Historical July items are unchanged.

### AC-02 Roll-up

Given four equally weighted mandatory children, when three are completed, parent displays 75% and cannot be completed manually. When the fourth is approved, parent completes automatically.

### AC-03 Assignment conflict

Given Rina is maker, when creator selects Rina as checker, API rejects assignment with a clear separation-of-duties error.

### AC-04 Ad hoc task

Authorized Team Lead can create a non-project, non-recurring Ad Hoc task, assign maker/checker, attach acceptance criteria, and track it through approval without creating a project/template.

### AC-05 Submit gate

Maker cannot submit until all required checklist responses and evidence are present. Server enforces this even if UI validation is bypassed.

### AC-06 Review

Checker can approve or reject. Rejection requires reason and creates a revision cycle. Maker is notified once.

### AC-07 WhatsApp whitelist

Message from active whitelisted group is ingested. Message from non-whitelisted group does not create stored message content or suggestion.

### AC-08 Explicit WhatsApp command

Valid command with mapped client/user/date creates one task and one confirmation. Retried duplicate webhook creates no duplicate task.

### AC-09 AI suggestion

Natural-language action creates a suggestion, not an active task. Confirmation screen shows extracted fields and source. On confirm, exactly one task is created and linked to the source.

### AC-10 Ambiguous identity

If two eligible users share the same mentioned name, system does not assign either and requests/queues clarification.

### AC-11 Reminder stop

If a task completes before scheduled reminder dispatch, the reminder is cancelled and no WhatsApp message is sent.

### AC-12 Tenant isolation

User of Client A cannot query, infer, download, or receive notification content belonging to Client B through UI or direct API request.

### AC-13 Audit trail

Creation, assignment, due-date edit, submission, evidence version, review, approval, override, and WhatsApp-derived creation each produce attributable timestamped audit events.

### AC-14 Integration outage

If WhatsApp is disconnected, core work management remains available and admin receives health alert. Pending outbound notifications are retried according to policy.

---

## 25. MVP Scope and Delivery Roadmap

### Phase 0 — Process design (1–2 weeks)

- Select one pilot client and monthly-closing process.
- Map 20–30 tasks, makers, checkers, evidence, deadlines, dependencies.
- Define roles, escalation ladder, group consent, and retention policy.
- Label representative WhatsApp messages for command/action/noise evaluation.

Exit: approved workflow map and test dataset.

### Phase 1 — Operational MVP (6–10 weeks)

- Auth, multi-client isolation, RBAC.
- Sections and work item engine.
- Routine templates and parent–child generation.
- Ad Hoc and Project basics.
- Maker–checker–approver.
- Checklist, evidence, comments, audit log.
- In-app dashboard.
- Reminder/digest/escalation.
- WAHA adapter, whitelist, explicit commands, suggestion inbox.
- Monitoring, backup, and basic admin.

Exit: one full closing cycle operated without manual chasing outside defined exceptions.

### Phase 2 — Accounting Control (4–8 weeks)

- Report lifecycle/versioning.
- SOP audit and corrective actions.
- Workload/capacity planning.
- Closing calendar and client portal.
- Advanced analytics and delegation matrix.
- Evaluate/switch to official Meta Groups API if eligible.

### Phase 3 — Intelligence (incremental)

- File completeness checks.
- Anomaly suggestions.
- Risk prediction and bottleneck detection.
- Approved-rule WhatsApp auto-create.
- Auto-summary and recommended reassignment.

---

## 26. Go-Live Checklist

- RLS/authorization penetration tests pass.
- Maker–checker conflict tests pass.
- Scheduler replay/idempotency tests pass.
- Backup restoration demonstrated.
- Notification deduplication and quiet hours tested.
- WhatsApp disconnect/reconnect runbook tested.
- Group consent/disclosure completed.
- Retention and data-processing terms approved per client.
- AI suggestion evaluation completed on representative messages.
- No natural-language auto-create enabled in initial production.
- Pilot owners and escalation recipients trained.
- Exit/rollback plan documented.

---

## 27. Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| WAHA session break/ban/change | Missed messages/reminders | Dedicated number, health checks, adapter pattern, official API migration path |
| AI misreads informal chat | Wrong task/assignee/deadline | Draft-first, confidence, explicit confirmation, source visibility |
| Chat surveillance concern | Trust/privacy damage | Whitelist, disclosure, minimal retention, role control, no private chats |
| Reminder fatigue | Users ignore system | Digest by default, immediate only for urgent, dedupe/quiet hours |
| Checker rubber-stamps | False control | Separate checklist, evidence, review log, sampling audit, KPI |
| Fake progress | Misleading dashboard | Evidence/status/weighted roll-up, no self-reported core progress |
| Manager remains bottleneck | Goal failure | Delegation matrix, checker pools, exception-only dashboard |
| Over-complex hierarchy | Poor adoption | Max 3 levels, clear section/type decision rules |
| Template changes corrupt history | Audit failure | Versioned templates with effective dates |
| Cross-client data leak | Severe confidentiality breach | Tenant RLS, scoped storage, automated isolation tests |
| Too much raw chat retained | Security/legal exposure | Minimal bounded storage, configurable retention, deletion workflow |

---

## 28. Product Decisions Locked for MVP

1. UI term is **Section** for work categorization; **Team** for user grouping.
2. All work uses a common `work_item` engine with type-specific behavior.
3. Ad Hoc is a first-class type for non-project/non-recurring work.
4. Parent–child maximum depth is three levels.
5. Recurring templates generate new immutable instances per period.
6. Maker, checker, and approver are separate assignment roles.
7. Overdue is a computed flag, not a manual status.
8. Natural-language WhatsApp detection creates draft suggestions in MVP.
9. Explicit valid commands may create/update tasks directly.
10. Only whitelisted work groups are ingested; private chats are excluded.
11. WA provider uses adapter architecture; WAHA is MVP option, not permanent system of record.
12. Manager dashboard is exception-first.

---

## 29. Open Decisions Before Sprint Planning

These decisions do not block PRD review but must be resolved before implementation:

1. Pilot organization/client/entity and exact closing calendar.
2. Number of users, clients, and expected monthly work-item volume.
3. Which roles may create tasks for others and change due dates.
4. Materiality thresholds requiring approver.
5. Default WhatsApp raw-message retention and client consent wording.
6. Whether attachments from WhatsApp may be downloaded and stored.
7. WhatsApp provider for pilot: WAHA engine/version and hosting ownership, or Meta eligibility assessment.
8. File storage: Supabase-only or Google Drive integration in phase 1.
9. Required audit/compliance standards and data residency constraints.
10. Whether clients receive portal access in MVP or phase 2.

---

## 30. Developer Definition of Done

A feature is Done only when:

- Acceptance criteria and negative permission cases pass.
- State transition and tenant isolation are enforced server-side.
- Audit event is emitted for material mutation.
- Idempotency/retry behavior is tested where asynchronous.
- Loading, empty, error, and permission-denied states exist.
- Logs contain correlation IDs without sensitive message/file content.
- Unit/integration tests cover business-critical rules.
- Product documentation and admin configuration are updated.
- Migration and rollback are documented.

---

## Appendix A — Example: Monthly Bank Reconciliation

**Parent:** Bank Reconciliation — August 2026  
**Section:** Treasury & Bank  
**Type:** Routine  
**Final deadline:** 4 September 2026, 17:00 WIB

Children:

| Child | Maker | Checker | Maker due | Review due | Required evidence |
|---|---|---|---|---|---|
| BCA Operating | Staff A | Senior B | 3 Sep 12:00 | 4 Sep 12:00 | Statement, recon file, ending balance |
| BCA Payroll | Staff C | Senior B | 3 Sep 12:00 | 4 Sep 12:00 | Statement, recon file, ending balance |
| Mandiri | Staff A | Senior C | 3 Sep 12:00 | 4 Sep 12:00 | Statement, recon file, ending balance |
| OCBC | Staff D | Senior C | 3 Sep 12:00 | 4 Sep 12:00 | Statement, recon file, ending balance |

Parent progress rolls up from approved children. A material unreconciled difference sets child Blocked/At Risk and escalates according to policy.

## Appendix B — Example: WhatsApp-to-Task

Source message:

> “Rina, besok tolong investigasi selisih invoice vendor ABC Rp12 juta. Andi review sebelum Jumat ya.”

Suggested extraction:

- Type: Ad Hoc
- Title: Investigate vendor ABC invoice variance
- Maker: Rina (verified mapping required)
- Checker: Andi (verified mapping required)
- Amount/materiality: IDR 12,000,000
- Maker due: tomorrow in group/client timezone
- Review/final due: Friday; exact date shown before confirmation
- Client/entity: inherited from whitelisted group mapping
- Source: linked WhatsApp message
- State: Suggested, not active

Confirmation owner must verify ambiguous dates and assignment before creation.

## Appendix C — Recommended MVP Success Test

Run one full monthly close and compare against the previous cycle:

- Manual reminders sent by manager
- Manager checker interventions
- On-time completion
- First-pass approval
- Average review time
- Critical tasks missed
- WhatsApp suggestions confirmed/rejected/missed

MVP succeeds when the system completes the cycle with materially fewer manual chases, no cross-client leak, no critical missed task caused by automation, and an initial ACR of at least 70% with a credible path to ≥85%.
