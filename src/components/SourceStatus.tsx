import { useQuery } from '@tanstack/react-query';
import { Cloud, House, CircleCheck, CircleAlert } from 'lucide-react';
import { sourcesQuery, type Source } from '@/lib/hub';
import { gatewayHealth } from '@/lib/home-vault';

export function SourceBadge({ home = false }: { home?: boolean }) { const Icon = home ? House : Cloud; return <span className="inline-flex items-center gap-1.5 rounded border px-2 py-1 text-xs font-medium"><Icon className="size-3.5" />{home ? 'Home' : 'Cloud'}</span>; }
export function SourceHealth({ source }: { source: Source }) {
  const q = useQuery({ queryKey: ['source-health', source.id, source.gateway_url, source.enabled], queryFn: () => gatewayHealth(source), refetchInterval: 30_000 });
  const status = source.kind === 'cloud_vault' ? 'online' : q.data ?? 'checking';
  const Icon = status === 'online' ? CircleCheck : CircleAlert;
  return <span className="inline-flex items-center gap-1.5 text-xs"><Icon className="size-3.5" />{status}</span>;
}
export function SourceStatus() {
  const sources = useQuery(sourcesQuery);
  return <section aria-label="Source status" className="space-y-2 text-xs"><p className="font-semibold">Vaults</p>{sources.error && <p>Source status unavailable</p>}{sources.data?.map(s => <div key={s.id} className="flex flex-wrap items-center justify-between gap-1"><span className="inline-flex items-center gap-1.5">{s.kind === 'home_vault' ? <House className="size-3.5" /> : <Cloud className="size-3.5" />}{s.name}</span><SourceHealth source={s} /></div>)}</section>;
}