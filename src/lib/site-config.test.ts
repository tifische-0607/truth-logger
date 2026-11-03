import { describe, expect, it } from 'vitest';
import { authReturnUrl, canonicalSiteUrl, DEFAULT_SITE_URL, siteLink } from './site-config';
describe('FA Portal canonical address',()=>{
  it('uses the required production address by default',()=>expect(canonicalSiteUrl()).toBe('https://spyglass2.sentinel2.org'));
  it('allows one HTTPS server override',()=>expect(canonicalSiteUrl('https://portal.example.org/')).toBe('https://portal.example.org'));
  it('builds setup links on the canonical site',()=>expect(siteLink(DEFAULT_SITE_URL,'/invite?token=test')).toBe('https://spyglass2.sentinel2.org/invite?token=test'));
  it('rejects external redirect paths',()=>expect(()=>siteLink(DEFAULT_SITE_URL,'//other.example.org')).toThrow());
  it('returns production reset links to the canonical site',()=>expect(authReturnUrl(DEFAULT_SITE_URL,DEFAULT_SITE_URL,'/reset-password')).toBe('https://spyglass2.sentinel2.org/reset-password'));
  it('keeps preview sign-in on its current origin',()=>expect(authReturnUrl(DEFAULT_SITE_URL,'https://preview.example.org','/auth')).toBe('https://preview.example.org/auth'));
});