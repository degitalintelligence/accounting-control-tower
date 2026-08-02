CREATE TABLE acct_ctrl.whatsapp_conversation_topics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES acct_ctrl.organizations(id),
  wa_group_id UUID NOT NULL REFERENCES acct_ctrl.wa_groups(id),
  topic_key TEXT NOT NULL,
  title TEXT NOT NULL,
  client_id UUID REFERENCES acct_ctrl.clients(id),
  project_id UUID REFERENCES acct_ctrl.projects(id),
  work_item_id UUID REFERENCES acct_ctrl.work_items(id),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved', 'archived')),
  first_message_at TIMESTAMPTZ,
  latest_message_at TIMESTAMPTZ,
  last_summary TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX idx_whatsapp_topics_scope_key
  ON acct_ctrl.whatsapp_conversation_topics(organization_id, wa_group_id, topic_key)
  WHERE deleted_at IS NULL;

CREATE TABLE acct_ctrl.whatsapp_message_contexts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES acct_ctrl.organizations(id),
  wa_message_id UUID NOT NULL REFERENCES acct_ctrl.wa_messages(id),
  topic_id UUID NOT NULL REFERENCES acct_ctrl.whatsapp_conversation_topics(id),
  classification TEXT NOT NULL CHECK (classification IN ('fact', 'decision', 'task', 'update', 'question', 'blocker', 'request', 'reference', 'noise')),
  confidence NUMERIC(3,2) CHECK (confidence >= 0 AND confidence <= 1),
  evidence TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_whatsapp_message_context_unique
  ON acct_ctrl.whatsapp_message_contexts(wa_message_id, topic_id, classification);

CREATE TABLE acct_ctrl.whatsapp_conversation_facts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES acct_ctrl.organizations(id),
  topic_id UUID NOT NULL REFERENCES acct_ctrl.whatsapp_conversation_topics(id),
  fact_key TEXT NOT NULL,
  fact_value TEXT NOT NULL,
  source_message_ids JSONB NOT NULL DEFAULT '[]',
  confidence NUMERIC(3,2) CHECK (confidence >= 0 AND confidence <= 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_whatsapp_facts_topic_key
  ON acct_ctrl.whatsapp_conversation_facts(topic_id, fact_key);

CREATE TABLE acct_ctrl.whatsapp_conversation_decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES acct_ctrl.organizations(id),
  topic_id UUID NOT NULL REFERENCES acct_ctrl.whatsapp_conversation_topics(id),
  title TEXT NOT NULL,
  decision_value TEXT NOT NULL,
  decided_at TIMESTAMPTZ,
  source_message_ids JSONB NOT NULL DEFAULT '[]',
  confidence NUMERIC(3,2) CHECK (confidence >= 0 AND confidence <= 1),
  requires_confirmation BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE acct_ctrl.whatsapp_conversation_topics ENABLE ROW LEVEL SECURITY;
ALTER TABLE acct_ctrl.whatsapp_message_contexts ENABLE ROW LEVEL SECURITY;
ALTER TABLE acct_ctrl.whatsapp_conversation_facts ENABLE ROW LEVEL SECURITY;
ALTER TABLE acct_ctrl.whatsapp_conversation_decisions ENABLE ROW LEVEL SECURITY;

CREATE POLICY whatsapp_topics_org_isolation ON acct_ctrl.whatsapp_conversation_topics
  FOR ALL TO authenticated USING (organization_id IN (SELECT organization_id FROM acct_ctrl.memberships WHERE profile_id = auth.uid() AND is_active))
  WITH CHECK (organization_id IN (SELECT organization_id FROM acct_ctrl.memberships WHERE profile_id = auth.uid() AND is_active));
CREATE POLICY whatsapp_contexts_org_isolation ON acct_ctrl.whatsapp_message_contexts
  FOR ALL TO authenticated USING (organization_id IN (SELECT organization_id FROM acct_ctrl.memberships WHERE profile_id = auth.uid() AND is_active))
  WITH CHECK (organization_id IN (SELECT organization_id FROM acct_ctrl.memberships WHERE profile_id = auth.uid() AND is_active));
CREATE POLICY whatsapp_facts_org_isolation ON acct_ctrl.whatsapp_conversation_facts
  FOR ALL TO authenticated USING (organization_id IN (SELECT organization_id FROM acct_ctrl.memberships WHERE profile_id = auth.uid() AND is_active))
  WITH CHECK (organization_id IN (SELECT organization_id FROM acct_ctrl.memberships WHERE profile_id = auth.uid() AND is_active));
CREATE POLICY whatsapp_decisions_org_isolation ON acct_ctrl.whatsapp_conversation_decisions
  FOR ALL TO authenticated USING (organization_id IN (SELECT organization_id FROM acct_ctrl.memberships WHERE profile_id = auth.uid() AND is_active))
  WITH CHECK (organization_id IN (SELECT organization_id FROM acct_ctrl.memberships WHERE profile_id = auth.uid() AND is_active));

GRANT USAGE ON SCHEMA acct_ctrl TO service_role;
GRANT SELECT, INSERT, UPDATE ON acct_ctrl.whatsapp_conversation_topics, acct_ctrl.whatsapp_message_contexts, acct_ctrl.whatsapp_conversation_facts, acct_ctrl.whatsapp_conversation_decisions TO service_role;
