import { describe, expect, it } from 'vitest';
import { DARKNIGHT_UNAVAILABLE, fetchHomeFile, libraryFileUrl } from './library-home';
import { sha256OfBuffer } from './vault-download';

const bytes = new TextEncoder().encode('report body').buffer as ArrayBuffer;
const fake = (impl: () => Promise<Response>) => (async () => impl()) as unknown as typeof fetch;

describe('U3 live DarkNight downloads', () => {
  it('shows the agreed message when DarkNight is unreachable', async () => {
    const sha = await sha256OfBuffer(bytes);
    const r = await fetchHomeFile({ gateway_url: 'https://dn.example', path: 'a/b.pdf', sha256: sha, file_name: 'b.pdf' }, 't', fake(() => Promise.reject(new TypeError('network'))));
    expect(r).toEqual({ ok: false, unavailable: true, message: 'Temporarily unavailable, please try again later' });
  });
  it('treats a gateway error status as unavailable', async () => {
    const r = await fetchHomeFile({ gateway_url: 'https://dn.example', path: 'a.pdf', sha256: 'a'.repeat(64), file_name: null }, 't', fake(async () => new Response('x', { status: 503 })));
    expect(r.ok).toBe(false); if (!r.ok) expect(r.message).toBe(DARKNIGHT_UNAVAILABLE);
  });
  it('treats a missing gateway as unavailable', async () => {
    const r = await fetchHomeFile({ gateway_url: null, path: 'a.pdf', sha256: 'a'.repeat(64), file_name: null }, 't');
    expect(r.ok).toBe(false);
  });
  it('re-checks the hash and refuses a mismatch', async () => {
    const r = await fetchHomeFile({ gateway_url: 'https://dn.example', path: 'a.pdf', sha256: 'a'.repeat(64), file_name: null }, 't', fake(async () => new Response(bytes)));
    expect(r.ok).toBe(false); if (!r.ok) expect(r.unavailable).toBe(false);
  });
  it('accepts a matching file', async () => {
    const sha = await sha256OfBuffer(bytes);
    const r = await fetchHomeFile({ gateway_url: 'https://dn.example', path: 'a.pdf', sha256: sha, file_name: 'a.pdf' }, 't', fake(async () => new Response(bytes)));
    expect(r.ok).toBe(true);
  });
  it('refuses unsafe paths and non-HTTPS gateways', () => {
    expect(() => libraryFileUrl('https://dn.example', '../etc')).toThrow();
    expect(() => libraryFileUrl('http://dn.example', 'a.pdf')).toThrow();
    expect(libraryFileUrl('https://dn.example/', 'CASE-1/a b.pdf'.replace(' ', '_'))).toBe('https://dn.example/v1/library/CASE-1/a_b.pdf');
  });
});
