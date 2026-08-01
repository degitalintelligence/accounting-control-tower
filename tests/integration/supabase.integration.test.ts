import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createLiveFixture, cleanupLiveFixture, expectRpcFailure, getLiveConfig, liveIntegrationEnabled } from './helpers/live-supabase';

describe.skipIf(!liveIntegrationEnabled)('Supabase live integration', () => {
  let fixture: Awaited<ReturnType<typeof createLiveFixture>>;

  beforeAll(async () => {
    fixture = await createLiveFixture();
  });

  afterAll(async () => {
    if (fixture) await cleanupLiveFixture(fixture);
  });

  it('menyediakan public health tanpa membocorkan secret', async () => {
    const response = await fetch(`${getLiveConfig().appUrl}/api/health`, { cache: 'no-store' });
    const body = await response.json() as { status?: string; checks?: { env?: string; database?: string } };
    expect([200, 503]).toContain(response.status);
    expect(body).not.toHaveProperty('secret');
    expect(body.checks).toBeDefined();
  });

  it('menolak job health tanpa CRON_SECRET', async () => {
    const response = await fetch(`${getLiveConfig().appUrl}/api/admin/job-health`, { cache: 'no-store' });
    expect([401, 403]).toContain(response.status);
  });

  it('menegakkan otorisasi RPC queue dan menyediakan claim untuk worker yang benar', async () => {
    const denied = await expectRpcFailure(fixture.admin.rpc('claim_outbox_event', { p_worker_id: 'integration-invalid', p_event_type: 'ai_intake_requested' }));
    expect(denied.message).toContain('tidak terotorisasi');
    const event = await fixture.admin.from('domain_events').insert({ organization_id: fixture.organizationId, event_type: 'ai_intake_requested', aggregate_type: 'ai_intake', aggregate_id: fixture.intakeId, payload: { organization_id: fixture.organizationId } }).select('id').single();
    expect(event.error).toBeNull();
    const outbox = await fixture.admin.from('outbox_events').insert({ organization_id: fixture.organizationId, domain_event_id: event.data!.id, event_type: 'ai_intake_requested', payload: { intake_id: fixture.intakeId, organization_id: fixture.organizationId }, status: 'pending' }).select('id').single();
    expect(outbox.error).toBeNull();
    const claimed = await fixture.admin.rpc('claim_outbox_event', { p_worker_id: 'ai-extraction-integration', p_event_type: 'ai_intake_requested', p_lease_seconds: 30 });
    expect(claimed.error).toBeNull();
    expect(claimed.data).toHaveLength(1);
  });

  it('mengonfirmasi AI secara atomic dan idempotent', async () => {
    const first = await fixture.admin.rpc('confirm_ai_draft_item', { p_draft_id: fixture.draftId, p_organization_id: fixture.organizationId, p_confirmed_by: fixture.userId, p_client_id: fixture.clientId, p_title: 'Confirmed live integration item', p_type: 'ad_hoc', p_description: 'safe fixture' });
    expect(first.error).toBeNull();
    expect(first.data).toHaveLength(1);
    const second = await fixture.admin.rpc('confirm_ai_draft_item', { p_draft_id: fixture.draftId, p_organization_id: fixture.organizationId, p_confirmed_by: fixture.userId, p_client_id: fixture.clientId, p_title: 'Changed title must not duplicate', p_type: 'ad_hoc' });
    expect(second.error).toBeNull();
    expect(second.data?.[0]?.work_item_id).toBe(first.data?.[0]?.work_item_id);
    const items = await fixture.admin.from('work_items').select('id').eq('organization_id', fixture.organizationId);
    expect(items.error).toBeNull();
    expect(items.data).toHaveLength(1);
  });
});
