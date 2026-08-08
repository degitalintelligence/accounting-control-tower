import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import type { Database } from '../../../src/lib/supabase/types';

type LiveConfig = {
  url: string;
  anonKey: string;
  serviceRoleKey: string;
  appUrl: string;
};

type LiveFixture = LiveConfig & {
  admin: SupabaseClient<Database, 'acct_ctrl'>;
  organizationId: string;
  clientId: string;
  userId: string;
  email: string;
  password: string;
  draftId: string;
  intakeId: string;
};

const required = ['INTEGRATION_SUPABASE_URL', 'INTEGRATION_SUPABASE_ANON_KEY', 'INTEGRATION_SUPABASE_SERVICE_ROLE_KEY', 'INTEGRATION_APP_URL'] as const;

export const liveIntegrationEnabled = process.env.RUN_LIVE_INTEGRATION === 'true';

export function validateIntegrationUrl(name: string, value: string, protocols: readonly ('http:' | 'https:')[] = ['https:']) {
  try {
    const url = new URL(value);
    if (!protocols.includes(url.protocol as 'http:' | 'https:') || !url.hostname || url.username || url.password) throw new Error();
  } catch {
    throw new Error(`Environment integration invalid: ${name} harus berupa URL ${protocols.length === 1 && protocols[0] === 'https:' ? 'HTTPS' : 'HTTP/HTTPS'} yang valid.`);
  }
  return value.replace(/\/$/, '');
}

function config(): LiveConfig {
  if (!liveIntegrationEnabled) throw new Error('Live integration nonaktif. Set RUN_LIVE_INTEGRATION=true secara eksplisit.');
  if (process.env.NODE_ENV === 'production') throw new Error('Live integration dilarang berjalan dengan NODE_ENV=production.');
  if (process.env.LIVE_INTEGRATION_TARGET !== 'staging') throw new Error('Live integration hanya boleh berjalan pada target staging.');
  const missing = required.filter((name) => !process.env[name]?.trim());
  if (missing.length) throw new Error(`Environment integration kurang: ${missing.join(', ')}`);
  return {
    url: validateIntegrationUrl('INTEGRATION_SUPABASE_URL', process.env.INTEGRATION_SUPABASE_URL!),
    anonKey: process.env.INTEGRATION_SUPABASE_ANON_KEY!,
    serviceRoleKey: process.env.INTEGRATION_SUPABASE_SERVICE_ROLE_KEY!,
    appUrl: validateIntegrationUrl('INTEGRATION_APP_URL', process.env.INTEGRATION_APP_URL!, ['http:', 'https:']),
  };
}

export function getLiveConfig() {
  return config();
}

export function createLiveAdmin() {
  const live = config();
  return createClient<Database, 'acct_ctrl'>(live.url, live.serviceRoleKey, { db: { schema: 'acct_ctrl' }, auth: { autoRefreshToken: false, persistSession: false } });
}

export async function createLiveFixture(): Promise<LiveFixture> {
  const live = config();
  const admin: SupabaseClient<Database, 'acct_ctrl'> = createClient<Database, 'acct_ctrl'>(live.url, live.serviceRoleKey, { db: { schema: 'acct_ctrl' }, auth: { autoRefreshToken: false, persistSession: false } });
  const suffix = randomUUID().replaceAll('-', '').slice(0, 16);
  const email = `live-integration-${suffix}@invalid.test`;
  const password = `${randomUUID()}Aa1!`;
  const organization = await admin.from('organizations').insert({ name: `Live Integration ${suffix}`, slug: `live-integration-${suffix}` }).select('id').single();
  if (organization.error) throw organization.error;
  const user = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: `Live Integration ${suffix}` } });
  if (user.error || !user.data.user) throw user.error ?? new Error('User fixture gagal dibuat.');
  const profile = await admin.from('profiles').select('id').eq('id', user.data.user.id).single();
  if (profile.error) throw profile.error;
  const client = await admin.from('clients').insert({ organization_id: organization.data.id, name: `Live Client ${suffix}`, slug: `live-client-${suffix}` }).select('id').single();
  if (client.error) throw client.error;
  const membership = await admin.from('memberships').insert({ profile_id: user.data.user.id, organization_id: organization.data.id, role: 'admin', is_active: true }).select('id').single();
  if (membership.error) throw membership.error;
  const intake = await admin.from('ai_intake_items').insert({ organization_id: organization.data.id, client_id: client.data.id, created_by: user.data.user.id, source_text: 'integration fixture', source_kind: 'text' }).select('id').single();
  if (intake.error) throw intake.error;
  const draft = await admin.from('ai_draft_items').insert({ organization_id: organization.data.id, intake_id: intake.data.id, title: 'Live integration draft', type: 'ad_hoc', created_by: user.data.user.id, clarification_needed: true }).select('id').single();
  if (draft.error) throw draft.error;
  return { ...live, admin, organizationId: organization.data.id, clientId: client.data.id, userId: user.data.user.id, email, password, draftId: draft.data.id, intakeId: intake.data.id };
}

export async function cleanupLiveFixture(fixture: LiveFixture) {
  const workItems = await fixture.admin.from('work_items').select('id').eq('organization_id', fixture.organizationId);
  if (workItems.error) throw workItems.error;
  const workItemIds = (workItems.data ?? []).map((item) => item.id);
  if (workItemIds.length) {
    const assignments = await fixture.admin.from('assignments').delete().in('work_item_id', workItemIds);
    if (assignments.error) throw assignments.error;
  }
  const events = await fixture.admin.from('domain_events').select('id').eq('organization_id', fixture.organizationId);
  if (events.error) throw events.error;
  const eventIds = (events.data ?? []).map((event) => event.id);
  if (eventIds.length) {
    const outbox = await fixture.admin.from('outbox_events').delete().in('domain_event_id', eventIds);
    if (outbox.error) throw outbox.error;
  }
  const outbox = await fixture.admin.from('outbox_events').delete().eq('event_type', 'ai_intake_requested').contains('payload', { intake_id: fixture.intakeId });
  if (outbox.error) throw outbox.error;
  const workItemsDelete = await fixture.admin.from('work_items').delete().eq('organization_id', fixture.organizationId);
  if (workItemsDelete.error) throw workItemsDelete.error;
  const drafts = await fixture.admin.from('ai_draft_items').delete().eq('organization_id', fixture.organizationId);
  if (drafts.error) throw drafts.error;
  const intakes = await fixture.admin.from('ai_intake_items').delete().eq('organization_id', fixture.organizationId);
  if (intakes.error) throw intakes.error;
  const memberships = await fixture.admin.from('memberships').delete().eq('organization_id', fixture.organizationId);
  if (memberships.error) throw memberships.error;
  const clients = await fixture.admin.from('clients').delete().eq('organization_id', fixture.organizationId);
  if (clients.error) throw clients.error;
  const user = await fixture.admin.auth.admin.deleteUser(fixture.userId);
  if (user.error) throw user.error;
  process.emitWarning('Teardown fixture live menyisakan organization dan domain_events untuk menjaga audit trail immutable.');
}

export async function expectRpcFailure(promise: PromiseLike<{ error: { code?: string; message?: string } | null }>) {
  const result = await promise;
  if (!result.error) throw new Error('RPC seharusnya ditolak.');
  return result.error;
}
