ALTER TABLE acct_ctrl.meeting_attachments ADD COLUMN IF NOT EXISTS storage_path TEXT;
ALTER TABLE acct_ctrl.meeting_attachments ADD COLUMN IF NOT EXISTS size_bytes BIGINT;
ALTER TABLE acct_ctrl.meeting_attachments ADD COLUMN IF NOT EXISTS checksum TEXT;
