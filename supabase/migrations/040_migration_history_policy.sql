CREATE TABLE IF NOT EXISTS acct_ctrl.migration_history (
  filename TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  applied_by TEXT NOT NULL DEFAULT 'manual-mcp',
  checksum TEXT,
  notes TEXT
);

ALTER TABLE acct_ctrl.migration_history ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE acct_ctrl.migration_history FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON TABLE acct_ctrl.migration_history TO service_role;
