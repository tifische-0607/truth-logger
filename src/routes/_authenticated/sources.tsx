import { createFileRoute } from '@tanstack/react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { hubHead, sourcesQuery, currentAccess, type Source } from '@/lib/hub';
import { PageHeader } from '@/components/AppShell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { SourceBadge, SourceHealth } from '@/components/SourceStatus';

export const Route = createFileRoute('/_authenticated/sources')({ head: () => hubHead('Sources'), component: SourcesPage });
function SourceEditor({ source, owner }: { source: Source; owner: boolean }) {
  const qc = useQueryClient(); const [url, setUrl] = useState(source.gateway_url ?? ''); const [enabled, setEnabled] = useState(source.enabled); const [busy, setBusy] = useState(false);
  async function save() { setBusy(true); try { if (url && (new URL(url).protocol !== 'https:' || new URL(url).username || new URL(url).password)) throw new Error('Use an HTTPS gateway URL without credentials'); const { error } = await supabase.from('sources').update({ gateway_url: url.trim().replace(/\/$/, '') || null, enabled }).eq('id', source.id); if (error) throw error; await qc.invalidateQueries({ queryKey: ['hub-sources'] }); toast.success('Source saved'); } catch(e) { toast.error(e instanceof Error ? e.message : 'Save failed'); } finally { setBusy(false); } }
  return <article className="border-b py-6 space-y-4"><div className="flex flex-wrap items-center gap-3"><h2 className="text-xl font-semibold">{source.name}</h2><SourceBadge home={source.kind === 'home_vault'} /><SourceHealth source={source} /></div><p className="text-muted-foreground text-sm">{source.description}</p>{source.kind === 'home_vault' && <><label className="block space-y-2"><span>Gateway URL</span><Input aria-label="Gateway URL" value={url} disabled={!owner} onChange={e => setUrl(e.target.value)} placeholder="https://darknight.your-tailnet.ts.net" className="min-h-11 max-w-xl" /></label><div className="flex items-center gap-3"><Switch aria-label="Enable DarkNight" checked={enabled} disabled={!owner} onCheckedChange={setEnabled} /><span>Enabled</span></div>{owner && <Button disabled={busy} onClick={save}>Save source</Button>}<p className="text-sm text-muted-foreground">Files stay at home. This device must reach the private gateway; it must allow this app and validate your signed-in account.</p></>}</article>;
}
function SourcesPage() { const q = useQuery(sourcesQuery); const access = useQuery({ queryKey: ['hub-access'], queryFn: currentAccess }); return <><PageHeader title="Sources" subtitle="FridayAnalytics evidence vaults" />{q.error && <p role="alert">Sources could not be loaded.</p>}{q.data?.map(s => <SourceEditor key={s.id + s.updated_at} source={s} owner={access.data?.owner ?? false} />)}</>; }