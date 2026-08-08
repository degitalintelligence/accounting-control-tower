-- migration 098: Update existing data to use standardized escalation levels

-- 1. Update existing data in escalation_instances
UPDATE acct_ctrl.escalation_instances
SET current_level = 'team_leader'
WHERE current_level::text IN ('team_lead', 'accounting_manager');

