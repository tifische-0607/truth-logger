import { describe, expect, it } from 'vitest';
import { canOpen, portalTabsFor, staffScreenFor, type AccessMenu } from './access-levels';

const menu = (screens: string[], status: 'active' | 'inactive' = 'active'): AccessMenu => ({ level: null, status, roles: [], screens });

describe('access levels', () => {
  it('maps SuperAdmin-only screens to their own keys', () => {
    expect(staffScreenFor('/users-access')).toBe('users_access');
    expect(staffScreenFor('/vaults')).toBe('vaults');
    expect(staffScreenFor('/connectors')).toBe('connectors');
    expect(staffScreenFor('/executive-agent')).toBe('executive_agent');
  });
  it('refuses a screen the menu does not include', () => {
    expect(canOpen(menu(['dashboard']), 'vaults')).toBe(false);
    expect(canOpen(menu(['vaults']), 'vaults')).toBe(true);
  });
  it('an inactive login opens nothing', () => {
    expect(canOpen(menu(['dashboard'], 'inactive'), 'dashboard')).toBe(false);
  });
  it('Members get Reports, Notices and Account only', () => {
    const tabs = portalTabsFor(menu(['portal_reports', 'portal_notices', 'account']), false).map(t => t.label);
    expect(tabs).toEqual(['Reports', 'Notices', 'Account']);
  });
  it('Client Staff do not get Team, Pricing or Billing', () => {
    const tabs = portalTabsFor(menu(['portal_dashboard', 'portal_reports', 'portal_engagements', 'portal_notices', 'account']), false).map(t => t.tab);
    expect(tabs).not.toContain('Administration');
    expect(tabs).not.toContain('Billing');
    expect(tabs).not.toContain('Pricing');
  });
});
