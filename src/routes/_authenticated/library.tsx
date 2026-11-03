import { createFileRoute } from '@tanstack/react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { useMemo, useState } from 'react';
import { Download, Info, Loader2 } from 'lucide-react';

import { supabase } from '@/integrations/supabase/client';
import { PageHeader } from '@/components/AppShell';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { getLibraryFileLink } from '@/lib/library.functions';
import { audienceOf, AUDIENCE_LABEL, LIBRARY_KINDS, type LibraryDoc } from '@/lib/library';
import { sha256Hex } from '@/lib/engagement-outputs';
import { formatDate } from '@/lib/format';
import { cn } from '@/lib/utils';

export const Route = createFileRoute('/_authenticated/library')({
  head: () => ({
    meta: [
      { title: 'Library — FA Portal' },
      { name: 'description', content: 'Every FA Portal document, who can see it, its hash and its access log.' },
      { property: 'og:title', content: 'Library — FA Portal' },
      { property: 'og:description', content: 'Every FA Portal document, who can see it, its hash and its access log.' },
      { property: 'og:type', content: 'website' },
      { name: 'twitter:card', content: 'summary' },
    ],
  }),
  component: LibraryPage,
});

function dbMessage(e: unknown) {
  if (e && typeof e === 'object' && 'message' in e) return String((e as { message: unknown }).message);
  return String(e);
}

function AudienceChip({ d }: { d: LibraryDoc }) {
  const a = audienceOf(d);
  return (
    <span className={cn('inline-flex min-h-7 items-center rounded-full border px-2.5 text-xs font-medium',
      a === 'shared' && 'border-primary/40 bg-primary/10 text-primary',
      a === 'held' && 'border-warning/50 bg-warning/10',
      a === 'void' && 'border-destructive/40 bg-destructive/10 text-destructive',
      a === 'staff' && 'bg-muted text-muted-foreground')}>{AUDIENCE_LABEL[a]}</span>
  );
}

