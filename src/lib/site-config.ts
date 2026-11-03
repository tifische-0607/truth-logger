export const DEFAULT_SITE_URL = 'https://portal.fridayanalytics.org';

export function canonicalSiteUrl(value?: string) {
  const url = new URL(value || DEFAULT_SITE_URL);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) {
    throw new Error('SITE_URL must be an HTTPS site address.');
  }
  return url.origin;
}

export function siteLink(base: string, path: string) {
  if (!path.startsWith('/') || path.startsWith('//')) throw new Error('A same-site path is required.');
  return new URL(path, canonicalSiteUrl(base)).href;
}

export function authReturnUrl(base: string, origin: string, path: string) {
  // Preview authentication must return to its current origin. Never persist a preview host.
  return siteLink(origin === canonicalSiteUrl(base) ? base : origin, path);
}