import type { Database } from '@/integrations/supabase/types';

export type LibraryDoc = Database['public']['Tables']['documents']['Row'];
export type Audience = 'shared' | 'held' | 'staff' | 'void';

export const AUDIENCE_LABEL: Record<Audience, string> = {
  shared: 'Shared with client',
  held: 'Held',
  staff: 'Staff only',
  void: 'Void',
};

export const LIBRARY_KINDS = [
  ['report', 'Reports'],
  ['brief', 'Briefs'],
  ['contract', 'Contracts'],
  ['client_upload', 'Client uploads'],
  ['evidence_bundle_manifest', 'Evidence bundles'],
  ['other', 'Other'],
] as const;

/** Who can see a document, in words. A staff-only output that has not been released is "Held". */
export function audienceOf(d: Pick<LibraryDoc, 'voided' | 'visibility' | 'output_id' | 'output_status'>): Audience {
  if (d.voided) return 'void';
  if (d.visibility === 'client') return 'shared';
  if (d.output_id && d.output_status !== 'released' && d.output_status !== 'withdrawn') return 'held';
  return 'staff';
}
