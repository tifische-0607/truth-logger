import { sha256OfBuffer } from './vault-download';
import { DARKNIGHT_UNAVAILABLE } from './library-home';

/** U3 contract (docs/vault/u3-evidence-move-gateway-contract.md). Pure helpers: no Supabase, no storage. */
export const DARKNIGHT_NOT_CONNECTED = 'DarkNight gateway not connected';
export const NOT_YET_MOVED = 'Not yet moved';
export { DARKNIGHT_UNAVAILABLE };

export type Area = 'evidence' | 'outputs' | 'evidence-move/receive';

export function darknightUrl(gatewayUrl: string, area: Area, path?: string): string {
  const url = new URL(gatewayUrl);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) throw new Error('Gateway must be a clean HTTPS address');
  const base = `${url.href.replace(/\/$/, '')}/v1/${area}`;
  if (path === undefined) return base;
  if (!/^[A-Za-z0-9][A-Za-z0-9._/@-]*$/.test(path) || path.includes('..') || path.includes('//')) throw new Error('Invalid DarkNight path');
  return `${base}/${path.split('/').map(encodeURIComponent).join('/')}`;
}

const opts = (token: string, init: RequestInit = {}): RequestInit => ({
  ...init, headers: { Authorization: `Bearer ${token}`, ...(init.headers ?? {}) },
  credentials: 'omit', redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(60_000),
});

export type LiveRead =
  | { ok: true; bytes: ArrayBuffer; sha256: string }
  | { ok: false; unavailable: boolean; message: string; got?: string };

/** GET a file live from DarkNight and re-check its SHA-256. Nothing is cached or stored. */
export async function readLive(gatewayUrl: string | null, area: 'evidence' | 'outputs', path: string, expectedSha256: string, token: string, fetcher: typeof fetch = fetch): Promise<LiveRead> {
  if (!gatewayUrl) return { ok: false, unavailable: true, message: DARKNIGHT_UNAVAILABLE };
  let res: Response;
  try { res = await fetcher(darknightUrl(gatewayUrl, area, path), opts(token)); } catch { return { ok: false, unavailable: true, message: DARKNIGHT_UNAVAILABLE }; }
  if (!res.ok) return { ok: false, unavailable: true, message: DARKNIGHT_UNAVAILABLE };
  const bytes = await res.arrayBuffer();
  const got = await sha256OfBuffer(bytes);
  if (got !== expectedSha256.toLowerCase()) return { ok: false, unavailable: false, got, message: 'Blocked: the DarkNight file does not match its recorded SHA-256.' };
  return { ok: true, bytes, sha256: got };
}

/** PUT an engagement output to DarkNight; DarkNight re-hashes and must report the same SHA-256. */
export async function writeOutput(gatewayUrl: string | null, path: string, bytes: Blob, sha256: string, token: string, fetcher: typeof fetch = fetch): Promise<{ ok: true } | { ok: false; message: string }> {
  if (!gatewayUrl) return { ok: false, message: DARKNIGHT_UNAVAILABLE };
  let res: Response;
  try {
    res = await fetcher(darknightUrl(gatewayUrl, 'outputs', path), opts(token, {
      method: 'PUT', body: bytes, headers: { 'Content-Type': bytes.type || 'application/octet-stream', 'X-Expected-SHA256': sha256 },
    }));
  } catch { return { ok: false, message: DARKNIGHT_UNAVAILABLE }; }
  if (res.status === 409) return { ok: false, message: 'DarkNight already holds a different file at this location; nothing was overwritten.' };
  if (!res.ok) return { ok: false, message: DARKNIGHT_UNAVAILABLE };
  const body = (await res.json().catch(() => ({}))) as { sha256?: string };
  if ((body.sha256 ?? '').toLowerCase() !== sha256.toLowerCase()) return { ok: false, message: 'DarkNight re-hashed the output and it does not match. It was not recorded.' };
  return { ok: true };
}

/** Ask DarkNight to receive one artefact: it pulls the file from a short-lived link, re-hashes it and reports. */
export async function requestReceive(gatewayUrl: string, body: { path: string; source_url: string; expected_sha256: string | null }, token: string, fetcher: typeof fetch = fetch):
  Promise<{ ok: true; sha256: string; path: string } | { ok: false; unavailable: true }> {
  try {
    const res = await fetcher(darknightUrl(gatewayUrl, 'evidence-move/receive'), opts(token, {
      method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' },
    }));
    if (!res.ok) return { ok: false, unavailable: true };
    const j = (await res.json()) as { sha256?: string; path?: string };
    if (!j.sha256 || j.path !== body.path) return { ok: false, unavailable: true };
    return { ok: true, sha256: j.sha256.toLowerCase(), path: j.path };
  } catch { return { ok: false, unavailable: true }; }
}

