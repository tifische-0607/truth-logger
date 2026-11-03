import { createFileRoute } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { useState } from 'react';
import { CheckCircle2, Circle, CircleAlert, Cloud, House } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { hubHead } from '@/lib/hub';
import { useMe } from '@/lib/projects';
import { formatDateTime } from '@/lib/format';
import { PageHeader } from '@/components/AppShell';
import { Chip } from '@/components/engagement/ui';
import { Refusal } from '@/components/research/ResearchBits';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { getCloudVaultConfig, testVaultConnection } from '@/lib/vaults.functions';
import { cloudChecks, cloudWord, homeChecks, ROUTE_LABEL, type CloudRoute, type VaultCheck } from '@/lib/vault-config';
import { useVaultOverview, WHERE_DATA_GOES } from '@/lib/vaults';

export const Route = createFileRoute('/_authenticated/vaults')({
  head: () => hubHead('Vaults', 'Status, checks and data routing for the FA Portal Home Vault and Cloud Vault.'),
  component: VaultsPage,
});

type Config = { vault: 'home' | 'cloud'; name: string; engine: string; location: string; route: string; holds: string;
  database_name: string | null; database_roles: string[]; schema_name: string | null; note: string | null };

const errText = (e: unknown) => (e && typeof e === 'object' && 'message' in e ? String((e as { message: unknown }).message) : 'Something went wrong');

function StatusWord({ word }: { word: string }) {
  const tone = word === 'Online' ? 'bg-positive/15 text-foreground' : word === 'Offline' ? 'bg-destructive/15 text-foreground' : 'bg-secondary text-secondary-foreground';
  return <Chip tone={tone}><span aria-hidden className="size-1.5 rounded-full bg-current" />{word}</Chip>;
}

