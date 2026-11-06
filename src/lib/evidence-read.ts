import { supabase } from '@/integrations/supabase/client';
import { readArtefactWith, readLive, writeOutput, type ReadLocation } from './darknight';

async function token() {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ?? '';
}

/** Where the database says this artefact must be read from (caller's own row rules apply). */
export async function artefactLocation(storagePath: string): Promise<ReadLocation> {
  const { data, error } = await supabase.rpc('evidence_read_location', { _storage_path: storagePath });
  if (error) throw error;
  return (data ?? null) as unknown as ReadLocation;
}

const cloudRead = async (p: string) => {
  const { data, error } = await supabase.storage.from('evidence').download(p);
  if (error || !data) throw error ?? new Error('File not available');
  return data.arrayBuffer();
};

/** One reader for every screen: moved artefacts come live from DarkNight with SHA-256 re-check. */
export async function readArtefact(storagePath: string) {
  const loc = await artefactLocation(storagePath);
  const r = await readArtefactWith(loc, storagePath, await token(), cloudRead);
  return { ...r, moved: !!loc?.moved };
}

export async function darknightRouteUrl(): Promise<string | null> {
  const { data } = await supabase.from('darknight_route').select('gateway_url').limit(1).maybeSingle();
  return data?.gateway_url ?? null;
}

export async function readOutputLive(path: string, sha256: string) {
  return readLive(await darknightRouteUrl(), 'outputs', path, sha256, await token());
}

export async function writeOutputLive(path: string, blob: Blob, sha256: string) {
  return writeOutput(await darknightRouteUrl(), path, blob, sha256, await token());
}
