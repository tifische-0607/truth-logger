import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Refusal } from '@/components/research/ResearchBits';
import { Chip } from '@/components/engagement/ui';
import { formatDateTime } from '@/lib/format';
import { DARKNIGHT_NOT_CONNECTED, runEvidenceMove, type Pending } from '@/lib/darknight';

export type MoveProgress = {
  total: number; verified: number; mismatched: number; not_yet_moved: number; cloud_copies: number;
  frozen: boolean; gateway_connected: boolean; step6: string;
  last_run: null | { id: string; started_at: string; total: number;
    stopped_by: null | { artefact_id: string; filename: string; path: string; expected: string; got: string | null; at: string } };
};

const errText = (e: unknown) => (e && typeof e === 'object' && 'message' in e ? String((e as { message: unknown }).message) : 'Something went wrong');

function Word({ text, tone }: { text: string; tone: 'good' | 'bad' | 'plain' }) {
  const cls = tone === 'good' ? 'bg-positive/15 text-foreground' : tone === 'bad' ? 'bg-destructive/15 text-foreground' : 'bg-secondary text-secondary-foreground';
  return <Chip tone={cls}><span aria-hidden className="size-1.5 rounded-full bg-current" />{text}</Chip>;
}

function FreezeDialog({ frozen }: { frozen: boolean }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const m = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('evidence_move_set_freeze', { _on: !frozen, _reason: reason });
      if (error) throw error;
    },
    onSuccess: async () => { setOpen(false); setReason(''); setErr(null); await qc.invalidateQueries({ queryKey: ['evidence-move'] }); },
    onError: (e) => setErr(errText(e)),
  });
  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setErr(null); }}>
      <DialogTrigger asChild><Button ref={trigger} variant={frozen ? 'outline' : 'default'} className="min-h-11">{frozen ? 'Switch freeze off' : 'Switch freeze on'}</Button></DialogTrigger>
      <DialogContent onCloseAutoFocus={(e) => { e.preventDefault(); trigger.current?.focus(); }}>
        <DialogHeader>
          <DialogTitle>{frozen ? 'Switch the evidence move freeze off' : 'Switch the evidence move freeze on'}</DialogTitle>
          <DialogDescription>
            {frozen ? 'The capture worker and capture screens will be able to upload new files to cloud storage again.'
              : 'While on, the capture worker and capture screens cannot upload any new evidence file to cloud storage.'} The change is logged with your name and reason.
          </DialogDescription>
        </DialogHeader>
        <label className="block space-y-2">
          <span className="text-sm font-semibold">Reason (required)</span>
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why the freeze is changing" />
        </label>
        <Refusal text={err} />
        <DialogFooter>
          <Button variant="outline" className="min-h-11" onClick={() => setOpen(false)}>Cancel</Button>
          <Button className="min-h-11" disabled={m.isPending} onClick={() => m.mutate()}>{m.isPending ? 'Recording…' : frozen ? 'Switch off' : 'Switch on'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function EvidenceMovePanel({ owner }: { owner: boolean }) {
  const qc = useQueryClient();
  const p = useQuery({ queryKey: ['evidence-move', 'progress'], queryFn: async () => {
    const { data, error } = await supabase.rpc('evidence_move_progress');
    if (error) throw error; return data as unknown as MoveProgress;
  } });
  const freezeLog = useQuery({ queryKey: ['evidence-move', 'freeze-log'], queryFn: async () => {
    const { data, error } = await supabase.from('evidence_move_freeze_log').select('*').order('at', { ascending: false }).limit(5);
    if (error) throw error; return data;
  } });
  const [status, setStatus] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const run = useMutation({
    mutationFn: async () => {
      setErr(null);
      const start = await supabase.rpc('evidence_move_start');
      if (start.error) throw start.error;
      const s = start.data as unknown as { run_id: string; gateway_url: string };
      const pend = await supabase.rpc('evidence_move_pending');
      if (pend.error) throw pend.error;
      const { data: { session } } = await supabase.auth.getSession();
      return runEvidenceMove({
        gatewayUrl: s.gateway_url, runId: s.run_id, token: session?.access_token ?? '', pending: (pend.data ?? []) as Pending[],
        // Read-only link to the cloud original; the original is never changed or deleted.
        signSource: async (path) => {
          const { data, error } = await supabase.storage.from('evidence').createSignedUrl(path, 300);
          if (error || !data) throw error ?? new Error('Could not read the cloud original');
          return data.signedUrl;
        },
        record: async (r) => {
          const { data, error } = await supabase.rpc('evidence_move_record', { _run: r.run, _artefact: r.artefact, _darknight_path: r.path, _got_sha256: r.got ?? '', _unavailable: r.unavailable });
          if (error) throw error;
          return data as string;
        },
        progress: (d, t) => setStatus(`Moving ${d} of ${t}…`),
      });
    },
    onSuccess: (r) => setStatus(r.stoppedBy ? `Stopped: hash mismatch on ${r.stoppedBy.filename}.` : `Done: ${r.verified} verified, ${r.unavailable} not reached.`),
    onError: (e) => setErr(errText(e)),
    onSettled: () => qc.invalidateQueries({ queryKey: ['evidence-move'] }),
  });

  const d = p.data;
  const stop = d?.last_run?.stopped_by;
  return (
    <section className="panel space-y-4 p-5" aria-labelledby="move">
      <div className="flex flex-wrap items-center gap-3">
        <h2 id="move" className="font-display text-lg font-medium">Evidence move to DarkNight</h2>
        {d && <Word text={d.gateway_connected ? 'DarkNight gateway connected' : DARKNIGHT_NOT_CONNECTED} tone={d.gateway_connected ? 'good' : 'plain'} />}
      </div>
      <Refusal text={p.error ? errText(p.error) : null} />

      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm font-semibold">Evidence move freeze</span>
        {d && <Word text={d.frozen ? 'On' : 'Off'} tone={d.frozen ? 'bad' : 'plain'} />}
        <span className="text-muted-foreground text-sm">{d?.frozen ? 'New uploads to cloud storage are refused.' : 'New captures can still upload to cloud storage.'}</span>
        {owner && d && <FreezeDialog frozen={d.frozen} />}
        {!owner && <span className="text-muted-foreground text-sm">(owner can change)</span>}
      </div>
      {freezeLog.data?.length ? (
        <ul className="text-muted-foreground space-y-1 text-sm">{freezeLog.data.map((f) => (
          <li key={f.id}>{formatDateTime(f.at)} · switched {f.frozen ? 'on' : 'off'} · {f.reason}</li>))}</ul>
      ) : null}

      {d && (
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {[
            ['Total', d.total], ['Verified', d.verified], ['Mismatched', d.mismatched], ['Not yet moved', d.not_yet_moved], ['Cloud copies remaining', d.cloud_copies],
          ].map(([k, v]) => (
            <div key={k as string} className="bg-muted/50 rounded-lg p-3"><dt className="text-muted-foreground text-xs">{k}</dt><dd className="font-display text-2xl">{v}</dd></div>
          ))}
          <div className="bg-muted/50 rounded-lg p-3"><dt className="text-muted-foreground text-xs">Step 6: remove cloud copies</dt><dd className="text-sm font-semibold">Waiting for written approval</dd></div>
        </dl>
      )}
      {d && d.total !== d.cloud_copies && (
        <p className="text-muted-foreground text-sm">Total counts evidence records; cloud copies counts files in cloud storage. {Math.abs(d.cloud_copies - d.total)} cloud file(s) have no evidence record and are not part of the move.</p>
      )}

      {stop && (
        <div role="alert" className="border-destructive border-l-4 pl-3 text-sm">
          <p className="font-semibold">Move stopped: hash mismatch</p>
          <p className="font-mono break-all">{stop.filename} · {stop.path}</p>
          <p className="font-mono break-all">Recorded {stop.expected} · DarkNight {stop.got ?? 'none'}</p>
          <p>Nothing after this artefact was moved. The cloud original is untouched.</p>
        </div>
      )}

      {owner && (
        <div className="flex flex-wrap items-center gap-3">
          <Button className="min-h-11" disabled={!d?.gateway_connected || !d?.frozen || run.isPending} onClick={() => run.mutate()}>
            {run.isPending ? 'Moving…' : 'Start move'}
          </Button>
          <span className="text-muted-foreground text-sm">
            {!d?.gateway_connected ? `${DARKNIGHT_NOT_CONNECTED}: the move cannot run until the secure route is decided.` : !d?.frozen ? 'Switch the freeze on first.' : 'Copies each file to DarkNight under its existing folder path; DarkNight re-hashes it.'}
          </span>
        </div>
      )}
      {status && <p role="status" className="text-sm">{status}</p>}
      <Refusal text={err} />
    </section>
  );
}
