import { Link } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { useVaultOverview } from '@/lib/vaults';
import { getCloudVaultConfig } from '@/lib/vaults.functions';
import { cloudWord } from '@/lib/vault-config';

function Line({ name, word }: { name: string; word: string }) {
  const dot = word === 'Online' ? 'bg-positive' : word === 'Offline' ? 'bg-destructive' : 'bg-muted-foreground';
  return (
    <div className="flex items-center justify-between gap-2">
      <span>{name}</span>
      <span className="inline-flex items-center gap-1.5 font-semibold"><span aria-hidden className={`size-2 rounded-full ${dot}`} />{word}</span>
    </div>
  );
}

/** Sidebar vault panel: a dot and a word for each vault. */
export function SidebarVaults() {
  const s = useVaultOverview();
  const getCfg = useServerFn(getCloudVaultConfig);
  const cfg = useQuery({ queryKey: ['vaults', 'cloud-env', 'sidebar'], queryFn: () => getCfg(), staleTime: 300_000, retry: false });
  if (s.error) return null;
  return (
    <section aria-label="Vault status" className="space-y-2 text-xs">
      <Link to="/vaults" className="font-semibold underline-offset-2 hover:underline">Vaults</Link>
      <Line name="Home Vault" word={s.isLoading ? 'Checking' : s.data?.home_online ? 'Online' : 'Offline'} />
      <Line name="Cloud Vault" word={cfg.data ? cloudWord(cfg.data.configured, !!s.data?.cloud_online) : 'Not configured'} />
    </section>
  );
}
