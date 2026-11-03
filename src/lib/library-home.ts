import { sha256OfBuffer } from './vault-download';

/** Shown whenever DarkNight cannot be reached. Exact wording agreed for U3. */
export const DARKNIGHT_UNAVAILABLE = 'Temporarily unavailable, please try again later';

export type HomeFile = { gateway_url: string | null; path: string; sha256: string; file_name: string | null };
export type HomeDownload =
  | { ok: true; bytes: ArrayBuffer; sha256: string; fileName: string }
  | { ok: false; unavailable: true; message: string }
  | { ok: false; unavailable: false; got: string; message: string };

/** Gateway contract: GET {gateway}/v1/library/{path}, bearer token, no redirects. */
export function libraryFileUrl(gatewayUrl: string, path: string): string {
  const url = new URL(gatewayUrl);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) throw new Error('Gateway must be a clean HTTPS address');
  if (!/^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(path) || path.includes('..') || path.includes('//')) throw new Error('Invalid DarkNight path');
  return `${url.href.replace(/\/$/, '')}/v1/library/${path.split('/').map(encodeURIComponent).join('/')}`;
}

/** Fetches a library file live from DarkNight and re-checks its SHA-256. Nothing is cached or stored. */
export async function fetchHomeFile(file: HomeFile, token: string, fetcher: typeof fetch = fetch): Promise<HomeDownload> {
  if (!file.gateway_url) return { ok: false, unavailable: true, message: DARKNIGHT_UNAVAILABLE };
  let res: Response;
  try {
    res = await fetcher(libraryFileUrl(file.gateway_url, file.path), {
      headers: { Authorization: `Bearer ${token}` }, credentials: 'omit', redirect: 'error', cache: 'no-store',
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    return { ok: false, unavailable: true, message: DARKNIGHT_UNAVAILABLE };
  }
  if (!res.ok) return { ok: false, unavailable: true, message: DARKNIGHT_UNAVAILABLE };
  const bytes = await res.arrayBuffer();
  const got = await sha256OfBuffer(bytes);
  if (got !== file.sha256.toLowerCase()) {
    return { ok: false, unavailable: false, got, message: 'Download blocked: the file does not match its recorded SHA-256. The mismatch has been logged.' };
  }
  return { ok: true, bytes, sha256: got, fileName: file.file_name ?? 'document' };
}
