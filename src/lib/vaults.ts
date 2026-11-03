import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type VaultStatus = {
  window_minutes: number; home_online: boolean; cloud_online: boolean;
  home_last_report: { online: boolean; reported_at: string; note: string | null } | null;
  cloud_last_check: { outcome: string; detail: Record<string, unknown>; at: string } | null;
  outbox_pending: { cloud: number; home: number };
};

export const vaultStatusQuery = {
  queryKey: ['vaults', 'status'] as const,
  queryFn: async (): Promise<VaultStatus> => {
    const { data, error } = await supabase.rpc('vault_status');
    if (error) throw error;
    return data as unknown as VaultStatus;
  },
  refetchInterval: 60_000,
};

export function useVaultOverview() { return useQuery(vaultStatusQuery); }

/** Where each kind of record lives. Presentation only; the outbox triggers enforce the queueing. */
export const WHERE_DATA_GOES: { data: string; home: string; cloud: string }[] = [
  { data: 'Evidence originals and captures', home: 'DarkNight only', cloud: 'Not held' },
  { data: 'Reports and released outputs', home: 'DarkNight only', cloud: 'Not held' },
  { data: 'Documents shared with a client', home: 'DarkNight only, fetched live and re-hashed', cloud: 'Title, hash, location and log only' },
  { data: 'Custody records', home: 'Queued, append-only', cloud: 'Queued, append-only' },
  { data: 'Document and research events', home: 'Queued, append-only', cloud: 'Queued, append-only' },
  { data: 'Portal data (clients, engagements, settings)', home: 'Not sent', cloud: 'Portal data only' },
];
