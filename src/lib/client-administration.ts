import { z } from 'zod';
import { supabase } from '@/integrations/supabase/client';
import type { Client } from '@/lib/projects';

const text = z.string().trim().max(2000);
export const clientDetailsSchema = z.object({
  name: text.min(1, 'Client name is required'), display_name: text,
  kind: z.enum(['organization', 'individual']), legal_name: text, sector: text,
  contact_name: text, contact_email: z.union([z.literal(''), z.string().email()]),
  phone: text, time_zone: text, notes: text, database_name: text,
  database_schema: z.union([z.literal(''), z.string().regex(/^[a-z_][a-z0-9_]{0,62}$/, 'Use a lowercase schema name')]),
  database_url: z.string().refine(value => {
    if (!value) return true;
    try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password && !url.search && !url.hash; } catch { return false; }
  }, 'Use an HTTPS link without credentials, query parameters or fragments'),
});
export type ClientDetails = z.infer<typeof clientDetailsSchema>;
export type AdminClient = Client & { seats_used: number };
export function clientDetails(client: Client): ClientDetails {
  return { name: client.name, display_name: client.display_name ?? '', kind: client.kind === 'individual' ? 'individual' : 'organization', legal_name: client.legal_name ?? '', sector: client.sector ?? '', contact_name: client.contact_name ?? '', contact_email: client.contact_email ?? '', phone: client.phone ?? '', time_zone: client.time_zone ?? '', notes: client.notes ?? '', database_name: client.database_name ?? '', database_schema: client.database_schema ?? '', database_url: client.database_url ?? '' };
}
export const clientAdminQuery = {
  queryKey: ['client-administration'],
  queryFn: async (): Promise<AdminClient[]> => {
    const { data, error } = await supabase.rpc('client_admin_list');
    if (error) throw error;
    return data as unknown as AdminClient[];
  },
};