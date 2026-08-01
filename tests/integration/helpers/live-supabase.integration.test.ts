import { describe, expect, it } from 'vitest';
import { validateIntegrationUrl } from './live-supabase';

describe('live Supabase URL validation', () => {
  it('menerima URL Supabase HTTPS tanpa mengubah nilainya selain trailing slash', () => {
    expect(validateIntegrationUrl('INTEGRATION_SUPABASE_URL', 'https://example.supabase.co/')).toBe('https://example.supabase.co');
  });

  it('menolak URL invalid tanpa menampilkan nilainya', () => {
    expect(() => validateIntegrationUrl('INTEGRATION_SUPABASE_URL', 'not-a-url')).toThrow('INTEGRATION_SUPABASE_URL');
    expect(() => validateIntegrationUrl('INTEGRATION_SUPABASE_URL', 'not-a-url')).not.toThrow('not-a-url');
  });

  it('menerima app URL HTTP maupun HTTPS', () => {
    expect(validateIntegrationUrl('INTEGRATION_APP_URL', 'http://localhost:3000', ['http:', 'https:'])).toBe('http://localhost:3000');
    expect(validateIntegrationUrl('INTEGRATION_APP_URL', 'https://staging.example.com', ['http:', 'https:'])).toBe('https://staging.example.com');
  });
});
