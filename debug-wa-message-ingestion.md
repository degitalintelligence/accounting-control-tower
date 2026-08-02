# Debug Session: WhatsApp Message Ingestion

Status: [OPEN]
Session ID: wa-message-ingestion

## Symptom

Pesan WhatsApp belum terlihat di `acct_ctrl.wa_messages`.

## Hypotheses

1. WAHA belum mengirim webhook ke endpoint aplikasi.
2. Webhook ditolak karena `WAHA_WEBHOOK_SECRET` atau format header tidak cocok.
3. Payload pesan tidak memenuhi format yang dikenali adapter.
4. Group belum aktif/whitelisted atau provider group ID tidak cocok.
5. Insert gagal karena privilege, constraint, atau idempotency conflict.

## Evidence

Evidence collected:

- A locally submitted valid `message` webhook returned `200` but did not create a `wa_messages` row.
- The database contains both a retired and a WORKING connection with the same `ops-acctg` session.
- The webhook query selected a session by `limit(1)` without excluding retired connections, so the retired row could be selected first.
- The route also explicitly discarded `fromMe` messages, which prevented the operational number's own group messages from entering context.

## Reproduction

Kirim satu pesan baru dari nomor lain dan dari nomor operasional ke group WhatsApp yang sudah diaktifkan, lalu periksa webhook request, database, dan outbox.