function Checks({ checks }: { checks: VaultCheck[] }) {
  return (
    <ul className="space-y-1">
      {checks.map((c) => {
        const Icon = c.state === 'passed' ? CheckCircle2 : c.state === 'failed' ? CircleAlert : Circle;
        return (
          <li key={c.label} className="flex min-h-11 flex-wrap items-center gap-2 text-sm">
            <Icon aria-hidden className={c.state === 'passed' ? 'text-positive size-5 shrink-0' : 'text-muted-foreground size-5 shrink-0'} />
            <span className="font-semibold">{c.label}</span>
            <span className="text-muted-foreground">·</span>
            <span className="font-semibold">{c.state === 'passed' ? 'Passed' : c.state === 'failed' ? 'Failed' : 'Not checked'}</span>
            <span className="text-muted-foreground min-w-0 break-words">{c.note}</span>
          </li>
        );
      })}
    </ul>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return <div className="grid gap-1 sm:grid-cols-[10rem_1fr]"><dt className="text-muted-foreground text-sm">{k}</dt><dd className="min-w-0 break-words text-sm">{v}</dd></div>;
}

function RotateDialog({ vault, name }: { vault: 'home' | 'cloud'; name: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const m = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('vault_record_rotation', { _vault: vault, _note: note });
      if (error) throw error;
    },
    onSuccess: async () => { setOpen(false); setNote(''); setErr(null); await qc.invalidateQueries({ queryKey: ['vaults'] }); },
    onError: (e) => setErr(errText(e)),
  });
  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setErr(null); }}>
      <Button variant="outline" className="min-h-11" onClick={() => setOpen(true)}>Rotate credentials</Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Rotate credentials: {name}</DialogTitle>
          <DialogDescription>
            This records that the credentials were rotated. It does not change any password: change it at the host first,
            then update the server secrets in Project Settings.
          </DialogDescription>
        </DialogHeader>
        <label className="block space-y-2">
          <span className="text-sm font-semibold">Note (required)</span>
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="What was rotated and why" />
        </label>
        <Refusal text={err} />
        <DialogFooter>
          <Button variant="outline" className="min-h-11" onClick={() => setOpen(false)}>Cancel</Button>
          <Button className="min-h-11" disabled={m.isPending} onClick={() => m.mutate()}>{m.isPending ? 'Recording…' : 'Record rotation'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function VaultCard({ cfg, word, checks, owner, extra }: { cfg: Config; word: string; checks: VaultCheck[]; owner: boolean; extra?: React.ReactNode }) {
  const qc = useQueryClient();
  const test = useServerFn(testVaultConnection);
  const [msg, setMsg] = useState<{ text: string; bad: boolean } | null>(null);
  const m = useMutation({
    mutationFn: () => test({ data: { vault: cfg.vault } }),
    onSuccess: async (raw) => {
      const r = raw as { outcome: string; detail: { missing?: string[] } };
      const text = r.outcome === 'not_configured' ? `Not configured. Missing: ${(r.detail.missing ?? []).join(', ')}.`
        : r.outcome === 'not_attempted' ? 'Configured, but no connection was attempted: outside connections are not permitted in this phase.'
        : r.outcome === 'ok' ? 'Reachable: the Home Vault reported online within the window.' : 'Not reachable: no online report within the window.';
      setMsg({ text, bad: r.outcome !== 'ok' });
      await qc.invalidateQueries({ queryKey: ['vaults'] });
    },
    onError: (e) => setMsg({ text: errText(e), bad: true }),
  });
  const Icon = cfg.vault === 'home' ? House : Cloud;
  return (
    <article className="panel space-y-4 p-5" aria-labelledby={`vault-${cfg.vault}`}>
      <div className="flex flex-wrap items-center gap-3">
        <Icon aria-hidden className="size-5" />
        <h2 id={`vault-${cfg.vault}`} className="font-display text-xl font-medium">{cfg.name}</h2>
        <StatusWord word={word} />
      </div>
      <dl className="space-y-2">
        <Row k="Engine" v={cfg.engine} />
        <Row k="Location" v={cfg.location} />
        <Row k="Reached via" v={cfg.vault === 'home' ? 'HTTPS gateway, read directly from the browser' : ROUTE_LABEL[cfg.route as CloudRoute]} />
        <Row k="Holds" v={cfg.holds} />
        <Row k="Database roles" v={cfg.database_roles.length ? <span className="font-mono">{cfg.database_name} · {cfg.database_roles.join(', ')} · schema {cfg.schema_name}</span> : 'None (file gateway)'} />
      </dl>
      {extra}
      <div><p className="kicker mb-1">Checks</p><Checks checks={checks} /></div>
      {cfg.note && cfg.vault === 'cloud' && (
        <p className="bg-secondary rounded-lg px-4 py-3 text-sm"><span className="font-semibold">cPanel note: </span>{cfg.note} This app's server does not have a fixed address to allowlist.</p>
      )}
      {msg && <p role="status" className={msg.bad ? 'border-l-4 border-destructive pl-3 text-sm' : 'border-l-4 border-positive pl-3 text-sm'}>{msg.text}</p>}
      <div className="flex flex-wrap gap-3">
        <Button className="min-h-11" disabled={m.isPending} onClick={() => m.mutate()}>{m.isPending ? 'Testing…' : 'Test connection'}</Button>
        {owner && <RotateDialog vault={cfg.vault} name={cfg.name} />}
      </div>
    </article>
  );
}

function RouteSetting({ route, owner }: { route: CloudRoute; owner: boolean }) {
  const qc = useQueryClient();
  const [err, setErr] = useState<string | null>(null);
  const m = useMutation({
    mutationFn: async (r: CloudRoute) => { const { error } = await supabase.rpc('vault_set_cloud_route', { _route: r }); if (error) throw error; },
    onSuccess: async () => { setErr(null); await qc.invalidateQueries({ queryKey: ['vaults'] }); },
    onError: (e) => setErr(errText(e)),
  });
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-semibold">Access route {owner ? '' : '(owner can change)'}</legend>
      <div className="flex flex-wrap gap-2">
        {(['direct', 'relay'] as const).map((r) => (
          <Button key={r} variant={route === r ? 'default' : 'outline'} aria-pressed={route === r} disabled={!owner || m.isPending}
            className="min-h-11" onClick={() => route !== r && m.mutate(r)}>{ROUTE_LABEL[r]}</Button>
        ))}
      </div>
      <Refusal text={err} />
    </fieldset>
  );
}

