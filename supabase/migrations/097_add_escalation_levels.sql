-- migration 097: Add new escalation levels to enum
-- Note: This must be committed before the new values can be used in DML.

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON e.enumtypid = t.oid WHERE t.typname = 'escalation_level' AND e.enumlabel = 'team_leader') THEN
        ALTER TYPE acct_ctrl.escalation_level ADD VALUE 'team_leader';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON e.enumtypid = t.oid WHERE t.typname = 'escalation_level' AND e.enumlabel = 'administrator') THEN
        ALTER TYPE acct_ctrl.escalation_level ADD VALUE 'administrator';
    END IF;
END
$$;
