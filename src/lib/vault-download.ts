/** Serves a document from the Cloud Vault copy when one exists, but only after re-checking its SHA-256. */
export interface VaultStore {
  readonly configured: boolean;
  get(key: string): Promise<ArrayBuffer | null>;
}

/** The real Cloud Vault while no route is configured: it never holds a copy and never opens a connection. */
export const notConfiguredVault: VaultStore = { configured: false, get: async () => null };

/** Test double. Lets tests put, tamper with and read copies with no outside connection. */
export class InMemoryVault implements VaultStore {
  readonly configured = true;
  private files = new Map<string, ArrayBuffer>();
  put(key: string, bytes: ArrayBuffer) { this.files.set(key, bytes); }
  async get(key: string) { return this.files.get(key) ?? null; }
}

export async function sha256OfBuffer(buf: ArrayBuffer): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(d)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export type DownloadResult =
  | { ok: true; from: 'cloud_vault' | 'library'; bytes: ArrayBuffer; sha256: string }
  | { ok: false; from: 'cloud_vault' | 'library'; reason: string; got: string | null };

/**
 * cloudCopy is what the database says (vault_cloud_copy_for): a verified copy exists for this hash, or null.
 * A Cloud Vault copy that fails the hash check is refused, never silently replaced.
 */
export async function downloadVerified(opts: {
  documentId: string; expectedSha256: string; cloudCopy: { sha256: string } | null;
  vault: VaultStore; fromLibrary: () => Promise<ArrayBuffer>;
}): Promise<DownloadResult> {
  const expected = opts.expectedSha256.toLowerCase();
  if (opts.cloudCopy && opts.vault.configured) {
    const bytes = await opts.vault.get(`${opts.documentId}/${expected}`);
    if (bytes) {
      const got = await sha256OfBuffer(bytes);
      if (got !== expected) return { ok: false, from: 'cloud_vault', reason: 'The Cloud Vault copy does not match its recorded SHA-256', got };
      return { ok: true, from: 'cloud_vault', bytes, sha256: got };
    }
  }
  const bytes = await opts.fromLibrary();
  const got = await sha256OfBuffer(bytes);
  if (got !== expected) return { ok: false, from: 'library', reason: 'The file does not match its recorded SHA-256', got };
  return { ok: true, from: 'library', bytes, sha256: got };
}
