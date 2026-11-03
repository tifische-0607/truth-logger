import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';

/** Signs a short-lived link only after the database confirms, as the caller, that they may read the document. */
export const getLibraryFileLink = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ documentId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: file, error } = await context.supabase.rpc('library_file_for', { doc: data.documentId });
    if (error) throw new Error(error.message);
    const f = file as { bucket: string; path: string; sha256: string; file_name: string | null };
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const signed = await supabaseAdmin.storage.from(f.bucket).createSignedUrl(f.path, 60);
    if (signed.error) throw new Error(signed.error.message);
    return { url: signed.data.signedUrl, sha256: f.sha256, fileName: f.file_name ?? 'document' };
  });