function VaultsPage() {
  const me = useMe();
  const owner = !!me.data?.isOwner;
  const status = useVaultOverview();
  const getCfg = useServerFn(getCloudVaultConfig);
  const configs = useQuery({ queryKey: ['vaults', 'config'], queryFn: async () => {
    const { data, error } = await supabase.from('vault_config').select('*').order('vault', { ascending: false });
    if (error) throw error; return data as unknown as Config[];
  } });
  const cloudEnv = useQuery({ queryKey: ['vaults', 'cloud-env', configs.data?.find((c) => c.vault === 'cloud')?.route], queryFn: () => getCfg(), enabled: !!configs.data });
  const home = useQuery({ queryKey: ['vaults', 'home-extra'], queryFn: async () => {
    const [src, w] = await Promise.all([
      supabase.from('sources').select('gateway_url').eq('kind', 'home_vault').limit(1),
      supabase.from('research_captures').select('id', { count: 'exact', head: true }).eq('vault_write_verified', true),
    ]);
    return { https: !!src.data?.[0]?.gateway_url?.startsWith('https://'), verified: (w.count ?? 0) > 0 };
  } });
  const events = useQuery({ queryKey: ['vaults', 'events'], queryFn: async () => {
    const { data, error } = await supabase.from('vault_events').select('*').order('at', { ascending: false }).limit(10);
    if (error) throw error; return data;
  } });

  const s = status.data;
  const homeCfg = configs.data?.find((c) => c.vault === 'home');
  const cloudCfg = configs.data?.find((c) => c.vault === 'cloud');
  const cloudState = cloudEnv.data;
  return (
    <div className="space-y-6">
      <PageHeader kicker="09 · Admin · Settings" title="Vaults" subtitle="Where FA Portal data is held, how each vault is reached and whether it is online." />
      {(status.error || configs.error) && <Refusal text={errText(status.error ?? configs.error)} />}
      <div className="grid gap-6 lg:grid-cols-2">
        {homeCfg && <VaultCard cfg={homeCfg} owner={owner} word={s?.home_online ? 'Online' : 'Offline'}
          checks={homeChecks({ online: !!s?.home_online, httpsGateway: !!home.data?.https, lastVerifiedWrite: !!home.data?.verified, windowMinutes: s?.window_minutes ?? 15 })}
          extra={<p className="text-muted-foreground text-sm">Online means the collection device reported in within the last {s?.window_minutes ?? 15} minutes.
            {s?.home_last_report ? ` Last report ${formatDateTime(s.home_last_report.reported_at)}.` : ' No report yet.'} While offline, running research is paused and Start is refused.</p>} />}
        {cloudCfg && <VaultCard cfg={cloudCfg} owner={owner}
          word={cloudState ? cloudWord(cloudState.configured, !!s?.cloud_online) : 'Not configured'}
          checks={cloudState ? cloudChecks(cloudState) : []}
          extra={<div className="space-y-3"><RouteSetting route={cloudCfg.route as CloudRoute} owner={owner} />
            <p className="text-muted-foreground text-sm">While offline, only plans that mirror to the Cloud Vault are paused; queued copies wait in the outbox ({s?.outbox_pending.cloud ?? 0} waiting).</p></div>} />}
      </div>

      <section className="panel p-5" aria-labelledby="where">
        <h2 id="where" className="font-display mb-3 text-lg font-medium">Where data goes</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-brand-mid text-primary-foreground"><tr><th className="px-3 py-2 text-left">Data</th><th className="px-3 py-2 text-left">Home Vault</th><th className="px-3 py-2 text-left">Cloud Vault</th></tr></thead>
            <tbody>{WHERE_DATA_GOES.map((r) => <tr key={r.data} className="border-b even:bg-muted/40"><td className="px-3 py-2 font-semibold">{r.data}</td><td className="px-3 py-2">{r.home}</td><td className="px-3 py-2">{r.cloud}</td></tr>)}</tbody>
          </table>
        </div>
      </section>

      <section className="panel p-5" aria-labelledby="log">
        <h2 id="log" className="font-display mb-3 text-lg font-medium">Vault log</h2>
        {events.data?.length ? (
          <ul className="space-y-2 text-sm">{events.data.map((e) => (
            <li key={e.id} className="flex flex-wrap gap-2"><span className="text-muted-foreground">{formatDateTime(e.at)}</span>
              <span className="font-semibold">{e.vault === 'home' ? 'Home Vault' : 'Cloud Vault'}</span>
              <span>{e.event.replace(/_/g, ' ')}</span><span>· {e.outcome.replace(/_/g, ' ')}</span></li>))}</ul>
        ) : <p className="text-muted-foreground text-sm">No vault events yet.</p>}
      </section>
    </div>
  );
}
