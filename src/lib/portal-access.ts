import { supabase } from '@/integrations/supabase/client';

export type PortalIdentity = { kind: 'staff' | 'client' | 'none'; role?: string; client_id?: string; destination: '/dashboard' | '/inbox' | '/management' | '/portal' | '/auth' };
export type ClientAdmin = { id: string; user_id: string | null; email: string; name: string; status: 'pending' | 'active' | 'inactive'; last_sign_in: string | null; invite_expires_at: string | null; role?: 'client_admin' | 'client_user'; holds_seat?: boolean };
export function errorMessage(e: unknown) {
  return typeof e === 'object' && e && 'message' in e ? String(e.message) : String(e);
}
export async function portalIdentity() {
  const { data, error } = await supabase.rpc('portal_identity');
  if (error) throw error;
  return data as unknown as PortalIdentity;
}
export async function clientAdmins(clientId: string) {
  const { data, error } = await supabase.rpc('portal_access_list', { c: clientId });
  if (error) throw error;
  return (data ?? []) as unknown as ClientAdmin[];
}