function LibraryPage() {
  const [kind, setKind] = useState<string>('all');
  const [q, setQ] = useState('');
  const [client, setClient] = useState('all');
  const [engagement, setEngagement] = useState('all');
  const [audience, setAudience] = useState('all');
  const [openId, setOpenId] = useState<string | null>(null);

  const docs = useQuery({
    queryKey: ['library'],
    queryFn: async () => {
      const { data, error } = await supabase.from('documents').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      return data as LibraryDoc[];
    },
  });
  const clients = useQuery({
    queryKey: ['library-clients'],
    queryFn: async () => (await supabase.from('clients').select('id, name, display_name').order('name')).data ?? [],
  });
  const engagements = useQuery({
    queryKey: ['library-engagements'],
    queryFn: async () => (await supabase.from('projects').select('id, code, name, client_id').order('code')).data ?? [],
  });
  const clientName = (id: string) => { const c = clients.data?.find((x) => x.id === id); return c ? (c.display_name || c.name) : '—'; };
  const engCode = (id: string | null) => (id ? engagements.data?.find((x) => x.id === id)?.code ?? '—' : '—');

  const all = docs.data ?? [];
  const counts = {
    total: all.length,
    shared: all.filter((d) => audienceOf(d) === 'shared').length,
    staff: all.filter((d) => audienceOf(d) === 'staff').length,
    held: all.filter((d) => audienceOf(d) === 'held').length,
  };
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return all.filter((d) => (kind === 'all' || d.kind === kind)
      && (client === 'all' || d.client_id === client)
      && (engagement === 'all' || d.engagement_id === engagement)
      && (audience === 'all' || audienceOf(d) === audience)
      && (!needle || d.title.toLowerCase().includes(needle) || d.code.toLowerCase().includes(needle) || (d.sha256 ?? '').includes(needle)));
  }, [all, kind, client, engagement, audience, q]);
  const open = all.find((d) => d.id === openId) ?? null;

  return (
    <div>
      <PageHeader title="Library" subtitle="Every document FA holds for its clients, with who can see it." />
      <Alert className="mb-5"><Info className="size-4" /><AlertDescription>Staff see every document. Clients see only documents for their own client that you have shared with them.</AlertDescription></Alert>

      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        {[['Documents', counts.total], ['Shared with clients', counts.shared], ['Staff only', counts.staff], ['Held outputs', counts.held]].map(([l, n]) => (
          <div key={l as string} className="panel p-4"><p className="text-muted-foreground text-xs">{l}</p><p className="mt-1 text-2xl font-semibold">{n}</p></div>
        ))}
      </div>

      <nav aria-label="Document kinds" className="mb-4 flex overflow-x-auto border-b">
        {[['all', 'All'], ...LIBRARY_KINDS].map(([k, l]) => (
          <button key={k} type="button" onClick={() => setKind(k)} className={cn('min-h-12 shrink-0 border-b-2 px-4 text-sm', kind === k ? 'border-primary text-primary font-semibold' : 'text-muted-foreground border-transparent')}>{l}</button>
        ))}
      </nav>

      <div className="mb-4 grid gap-3 md:grid-cols-4">
        <Input className="min-h-11" placeholder="Search title, code or hash" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search documents" />
        <Select value={client} onValueChange={setClient}><SelectTrigger className="min-h-11" aria-label="Client"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="all">All clients</SelectItem>{clients.data?.map((c) => <SelectItem key={c.id} value={c.id}>{c.display_name || c.name}</SelectItem>)}</SelectContent></Select>
        <Select value={engagement} onValueChange={setEngagement}><SelectTrigger className="min-h-11" aria-label="Engagement"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="all">All engagements</SelectItem>{engagements.data?.map((e) => <SelectItem key={e.id} value={e.id}>{e.code}</SelectItem>)}</SelectContent></Select>
        <Select value={audience} onValueChange={setAudience}><SelectTrigger className="min-h-11" aria-label="Who can see it"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="all">Anyone</SelectItem><SelectItem value="shared">Shared with client</SelectItem><SelectItem value="staff">Staff only</SelectItem><SelectItem value="held">Held</SelectItem><SelectItem value="void">Void</SelectItem></SelectContent></Select>
      </div>

      {docs.error ? <Alert variant="destructive"><AlertDescription>{dbMessage(docs.error)}</AlertDescription></Alert> : null}
      {docs.isLoading ? <Loader2 className="size-5 animate-spin" /> : (
        <div className="panel overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-muted-foreground text-left text-xs"><tr className="border-b">
              <th className="p-3">Code</th><th className="p-3">Title</th><th className="p-3">Client</th><th className="p-3">Engagement</th><th className="p-3">Who can see it</th><th className="p-3">SHA-256</th><th className="p-3">Added</th></tr></thead>
            <tbody>
              {shown.map((d) => (
                <tr key={d.id} className="hover:bg-muted/50 cursor-pointer border-b" onClick={() => setOpenId(d.id)}>
                  <td className="p-3 font-mono text-xs"><button type="button" className="min-h-11 underline-offset-2 hover:underline" onClick={() => setOpenId(d.id)}>{d.code}</button></td>
                  <td className="p-3">{d.title}</td>
                  <td className="p-3">{clientName(d.client_id)}</td>
                  <td className="p-3 font-mono text-xs">{engCode(d.engagement_id)}</td>
                  <td className="p-3"><AudienceChip d={d} /></td>
                  <td className="p-3 font-mono text-xs">{d.sha256 ? `${d.sha256.slice(0, 12)}…` : '—'}</td>
                  <td className="p-3 whitespace-nowrap">{formatDate(d.created_at)}</td>
                </tr>
              ))}
              {shown.length === 0 ? <tr><td colSpan={7} className="text-muted-foreground p-6 text-center">No documents match.</td></tr> : null}
            </tbody>
          </table>
        </div>
      )}

      <Sheet open={!!open} onOpenChange={(o) => !o && setOpenId(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
          {open ? <DocumentDetail d={open} clientName={clientName(open.client_id)} /> : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function DocumentDetail({ d, clientName }: { d: LibraryDoc; clientName: string }) {
  const qc = useQueryClient();
  const getLink = useServerFn(getLibraryFileLink);
  const [err, setErr] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<'share' | 'withdraw' | null>(null);
  const [reason, setReason] = useState('');
  const a = audienceOf(d);

  const log = useQuery({
    queryKey: ['library-log', d.id],
    queryFn: async () => {
      const { data, error } = await supabase.from('document_events').select('*').eq('document_id', d.id).order('at', { ascending: false });
      if (error) throw error;
      return data;
    },
  });
  const refresh = () => { void qc.invalidateQueries({ queryKey: ['library'] }); void qc.invalidateQueries({ queryKey: ['library-log', d.id] }); };

  async function run(fn: () => PromiseLike<{ error: unknown }>) {
    setBusy(true); setErr(null); setNote(null);
    const { error } = await fn();
    setBusy(false);
    if (error) { setErr(dbMessage(error)); return false; }
    refresh(); return true;
  }

  async function download() {
    setBusy(true); setErr(null); setNote(null);
    try {
      const link = await getLink({ data: { documentId: d.id } });
      const buf = await (await fetch(link.url)).arrayBuffer();
      const got = await sha256Hex(buf);
      const { data: ok, error } = await supabase.rpc('library_record_download', { doc: d.id, got_sha256: got });
      if (error) throw error;
      if (!ok) { setErr(`Download blocked: the file's hash (${got}) does not match the recorded hash. The mismatch has been logged.`); return; }
      const url = URL.createObjectURL(new Blob([buf]));
      const el = document.createElement('a'); el.href = url; el.download = link.fileName; el.click(); URL.revokeObjectURL(url);
      setNote('Hash re-checked and matched. Download recorded.');
    } catch (e) { setErr(dbMessage(e)); } finally { setBusy(false); refresh(); }
  }

  return (
    <div className="space-y-5">
      <SheetHeader><SheetTitle>{d.title}</SheetTitle></SheetHeader>
      <dl className="grid grid-cols-[8rem_1fr] gap-x-3 gap-y-2 text-sm">
        <dt className="text-muted-foreground">Code</dt><dd className="font-mono">{d.code} · v{d.version}</dd>
        <dt className="text-muted-foreground">Client</dt><dd>{clientName}</dd>
        <dt className="text-muted-foreground">Who can see it</dt><dd><AudienceChip d={d} /><p className="text-muted-foreground mt-1 text-xs">
          {a === 'shared' ? `FA staff and the administrators of ${clientName}.` : a === 'void' ? `Void: ${d.voided_note}. Staff only.` : a === 'held' ? 'FA staff only. It reaches the client only when released at gate G5.' : 'FA staff only.'}</p></dd>
        <dt className="text-muted-foreground">From</dt><dd>{d.source === 'client' ? 'Uploaded by the client' : 'FA'}</dd>
        <dt className="text-muted-foreground">SHA-256</dt><dd className="font-mono text-xs break-all">{d.sha256 ?? '—'}</dd>
      </dl>
      {d.manifest_only ? <Alert><AlertDescription>This bundle holds home-vault files. Only its manifest and hash are listed here; there is no download.</AlertDescription></Alert> : null}
      {err ? <Alert variant="destructive" role="alert"><AlertDescription>{err}</AlertDescription></Alert> : null}
      {note ? <Alert role="status"><AlertDescription>{note}</AlertDescription></Alert> : null}
      <div className="flex flex-wrap gap-2">
        {d.storage_path && !d.manifest_only ? <Button className="min-h-11" onClick={download} disabled={busy}><Download className="size-4" />Download</Button> : null}
        {!d.voided && d.visibility === 'staff_only' ? <Button variant="outline" className="min-h-11" disabled={busy} onClick={() => setConfirm('share')}>Share with client</Button> : null}
        {d.visibility === 'client' ? <Button variant="outline" className="min-h-11" disabled={busy} onClick={() => { setReason(''); setConfirm('withdraw'); }}>Withdraw</Button> : null}
      </div>

      <section>
        <h3 className="mb-2 font-semibold">Access log</h3>
        <ol className="space-y-2 text-sm">
          {log.data?.map((e) => (
            <li key={e.id} className="border-l-2 pl-3"><span className="font-medium capitalize">{e.action.replace('_', ' ')}</span> · {formatDate(e.at)} · {e.actor_kind}{e.reason ? <span className="text-muted-foreground block text-xs">{e.reason}</span> : null}</li>
          ))}
          {log.data?.length === 0 ? <li className="text-muted-foreground">No entries.</li> : null}
        </ol>
      </section>

      <AlertDialog open={confirm !== null} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirm === 'share' ? 'Share with client?' : 'Withdraw from client?'}</AlertDialogTitle>
            <AlertDialogDescription>{confirm === 'share' ? `The administrators of ${clientName} will be able to see and download this document.` : `The administrators of ${clientName} will no longer see this document. A reason is required.`}</AlertDialogDescription>
          </AlertDialogHeader>
          {confirm === 'withdraw' ? <div className="space-y-1"><Label htmlFor="withdraw-reason">Reason</Label><Textarea id="withdraw-reason" value={reason} onChange={(e) => setReason(e.target.value)} /></div> : null}
          <AlertDialogFooter>
            <AlertDialogCancel className="min-h-11">Cancel</AlertDialogCancel>
            <AlertDialogAction className="min-h-11" onClick={() => {
              const action = confirm; setConfirm(null);
              void run(() => action === 'share' ? supabase.rpc('library_share', { doc: d.id }) : supabase.rpc('library_withdraw', { doc: d.id, reason }));
            }}>{confirm === 'share' ? 'Share' : 'Withdraw'}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
