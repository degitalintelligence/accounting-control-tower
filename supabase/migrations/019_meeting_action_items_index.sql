CREATE INDEX IF NOT EXISTS idx_ai_drafts_meeting_status ON acct_ctrl.ai_draft_items(meeting_id, status, created_at DESC);
