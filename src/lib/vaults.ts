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
  { data: 'Evidence originals and captures', home: 'Held (original)', cloud: 'Not held; home-vault files list manifest and hash only' },
  { data: 'Released outputs (after G5)', home: 'Held', cloud: 'Copy queued with its SHA-256' },
  { data: 'Documents shared with a client', home: 'Held', cloud: 'Copy queued with its SHA-256' },
  { data: 'Captures from plans that mirror to the Cloud Vault', home: 'Held (original)', cloud: 'Copy queued with its SHA-256' },
  { data: 'Custody records', home: 'Queued, append-only', cloud: 'Queued, append-only' },
  { data: 'Document and research events', home: 'Queued, append-only', cloud: 'Queued, append-only' },
  { data: 'Drafts, staff-only documents, sign-in data', home: 'Not sent', cloud: 'Not sent' },
];
