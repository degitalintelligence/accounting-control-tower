DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'work_items_project_id_fkey'
      AND conrelid = 'acct_ctrl.work_items'::regclass
  ) THEN
    ALTER TABLE acct_ctrl.work_items DROP CONSTRAINT work_items_project_id_fkey;
  END IF;
END $$;

ALTER TABLE acct_ctrl.work_items
  ADD CONSTRAINT work_items_project_id_fkey
  FOREIGN KEY (project_id) REFERENCES acct_ctrl.projects(id);
