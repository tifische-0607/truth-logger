import { zipSync, strToU8 } from 'fflate';
import { supabase } from '@/integrations/supabase/client';
import { safeName, sha256, validHash, type Source, type EvidenceRef } from './hub';

export type VaultFile = { file_id: string; filename: string; kind: string; size_bytes?: number; sha256: string; element_crop?: boolean; crop_label?: string; path_status?: string; baselines?: { post_manifest?: string; case_manifest?: string; case_manifest_path?: string; timestamped?: boolean }; integrity?: string };
export type VaultRecord = { id: string; record_id?: string; record_code?: string; title?: string; text?: string; text_original?: string; author_name?: string; platform?: string; item_type?: string; published_at?: string; collection?: string; element_crop?: boolean; crop_label?: string; files: VaultFile[] };
export function gatewayBase(source: Source) {
  if (!source.enabled || !source.gateway_url) throw new Error('Home vault not configured or disabled');
  const url = new URL(source.gateway_url);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) throw new Error('Gateway must be a clean HTTPS address');
  return url.href.replace(/\/$/, '');
}
export async function gatewayFetch(source: Source, path: string, init?: RequestInit) {
  const base = gatewayBase(source);
  if (!path.startsWith('/') || path.startsWith('//')) throw new Error('Invalid gateway path');
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Sign in to access the home vault');
  const response = await fetch(base + path, { ...init, headers: { ...init?.headers, Authorization: `Bearer ${session.access_token}` }, credentials: 'omit', redirect: 'error', signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`Home vault unavailable (${response.status})`);
  return response;
}
export async function gatewayHealth(source: Source): Promise<'online'|'degraded'|'offline'|'not configured'> {
  if (!source.enabled || !source.gateway_url) return 'not configured';
  try {
    const res = await fetch(gatewayBase(source) + '/health', { credentials: 'omit', redirect: 'error', signal: AbortSignal.timeout(8_000) });
    if (!res.ok) return 'offline';
    const data = await res.json();
    return data.status === 'degraded' ? 'degraded' : data.status === 'offline' ? 'offline' : 'online';
  } catch { return 'offline'; }
}
export function recordFrom(raw: unknown): VaultRecord {
  if (!raw || typeof raw !== 'object') throw new Error('Invalid home-vault record');
  const obj = raw as Record<string, unknown>;
  const id = String(obj.record_id ?? obj.id ?? '');
  if (!/^(finding|comment|profile|artifact)\..+$/.test(id)) throw new Error('Home-vault record ID must include its collection');
  const files = Array.isArray(obj.files) ? obj.files.filter(f => f && typeof f === 'object').map(f => {
    const file = f as Record<string, unknown>;
    return { ...file, file_id: String(file.file_id ?? ''), filename: String(file.filename ?? ''), kind: String(file.kind ?? 'file'), sha256: String(file.sha256 ?? ''), path_status: String(file.path_status ?? 'UNKNOWN') } as VaultFile;
  }) : [];
  return { ...obj, id, files } as VaultRecord;
}
export function refFiles(ref: EvidenceRef): VaultFile[] { return Array.isArray(ref.files) ? ref.files as unknown as VaultFile[] : []; }
export async function logHome(ref: EvidenceRef, action: 'accessed'|'re-hashed'|'exported', file?: VaultFile, notes?: string) {
  const { error } = await supabase.from('custody_events').insert({ source_id: ref.source_id, evidence_ref_id: ref.id, action, filename: file?.filename, sha256: file?.sha256, notes });
  if (error) throw error;
}
export function fileProblem(file: VaultFile): string | null {
  if (!validHash(file.sha256)) return 'NO_BASELINE';
  if (file.path_status !== 'OK') return file.path_status ?? 'UNKNOWN';
  if (!file.file_id || !file.filename) return 'Invalid file identity';
  return null;
}
export async function verifiedHomeFile(source: Source, ref: EvidenceRef, baseline: VaultFile): Promise<Uint8Array> {
  const record = recordFrom(await (await gatewayFetch(source, `/v1/records/${encodeURIComponent(ref.record_id)}`)).json());
  const live = record.files.find(f => f.file_id === baseline.file_id);
  if (!live) throw new Error(`${baseline.filename}: MISSING`);
  const problem = fileProblem({ ...live, sha256: baseline.sha256 });
  if (problem) throw new Error(`${baseline.filename}: ${problem}`);
  const response = await gatewayFetch(source, `/v1/records/${encodeURIComponent(ref.record_id)}/files/${encodeURIComponent(baseline.file_id)}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  await logHome(ref, 'accessed', baseline);
  const actual = await sha256(bytes);
  await logHome(ref, 're-hashed', baseline, `Computed ${actual}; ${actual === baseline.sha256.toLowerCase() ? 'MATCH' : 'MISMATCH'}`);
  if (actual !== baseline.sha256.toLowerCase()) throw new Error(`${baseline.filename}: MISMATCH`);
  return bytes;
}
export async function homeBundle(refs: EvidenceRef[], sources: Source[]) {
  const entries: Record<string, Uint8Array> = {}; const manifest: string[] = []; const problems: string[] = [];
  if (!refs.length) throw new Error('No home-vault references in this case');
  for (const ref of refs) {
    const source = sources.find(s => s.id === ref.source_id);
    if (!source) { problems.push(`${ref.record_id}: source unavailable`); continue; }
    for (const file of refFiles(ref)) {
      try {
        const bytes = await verifiedHomeFile(source, ref, file);
        const path = `${safeName(ref.record_id)}/${safeName(file.file_id)}_${safeName(file.filename)}`;
        entries[path] = bytes; manifest.push(`${file.sha256}  ${path}`);
      } catch (e) { problems.push(e instanceof Error ? e.message : 'File unavailable'); }
    }
  }
  if (problems.length) throw new Error(`Export blocked:\n${problems.join('\n')}`);
  entries['manifest.sha256'] = strToU8(manifest.join('\n'));
  entries['references.json'] = strToU8(JSON.stringify(refs, null, 2));
  entries['README.txt'] = strToU8('Evidence Hub — FridayAnalytics\nHome-vault files: verified against hashes retained at linking. This bundle stays on the device.\nELEMENT CROP – not proof by itself\nRENDER – from API data, not a platform screenshot');
  const bytes = zipSync(entries);
  for (const ref of refs) await logHome(ref, 'exported', undefined, 'Verified device-only home-vault ZIP');
  return bytes;
}