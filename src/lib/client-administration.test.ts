import { describe, it, expect } from 'vitest';
import { clientDetailsSchema } from './client-administration';
const details = { name: 'Client', display_name: '', kind: 'organization', legal_name: '', sector: '', contact_name: '', contact_email: '', phone: '', time_zone: '', notes: '', database_name: '', database_schema: '', database_url: '' };
describe('client database references', () => {
  it('rejects credential-bearing or insecure database links', () => {
    for (const database_url of ['postgres://user:password@host/db', 'https://user:password@host', 'http://host', 'https://host?token=secret', 'https://host#secret']) expect(clientDetailsSchema.safeParse({ ...details, database_url }).success).toBe(false);
    expect(clientDetailsSchema.safeParse({ ...details, database_url: 'https://vault.example.org' }).success).toBe(true);
  });
  it('keeps unconfigured database references valid', () => { expect(clientDetailsSchema.safeParse(details).success).toBe(true); });
});