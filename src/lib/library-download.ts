import { supabase } from '@/integrations/supabase/client';
import { fetchHomeFile, type HomeFile } from './library-home';

/** Live DarkNight download: database checks access, file is fetched and re-hashed, result is logged. */
export async function downloadLibraryDocument(documentId: string): Promise<{ ok: boolean; message: string }> {
  const { data, error } = await supabase.rpc('library_home_file_for', { doc: documentId });
  if (error) return { ok: false, message: error.message };
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return { ok: false, message: 'Sign in to download' };
  const res = await fetchHomeFile(data as unknown as HomeFile, session.access_token);
  if (!res.ok && res.unavailable) return { ok: false, message: res.message };
  const got = res.ok ? res.sha256 : res.got;
  const rec = await supabase.rpc('library_record_download', { doc: documentId, got_sha256: got });
  if (rec.error) return { ok: false, message: rec.error.message };
  if (!res.ok || !rec.data) return { ok: false, message: 'Download blocked: the file does not match its recorded SHA-256. The mismatch has been logged.' };
  const url = URL.createObjectURL(new Blob([res.bytes]));
  const a = document.createElement('a'); a.href = url; a.download = res.fileName; a.click(); URL.revokeObjectURL(url);
  return { ok: true, message: 'Fetched live from DarkNight. SHA-256 re-checked and matched. Download recorded.' };
}