export type Pending = { artefact_id: string; storage_path: string; sha256: string | null; filename: string };
export type MoveDeps = {
  gatewayUrl: string; runId: string; token: string; pending: Pending[]; fetcher?: typeof fetch;
  /** Short-lived read-only link to the cloud original (never changes it). */
  signSource: (path: string) => Promise<string>;
  /** Database decides the outcome; returns 'verified' | 'mismatch' | 'unavailable'. */
  record: (r: { run: string; artefact: string; path: string; got: string | null; unavailable: boolean }) => Promise<string>;
  progress?: (done: number, total: number) => void;
};
export type MoveResult = { verified: number; unavailable: number; stoppedBy: Pending | null };

/** Runs the move one artefact at a time. The first mismatch stops everything at once. */
export async function runEvidenceMove(d: MoveDeps): Promise<MoveResult> {
  let verified = 0, unavailable = 0, i = 0;
  for (const a of d.pending) {
    const source = await d.signSource(a.storage_path);
    const r = await requestReceive(d.gatewayUrl, { path: a.storage_path, source_url: source, expected_sha256: a.sha256 }, d.token, d.fetcher);
    const outcome = await d.record({ run: d.runId, artefact: a.artefact_id, path: a.storage_path, got: r.ok ? r.sha256 : null, unavailable: !r.ok });
    if (outcome === 'mismatch') return { verified, unavailable, stoppedBy: a };
    if (outcome === 'verified') verified++; else unavailable++;
    d.progress?.(++i, d.pending.length);
  }
  return { verified, unavailable, stoppedBy: null };
}

export type ReadLocation = { artefact_id: string; sha256: string | null; moved: boolean; gateway_url: string | null; darknight_path: string | null } | null;
export type ArtefactRead =
  | { ok: true; from: 'darknight' | 'cloud'; bytes: ArrayBuffer }
  | { ok: false; from: 'darknight' | 'cloud'; message: string };

/** Unverified artefacts keep reading from the cloud; verified ones only from DarkNight, re-checked. */
export async function readArtefactWith(loc: ReadLocation, path: string, token: string, cloud: (p: string) => Promise<ArrayBuffer>, fetcher: typeof fetch = fetch): Promise<ArtefactRead> {
  if (loc?.moved) {
    if (!loc.sha256) return { ok: false, from: 'darknight', message: DARKNIGHT_UNAVAILABLE };
    const r = await readLive(loc.gateway_url, 'evidence', loc.darknight_path ?? path, loc.sha256, token, fetcher);
    return r.ok ? { ok: true, from: 'darknight', bytes: r.bytes } : { ok: false, from: 'darknight', message: r.message };
  }
  try { return { ok: true, from: 'cloud', bytes: await cloud(path) }; }
  catch (e) { return { ok: false, from: 'cloud', message: e instanceof Error ? e.message : 'File not available' }; }
}

/** Hash-qualified DarkNight path for an engagement output. */
export const outputHomePath = (projectId: string, outputId: string, sha256: string, fileName: string) =>
  `projects/${projectId}/outputs/${outputId}/${sha256}/${fileName.replace(/[^A-Za-z0-9._-]+/g, '_')}`;

/** Test double for the gateway contract: in memory, no outside connection. */
export class FakeDarkNight {
  files = new Map<string, Uint8Array>();
  online = true;
  tamper = new Set<string>();
  constructor(private source: (url: string) => Uint8Array | undefined = () => undefined) {}
  fetch: typeof fetch = async (input, init) => {
    if (!this.online) throw new TypeError('Failed to fetch');
    const u = new URL(String(input));
    const m = u.pathname.match(/^\/v1\/(evidence-move\/receive|evidence|outputs)(?:\/(.*))?$/);
    if (!m) return new Response('not found', { status: 404 });
    const path = m[2] ? m[2].split('/').map(decodeURIComponent).join('/') : '';
    const hash = async (b: Uint8Array) => sha256OfBuffer(b.slice().buffer);
    if (m[1] === 'evidence-move/receive') {
      const body = JSON.parse(String(init?.body)) as { path: string; source_url: string };
      const src = this.source(body.source_url);
      if (!src) return new Response('source unreadable', { status: 502 });
      const stored = this.tamper.has(body.path) ? new Uint8Array([...src, 0]) : src;
      if (!this.files.has(`evidence/${body.path}`)) this.files.set(`evidence/${body.path}`, stored);
      return Response.json({ path: body.path, sha256: await hash(this.files.get(`evidence/${body.path}`)!) });
    }
    const key = `${m[1]}/${path}`;
    if (init?.method === 'PUT') {
      const b = new Uint8Array(await new Response(init.body).arrayBuffer());
      if (this.files.has(key)) return new Response('exists', { status: 409 });
      this.files.set(key, b);
      return Response.json({ path, sha256: await hash(b) });
    }
    const f = this.files.get(key);
    return f ? new Response(f.slice().buffer) : new Response('not found', { status: 404 });
  };
}
