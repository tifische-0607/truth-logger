import { describe, expect, it } from 'vitest';
import { cloudChecks, cloudConfigState, cloudWord, homeChecks } from './vault-config';
import { InMemoryVault, downloadVerified, notConfiguredVault, sha256OfBuffer } from './vault-download';

const bytes = (s: string) => new TextEncoder().encode(s).buffer as ArrayBuffer;

describe('Cloud Vault configuration', () => {
  it('direct route is Not configured until all six secrets are set', () => {
    const s = cloudConfigState('direct', { VAULT_CLOUD_HOST: 'h', VAULT_CLOUD_PORT: '5432' });
    expect(s.configured).toBe(false);
    expect(s.missing).toEqual(['VAULT_CLOUD_DATABASE', 'VAULT_CLOUD_USER', 'VAULT_CLOUD_PASSWORD', 'VAULT_CLOUD_SSLMODE']);
    expect(cloudWord(s.configured, true)).toBe('Not configured');
  });
  it('relay route needs only the relay URL and key', () => {
    expect(cloudConfigState('relay', { VAULT_CLOUD_RELAY_URL: 'https://x', VAULT_CLOUD_RELAY_KEY: 'k' }).configured).toBe(true);
    expect(cloudConfigState('relay', { VAULT_CLOUD_HOST: 'h' }).missing).toEqual(['VAULT_CLOUD_RELAY_URL', 'VAULT_CLOUD_RELAY_KEY']);
  });
  it('no check passes without being run', () => {
    expect(cloudChecks(cloudConfigState('direct', {})).every((c) => c.state === 'not_checked')).toBe(true);
    expect(homeChecks({ online: false, httpsGateway: false, lastVerifiedWrite: false, windowMinutes: 15 })[0]!.state).toBe('failed');
  });
});

describe('Downloads from the Cloud Vault copy', () => {
  const file = bytes('released report');
  it('serves the Cloud Vault copy after the SHA-256 matches', async () => {
    const sha = await sha256OfBuffer(file); const v = new InMemoryVault(); v.put(`d1/${sha}`, file);
    const r = await downloadVerified({ documentId: 'd1', expectedSha256: sha, cloudCopy: { sha256: sha }, vault: v, fromLibrary: async () => { throw new Error('not used'); } });
    expect(r.ok && r.from).toBe('cloud_vault');
  });
  it('refuses a tampered Cloud Vault copy', async () => {
    const sha = await sha256OfBuffer(file); const v = new InMemoryVault(); v.put(`d1/${sha}`, bytes('tampered'));
    const r = await downloadVerified({ documentId: 'd1', expectedSha256: sha, cloudCopy: { sha256: sha }, vault: v, fromLibrary: async () => file });
    expect(r).toMatchObject({ ok: false, from: 'cloud_vault' });
  });
  it('uses the library copy while the Cloud Vault is Not configured', async () => {
    const sha = await sha256OfBuffer(file);
    const r = await downloadVerified({ documentId: 'd1', expectedSha256: sha, cloudCopy: { sha256: sha }, vault: notConfiguredVault, fromLibrary: async () => file });
    expect(r.ok && r.from).toBe('library');
  });
  it('blocks a library file whose hash does not match', async () => {
    const r = await downloadVerified({ documentId: 'd1', expectedSha256: 'a'.repeat(64), cloudCopy: null, vault: notConfiguredVault, fromLibrary: async () => file });
    expect(r.ok).toBe(false);
  });
});
