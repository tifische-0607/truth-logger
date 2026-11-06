import { useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { Bell, Copy, Download, FileText, Plus, Upload, UserRound } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { downloadLibraryDocument } from '@/lib/library-download';
import { createClientInvite, getSiteConfig } from '@/lib/portal.functions';
import { clientAdmins, errorMessage, type ClientAdmin } from '@/lib/portal-access';
import { formatBytes } from '@/lib/format';
import { hubDate } from '@/lib/hub';
import { authReturnUrl } from '@/lib/site-config';
import {
  STAGES, STAGE_NOTES, actionWord, activityCsv, amendedBy, engagementSentence, portalApi, stageName, statusWord, WHATS_NEW,
  type PortalBrief, type PortalDashboard, type PortalDoc, type PortalEngagement, type PortalEvent,
} from '@/lib/portal-data';
import { sampleAdmins, sampleBriefs } from '@/lib/portal-sample';
import { Kicker } from '@/components/BrandLogo';
import { UsersSection } from '@/components/portal/UsersSection';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

export type PortalCtx = {
  sample: boolean;
  /** True only for a signed-in client administrator; staff previews and Sample mode are read only. */
  canAct: boolean;
  dash: PortalDashboard;
  engagements: PortalEngagement[];
  docs: PortalDoc[];
  activity: PortalEvent[];
  openEngagement: (id: string) => void;
  goDocuments: () => void;
  refresh: () => void;
};

const TONE = { positive: 'bg-done text-done-foreground', caution: 'bg-running text-running-foreground', info: 'bg-queued text-queued-foreground', negative: 'bg-failed text-failed-foreground' };
const DOT = { positive: 'bg-positive', caution: 'bg-caution', info: 'bg-info', negative: 'bg-negative' };
export function StatusChip({ tone, children }: { tone: keyof typeof TONE; children: React.ReactNode }) {
  return <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap', TONE[tone])}><span aria-hidden className={cn('size-2 rounded-full', DOT[tone])} />{children}</span>;
}
const engTone = (e: PortalEngagement) => (e.status === 'paused' ? 'caution' : e.stage === 5 || e.status === 'closed' ? 'positive' : 'info');
const isIndividual = (d: PortalDashboard) => d.kind === 'individual';
const dateTime = (v?: string | null) => (v ? new Date(v).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');
const ReadOnlyNote = ({ ctx }: { ctx: PortalCtx }) => (!ctx.canAct ? <p className="text-muted-foreground text-sm">{ctx.sample ? 'Sample mode: nothing here is saved.' : 'Staff preview: read only. Only the client’s administrators can make changes.'}</p> : null);

export function PageTitle({ kicker, title, sub }: { kicker: string; title: string; sub?: string }) {
  return <div><Kicker>{kicker}</Kicker><h1 className="font-display text-2xl font-medium sm:text-3xl">{title}</h1>{sub ? <p className="text-muted-foreground mt-1">{sub}</p> : null}</div>;
}

export function StageBar({ stage }: { stage: number }) {
  return (
    <ol className="grid grid-cols-5 gap-1" aria-label={`Stage ${stage} of 5: ${stageName(stage)}`}>
      {STAGES.map((s, i) => {
        const state = i + 1 < stage ? 'Done' : i + 1 === stage ? 'Current' : 'Not started';
        return (
          <li key={s} className="min-w-0">
            <div className={cn('h-2 rounded-full', i + 1 <= stage ? 'bg-brand-mid' : 'bg-muted')} />
            <p className={cn('mt-1 truncate text-xs', i + 1 === stage ? 'font-semibold' : 'text-muted-foreground')}>{s}</p>
            <span className="sr-only">{state}</span>
          </li>
        );
      })}
    </ol>
  );
}

/* ---------------------------------------------------------------- downloads */
function useDownload(sample: boolean) {
  const [state, setState] = useState<{ id: string; msg: string; bad: boolean } | null>(null);
  async function run(d: PortalDoc) {
    if (sample) { setState({ id: d.id, msg: 'Sample document: there is no file to download.', bad: false }); return; }
    setState({ id: d.id, msg: 'Fetching from DarkNight and checking the file…', bad: false });
    try {
      const r = await downloadLibraryDocument(d.id);
      setState({ id: d.id, msg: r.message, bad: !r.ok });
    } catch (e) { setState({ id: d.id, msg: errorMessage(e), bad: true }); }
  }
  return { run, state };
}

export function DocCard({ d, engagement, dl }: { d: PortalDoc; engagement?: string | undefined; dl: ReturnType<typeof useDownload> }) {
  const can = (!!d.home_path || !!d.storage_path) && !d.manifest_only;
  return (
    <article className="panel space-y-3 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-mono text-xs text-muted-foreground">{d.code} · version {d.version}</p>
          <h3 className="font-display text-lg font-medium break-words">{d.title}</h3>
          <p className="text-muted-foreground text-sm">{d.source === 'client' ? 'From you' : 'From FridayAnalytics'} · {hubDate(d.created_at)}{engagement ? ` · ${engagement}` : ''}{d.size_bytes ? ` · ${formatBytes(d.size_bytes)}` : ''}</p>
        </div>
        {can ? <Button className="min-h-11" variant="outline" onClick={() => void dl.run(d)}><Download className="size-4" />Download</Button>
          : <StatusChip tone="info">{d.manifest_only ? 'Manifest and hash only' : 'Record only, no file'}</StatusChip>}
      </div>
      <p className="font-mono text-xs break-all"><span className="text-muted-foreground font-sans">SHA-256 </span>{d.sha256 ?? '—'}</p>
      {dl.state?.id === d.id ? <p role={dl.state.bad ? 'alert' : 'status'} className={cn('rounded-md p-2 text-sm', dl.state.bad ? 'bg-failed text-failed-foreground' : 'bg-muted')}>{dl.state.msg}</p> : null}
    </article>
  );
}

/* ---------------------------------------------------------------- dashboard */
export function DashboardTab({ ctx }: { ctx: PortalCtx }) {
  const dl = useDownload(ctx.sample);
  const { dash } = ctx;
  const since = dash.previous_sign_in;
  const fresh = ctx.docs.filter(d => since && d.created_at > since && d.source !== 'client');
  const active = ctx.engagements.filter(e => e.status !== 'closed' && e.stage < 5);
  const engName = (id: string | null) => ctx.engagements.find(e => e.id === id)?.name;
  const attention: string[] = [];
  if (fresh.length) attention.push(`${fresh.length} new document${fresh.length === 1 ? '' : 's'} from FridayAnalytics since your last visit.`);
  if (dash.pending_invites) attention.push(`${dash.pending_invites} administrator invitation${dash.pending_invites === 1 ? ' is' : 's are'} waiting to be accepted.`);
  if (dash.admins_used < 2) attention.push('One administrator slot is free. You can invite a second administrator in Administration.');
  const news = ctx.activity.filter(e => WHATS_NEW.has(e.action)).slice(0, 6);
  const counts: [string, number | string][] = [
    ['Active engagements', active.length], ['New documents since last visit', fresh.length], ['All documents', ctx.docs.length], ['Administrators', `${dash.admins_used} of 2`],
  ];
  return (
    <div className="space-y-6">
      <section aria-labelledby="attention" className="panel p-5">
        <h2 id="attention" className="font-display flex items-center gap-2 text-lg font-medium"><Bell className="size-5" />Needs your attention</h2>
        {attention.length ? <ul className="mt-2 list-disc space-y-1 pl-5">{attention.map(a => <li key={a}>{a}</li>)}</ul> : <p className="text-muted-foreground mt-2">Nothing needs your attention right now.</p>}
      </section>
      <EarlyWarningNotices clientId={ctx.dash.client_id} sample={ctx.sample} />
      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {counts.map(([k, v]) => <div key={k} className="panel p-4"><dt className="text-muted-foreground text-sm">{k}</dt><dd className="font-display text-3xl font-medium">{v}</dd></div>)}
      </dl>
      <section className="space-y-3">
        <h2 className="font-display text-xl font-medium">Your engagements</h2>
        {ctx.engagements.length === 0 ? <p className="text-muted-foreground">There are no engagements yet.</p> : (
          <div className="grid gap-3 md:grid-cols-2">{ctx.engagements.map(e => <EngagementCard key={e.id} e={e} onOpen={() => ctx.openEngagement(e.id)} />)}</div>
        )}
      </section>
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-3"><h2 className="font-display text-xl font-medium">Recent documents</h2><Button variant="ghost" className="min-h-11" onClick={ctx.goDocuments}>All documents</Button></div>
          {ctx.docs.length === 0 ? <p className="text-muted-foreground">No documents have been shared yet.</p> : ctx.docs.slice(0, 3).map(d => <DocCard key={d.id} d={d} engagement={engName(d.engagement_id)} dl={dl} />)}
        </section>
        <section className="space-y-3">
          <h2 className="font-display text-xl font-medium">What is new</h2>
          {news.length === 0 ? <p className="text-muted-foreground">Nothing new yet.</p> : (
            <ol className="panel divide-y">{news.map(e => <li key={e.id} className="p-3"><p className="font-medium">{actionWord(e.action)}{e.subject ? `: ${e.subject}` : ''}</p><p className="text-muted-foreground text-sm">{e.person} · {hubDate(e.at)}</p></li>)}</ol>
          )}
          <div className="panel p-4">
            <h3 className="font-semibold">Contact FridayAnalytics</h3>
            <p className="mt-1">Email <a className="text-link underline" href="mailto:curator@fridayanalytics.org">curator@fridayanalytics.org</a></p>
          </div>
        </section>
      </div>
    </div>
  );
}

function EngagementCard({ e, onOpen }: { e: PortalEngagement; onOpen: () => void }) {
  return (
    <article className="panel space-y-3 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div><p className="font-mono text-xs text-muted-foreground">{e.code}</p><h3 className="font-display text-lg font-medium">{e.name}</h3></div>
        <StatusChip tone={engTone(e)}>{statusWord(e.status)} · {stageName(e.stage)}</StatusChip>
      </div>
      <StageBar stage={e.stage} />
      <p>{engagementSentence(e)}</p>
      <Button variant="outline" className="min-h-11" onClick={onOpen}>Open engagement</Button>
    </article>
  );
}

/* ---------------------------------------------------------------- engagements */
export function EngagementsTab({ ctx, openId, onBack }: { ctx: PortalCtx; openId?: string | undefined; onBack: () => void }) {
  const e = ctx.engagements.find(x => x.id === openId);
  if (!e) return (
    <div className="space-y-4">
      {ctx.engagements.length === 0 ? <p className="text-muted-foreground">There are no engagements yet.</p>
        : <div className="grid gap-3 md:grid-cols-2">{ctx.engagements.map(x => <EngagementCard key={x.id} e={x} onOpen={() => ctx.openEngagement(x.id)} />)}</div>}
    </div>
  );
  return <EngagementDetail ctx={ctx} e={e} onBack={onBack} />;
}

function EngagementDetail({ ctx, e, onBack }: { ctx: PortalCtx; e: PortalEngagement; onBack: () => void }) {
  const dl = useDownload(ctx.sample);
  const briefs = useQuery({ queryKey: ['portal-briefs', e.id, ctx.sample], queryFn: () => (ctx.sample ? Promise.resolve(e.stage > 1 || e.id === 's-e1' ? sampleBriefs : []) : portalApi.briefs(e.id)) });
  const docs = ctx.docs.filter(d => d.engagement_id === e.id);
  const list = briefs.data ?? [];
  const inForce = list[list.length - 1];
  const row = (label: string, field: keyof PortalBrief, value: React.ReactNode) => {
    const m = amendedBy(list, field);
    return <div className="grid gap-1 border-b py-3 sm:grid-cols-[12rem_1fr]"><dt className="text-muted-foreground">{label}</dt><dd className="break-words">{value || '—'}{m ? <span className="ml-2"><StatusChip tone="caution">Amended by {m}</StatusChip></span> : null}</dd></div>;
  };
  return (
    <div className="space-y-6">
      <Button variant="ghost" className="min-h-11" onClick={onBack}>← All engagements</Button>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <PageTitle kicker={e.code} title={e.name} sub={`Opened ${hubDate(e.opened_on)}${e.due_on ? ` · Due ${hubDate(e.due_on)}` : ''}`} />
        <StatusChip tone={engTone(e)}>{statusWord(e.status)} · {stageName(e.stage)}</StatusChip>
      </div>
      <section className="panel space-y-4 p-5">
        <h2 className="font-display text-xl font-medium">Stages</h2>
        <ol className="space-y-3">
          {STAGES.map((s, i) => {
            const n = i + 1; const word = n < e.stage ? 'Done' : n === e.stage ? 'Current' : 'Not started';
            return <li key={s} className="flex gap-3"><span className={cn('mt-1.5 size-3 shrink-0 rounded-full', n < e.stage ? 'bg-positive' : n === e.stage ? 'bg-info' : 'bg-muted')} aria-hidden /><div><p className="font-semibold">{n}. {s} <span className="text-muted-foreground font-normal">· {word}</span></p><p className="text-muted-foreground text-sm">{STAGE_NOTES[i]}</p></div></li>;
          })}
        </ol>
      </section>
      <section className="panel p-5">
        <h2 className="font-display text-xl font-medium">Brief in force</h2>
        {briefs.error ? <p role="alert" className="bg-failed text-failed-foreground mt-2 rounded-md p-3">{errorMessage(briefs.error)}</p>
          : !inForce ? <p className="text-muted-foreground mt-2">The signed brief appears here once it has been agreed with you.</p> : (
            <>
              <p className="text-muted-foreground mt-1 text-sm">Version {inForce.version}{inForce.amendment_no ? ` · includes amendments up to A${inForce.amendment_no}` : ' · as signed'} · {hubDate(inForce.authored_at)}</p>
              <dl className="mt-2">
                {row('Situation', 'situation', inForce.situation)}
                {row('Objectives', 'objectives', inForce.objectives.length ? <ul className="list-disc pl-5">{inForce.objectives.map(o => <li key={o}>{o}</li>)}</ul> : null)}
                {row('Platforms', 'platforms', inForce.platforms.join(', '))}
                {row('Languages', 'languages', inForce.languages.join(', '))}
                {row('Time window from', 'window_from', inForce.window_from ? hubDate(inForce.window_from) : null)}
                {row('Time window to', 'window_to', inForce.window_to ? hubDate(inForce.window_to) : null)}
                {row('In scope', 'in_scope', inForce.in_scope)}
                {row('Out of scope', 'out_of_scope', inForce.out_of_scope)}
              </dl>
              {list.filter(b => b.amendment_no).map(b => <p key={b.version} className="mt-3 text-sm"><StatusChip tone="caution">A{b.amendment_no}</StatusChip> <span className="ml-1">{b.change_summary ?? 'Approved amendment'} · {hubDate(b.authored_at)}</span></p>)}
            </>
          )}
      </section>
      <section className="space-y-3">
        <h2 className="font-display text-xl font-medium">Documents for this engagement</h2>
        {docs.length === 0 ? <p className="text-muted-foreground">No documents have been shared for this engagement yet.</p> : docs.map(d => <DocCard key={d.id} d={d} dl={dl} />)}
      </section>
    </div>
  );
}

/* ---------------------------------------------------------------- documents */
export function DocumentsTab({ ctx }: { ctx: PortalCtx }) {
  const dl = useDownload(ctx.sample);
  const [from, setFrom] = useState<'all' | 'fa' | 'client'>('all');
  const [q, setQ] = useState('');
  const [eng, setEng] = useState('all');
  const [uploadOpen, setUploadOpen] = useState(false);
  const shown = ctx.docs.filter(d => (from === 'all' || d.source === from) && (eng === 'all' || d.engagement_id === eng)
    && (!q.trim() || `${d.title} ${d.code} ${d.sha256 ?? ''}`.toLowerCase().includes(q.trim().toLowerCase())));
  const engName = (id: string | null) => ctx.engagements.find(e => e.id === id)?.name;
  const tierNote = useQuery({ queryKey: ['report-access-note', ctx.sample], queryFn: async () => {
    if (ctx.sample) return { any_set: false };
    const { data, error } = await supabase.rpc('portal_report_access_note'); if (error) throw error; return data as unknown as { any_set: boolean };
  } });
  return (
    <div className="space-y-4">
      {tierNote.data && !tierNote.data.any_set ? <p role="note" className="bg-muted rounded-md p-3 text-sm">Report access by tier not yet set. Every report shared with you is visible on every tier.</p> : null}
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Who the document is from">
        {([['all', 'All'], ['fa', 'From FridayAnalytics'], ['client', 'From you']] as const).map(([k, l]) => (
          <Button key={k} className="min-h-11" variant={from === k ? 'default' : 'outline'} aria-pressed={from === k} onClick={() => setFrom(k)}>{l} ({ctx.docs.filter(d => k === 'all' || d.source === k).length})</Button>
        ))}
        <Button className="min-h-11 ml-auto" onClick={() => setUploadOpen(true)} disabled={!ctx.canAct && !ctx.sample}><Upload className="size-4" />Send a document</Button>
      </div>
      <div className="grid gap-3 sm:grid-cols-[1fr_16rem]">
        <div className="space-y-1"><Label htmlFor="doc-search">Search title, code or SHA-256</Label><Input id="doc-search" className="min-h-11" value={q} onChange={e => setQ(e.target.value)} /></div>
        <div className="space-y-1"><Label htmlFor="doc-eng">Engagement</Label>
          <Select value={eng} onValueChange={setEng}><SelectTrigger id="doc-eng" className="min-h-11"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="all">All engagements</SelectItem>{ctx.engagements.map(e => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}</SelectContent></Select>
        </div>
      </div>
      <p className="text-muted-foreground text-sm" role="status">Showing {shown.length} of {ctx.docs.length} documents.</p>
      {shown.length === 0 ? <p className="text-muted-foreground">No documents match.</p> : <div className="grid gap-3">{shown.map(d => <DocCard key={d.id} d={d} engagement={engName(d.engagement_id)} dl={dl} />)}</div>}
      <UploadDialog ctx={ctx} open={uploadOpen} onOpenChange={setUploadOpen} />
    </div>
  );
}

function UploadDialog({ open, onOpenChange }: { ctx: PortalCtx; open: boolean; onOpenChange: (o: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Send a document</DialogTitle><DialogDescription>Documents are kept only on FridayAnalytics' own secure server, never in the cloud, so they cannot be uploaded here.</DialogDescription></DialogHeader>
        <p className="text-sm">Email the document to <a className="font-medium underline" href="mailto:curator@fridayanalytics.org">curator@fridayanalytics.org</a>. FridayAnalytics will add it, record its SHA-256, and it will then appear under "From you".</p>
        <Button className="min-h-11" variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
      </DialogContent>
    </Dialog>
  );
}

/* ---------------------------------------------------------------- administration */
const PILLS = ['Team', 'Organisation', 'Activity', 'Security and notifications'] as const;
export function AdministrationTab({ ctx, pill, setPill }: { ctx: PortalCtx; pill: string; setPill: (p: string) => void }) {
  // A signed-in client user who is not an administrator only manages their own security settings.
  const pills: readonly string[] = ctx.canAct && !ctx.dash.is_admin ? ['Security and notifications'] : PILLS;
  const current = pills.includes(pill) ? pill : pills[0]!;
  const label = (p: string) => (p === 'Organisation' && isIndividual(ctx.dash) ? 'Your details' : p);
  return (
    <div className="space-y-5">
      <nav aria-label="Administration sections" className="flex flex-wrap gap-2">
        {pills.map(p => <Button key={p} className="min-h-11 rounded-full" variant={current === p ? 'default' : 'outline'} aria-current={current === p ? 'page' : undefined} onClick={() => setPill(p)}>{label(p)}</Button>)}
      </nav>
      {current === 'Team' ? <><TeamPill ctx={ctx} /><UsersSection ctx={ctx} /></> : current === 'Organisation' ? <OrganisationPill ctx={ctx} /> : current === 'Activity' ? <ActivityPill ctx={ctx} /> : <SecurityPill ctx={ctx} />}
    </div>
  );
}

export const CAP_MESSAGE = 'A client can have at most 2 administrators.';
function TeamPill({ ctx }: { ctx: PortalCtx }) {
  const qc = useQueryClient(); const inviteFn = useServerFn(createClientInvite);
  const cid = ctx.dash.client_id;
  const admins = useQuery({ queryKey: ['client-admins', cid, ctx.sample], queryFn: () => (ctx.sample ? Promise.resolve(sampleAdmins) : clientAdmins(cid)) });
  const [open, setOpen] = useState(false); const [name] = useState(''); const [email] = useState(''); const [link, setLink] = useState('');
  const [sampleNote, setSampleNote] = useState('');
  const inviteBtn = useRef<HTMLButtonElement>(null);
  const [sampleCancelled, setSampleCancelled] = useState<string[]>([]);
  const refresh = () => { void qc.invalidateQueries({ queryKey: ['client-admins', cid] }); ctx.refresh(); };
  const invite = useMutation({
    mutationFn: async (existing?: ClientAdmin) => {
      if (ctx.sample) return { link: '' };
      return inviteFn({ data: { clientId: cid, name: existing?.name ?? name, email: existing?.email ?? email, ...(existing ? { existingId: existing.id } : {}) } });
    },
    onSuccess: r => { if (ctx.sample) { setSampleNote('Sample mode: no invitation was recorded.'); return; } setLink(r.link); setOpen(true); refresh(); },
  });
  const cancel = useMutation({
    mutationFn: async (id: string) => { if (ctx.sample) { setSampleCancelled(c => [...c, id]); return; } const { error } = await supabase.rpc('portal_admin_action', { rid: id, a: 'cancel' }); if (error) throw error; },
    onSuccess: () => { if (ctx.sample) setSampleNote('Sample mode: the invitation is hidden on this screen only; nothing was saved.'); else refresh(); },
  });
  const used = (admins.data ?? []).filter(a => (a.role ?? 'client_admin') === 'client_admin' && a.status !== 'inactive' && !sampleCancelled.includes(a.id));
  const full = used.length >= 2; const busy = invite.isPending || cancel.isPending;
  const actionable = ctx.canAct || ctx.sample;
  return (
    <section className="space-y-4" aria-labelledby="team-h">
      <h2 id="team-h" className="font-display text-xl font-medium">Administrators</h2>
      <p className="text-muted-foreground text-sm">{used.length} of 2 administrator slots used. Invitations are recorded and you copy the link to send it; no email is sent.</p>
      <ReadOnlyNote ctx={ctx} />
      {[admins.error, invite.error, cancel.error].filter(Boolean).map((e, i) => <p key={i} role="alert" className="bg-failed text-failed-foreground rounded-md p-3 text-sm">{errorMessage(e)}</p>)}
      {sampleNote ? <p role="status" className="bg-muted rounded-md p-3 text-sm">{sampleNote}</p> : null}
      <ul className="space-y-2">
        {used.map(a => (
          <li key={a.id} className="panel flex flex-wrap items-center gap-3 p-4">
            <UserRound className="text-muted-foreground size-5" />
            <div className="min-w-0 flex-1 basis-40"><p className="font-medium">{a.name}{a.email === ctx.dash.email ? ' (you)' : ''}</p><p className="text-muted-foreground text-sm break-all">{a.email}</p>
              <p className="text-muted-foreground text-xs">{a.status === 'pending' ? `Invitation expires ${hubDate(a.invite_expires_at)}` : `Last sign-in ${dateTime(a.last_sign_in)}`}</p></div>
            <StatusChip tone={a.status === 'pending' ? 'caution' : 'positive'}>{a.status === 'pending' ? 'Pending invitation' : 'Active'}</StatusChip>
            {a.status === 'pending' && actionable ? <div className="flex flex-wrap gap-2"><Button variant="outline" className="min-h-11" disabled={busy} onClick={() => invite.mutate(a)}>Resend</Button><Button variant="outline" className="min-h-11" disabled={busy} onClick={() => cancel.mutate(a.id)}>Cancel invitation</Button></div> : null}
          </li>
        ))}
        {Array.from({ length: Math.max(0, 2 - used.length) }, (_, i) => <li key={`free-${i}`} className="text-muted-foreground flex items-center gap-3 rounded-md border border-dashed p-4"><UserRound className="size-5" />Free administrator slot</li>)}
      </ul>
      <p className="text-muted-foreground text-sm">Only FridayAnalytics can remove an active administrator. Contact curator@fridayanalytics.org.</p>
      <p className="text-sm" role="note">FridayAnalytics issues administrator logins (one or two per client).{full ? ` ${CAP_MESSAGE}` : ''}</p>
      <Dialog open={open} onOpenChange={v => { setOpen(v); if (!v) setLink(''); }}>
        <DialogContent onCloseAutoFocus={e => { e.preventDefault(); inviteBtn.current?.focus(); }}>
          <DialogHeader><DialogTitle>Invitation recorded</DialogTitle>
            <DialogDescription>Copy this single-use link and send it to the person you invited. It expires in 7 days.</DialogDescription></DialogHeader>
          <div className="space-y-3"><Input aria-label="Invitation link" type="password" readOnly value={link} className="min-h-11" /><Button className="min-h-11" onClick={() => void navigator.clipboard.writeText(link)}><Copy className="size-4" />Copy invitation link</Button></div>
        </DialogContent>
      </Dialog>
    </section>
  );
}

function OrganisationPill({ ctx }: { ctx: PortalCtx }) {
  const o = ctx.dash.organisation; const indiv = isIndividual(ctx.dash);
  const [f, setF] = useState({ display: o.display_name ?? '', contact: o.contact_name ?? '', mail: o.contact_email ?? '', tel: o.phone ?? '', tz: o.time_zone });
  const [msg, setMsg] = useState<{ t: string; bad: boolean } | null>(null);
  const zones = useMemo(() => { try { return (Intl as unknown as { supportedValuesOf: (k: string) => string[] }).supportedValuesOf('timeZone'); } catch { return [o.time_zone]; } }, [o.time_zone]);
  const save = useMutation({
    mutationFn: async () => {
      if (ctx.sample) return;
      const { error } = await (supabase.rpc as unknown as (f: string, a: object) => Promise<{ error: unknown }>)('portal_update_organisation', { c: ctx.dash.client_id, display: f.display, contact: f.contact, contact_mail: f.mail, tel: f.tel, tz: f.tz });
      if (error) throw error;
    },
    onSuccess: () => { setMsg({ t: ctx.sample ? 'Sample mode: nothing was saved.' : 'Saved.', bad: false }); ctx.refresh(); },
    onError: e => setMsg({ t: errorMessage(e), bad: true }),
  });
  const field = (id: keyof typeof f, label: string, type = 'text') => <div className="space-y-1"><Label htmlFor={`org-${id}`}>{label}</Label><Input id={`org-${id}`} type={type} className="min-h-11" value={f[id]} disabled={!ctx.canAct && !ctx.sample} onChange={e => setF({ ...f, [id]: e.target.value })} /></div>;
  return (
    <section className="space-y-4" aria-labelledby="org-h">
      <h2 id="org-h" className="font-display text-xl font-medium">{indiv ? 'Your details' : 'Organisation'}</h2>
      <ReadOnlyNote ctx={ctx} />
      <dl className="panel grid gap-2 p-4 sm:grid-cols-[12rem_1fr]">
        <dt className="text-muted-foreground">Client type</dt><dd>{indiv ? 'Individual' : 'Organisation'} <span className="text-muted-foreground text-sm">· set by FridayAnalytics</span></dd>
        <dt className="text-muted-foreground">{indiv ? 'Your legal name' : 'Legal name'}</dt><dd>{o.legal_name ?? '—'} <span className="text-muted-foreground text-sm">· set by FridayAnalytics</span></dd>
      </dl>
      <form className="grid gap-4 sm:grid-cols-2" onSubmit={e => { e.preventDefault(); setMsg(null); save.mutate(); }}>
        {field('display', indiv ? 'Your name (as shown)' : 'Organisation display name')}
        {field('contact', 'Contact person')}
        {field('mail', 'Contact email', 'email')}
        {field('tel', 'Phone', 'tel')}
        <div className="space-y-1"><Label htmlFor="org-tz">Time zone</Label>
          <Select value={f.tz} onValueChange={v => setF({ ...f, tz: v })} disabled={!ctx.canAct && !ctx.sample}><SelectTrigger id="org-tz" className="min-h-11"><SelectValue /></SelectTrigger>
            <SelectContent className="max-h-72">{zones.map(z => <SelectItem key={z} value={z}>{z}</SelectItem>)}</SelectContent></Select></div>
        <div className="flex items-end"><Button type="submit" className="min-h-11" disabled={save.isPending || (!ctx.canAct && !ctx.sample)}>{save.isPending ? 'Saving…' : 'Save details'}</Button></div>
        {msg ? <p role={msg.bad ? 'alert' : 'status'} className={cn('rounded-md p-3 text-sm sm:col-span-2', msg.bad ? 'bg-failed text-failed-foreground' : 'bg-muted')}>{msg.t}</p> : null}
      </form>
    </section>
  );
}

function ActivityPill({ ctx }: { ctx: PortalCtx }) {
  const [person, setPerson] = useState('all'); const [type, setType] = useState('all'); const [copied, setCopied] = useState('');
  const people = [...new Set(ctx.activity.map(a => a.person))];
  const rows = ctx.activity.filter(a => (person === 'all' || a.person === person) && (type === 'all' || a.type === type));
  return (
    <section className="space-y-4" aria-labelledby="act-h">
      <h2 id="act-h" className="font-display text-xl font-medium">Activity</h2>
      <p className="text-muted-foreground text-sm">A read-only record of sign-ins, administrator changes and shared documents.</p>
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-56 space-y-1"><Label htmlFor="act-person">Person</Label><Select value={person} onValueChange={setPerson}><SelectTrigger id="act-person" className="min-h-11"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Everyone</SelectItem>{people.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent></Select></div>
        <div className="w-56 space-y-1"><Label htmlFor="act-type">Type</Label><Select value={type} onValueChange={setType}><SelectTrigger id="act-type" className="min-h-11"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All types</SelectItem><SelectItem value="document">Documents</SelectItem><SelectItem value="access">Access and team</SelectItem></SelectContent></Select></div>
        <Button variant="outline" className="min-h-11" onClick={async () => { try { await navigator.clipboard.writeText(activityCsv(rows)); setCopied(`Copied ${rows.length} rows as CSV.`); } catch { setCopied('Copy failed: your browser blocked the clipboard.'); } }}><Copy className="size-4" />Copy as CSV</Button>
      </div>
      {copied ? <p role="status" className="text-sm">{copied}</p> : null}
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full min-w-[36rem] text-sm">
          <thead className="bg-brand-mid text-on-gradient"><tr><th className="p-3 text-left font-semibold">When</th><th className="p-3 text-left font-semibold">Person</th><th className="p-3 text-left font-semibold">Action</th><th className="p-3 text-left font-semibold">About</th></tr></thead>
          <tbody>{rows.map(r => <tr key={r.id} className="border-t even:bg-muted/50"><td className="p-3 whitespace-nowrap">{dateTime(r.at)}</td><td className="p-3">{r.person}</td><td className="p-3">{actionWord(r.action)}</td><td className="p-3">{r.code ? <span className="font-mono text-xs">{r.code} </span> : null}{r.subject ?? '—'}</td></tr>)}
            {rows.length === 0 ? <tr><td colSpan={4} className="text-muted-foreground p-3">No activity.</td></tr> : null}</tbody>
        </table>
      </div>
    </section>
  );
}

function SecurityPill({ ctx }: { ctx: PortalCtx }) {
  const config = useServerFn(getSiteConfig);
  const [pw, setPw] = useState(''); const [pw2, setPw2] = useState('');
  const [msg, setMsg] = useState<Record<string, { t: string; bad: boolean }>>({});
  const [notify, setNotify] = useState(ctx.dash.notify ?? { new_documents: true, engagement_updates: true, team_changes: true });
  const say = (k: string, t: string, bad = false) => setMsg(m => ({ ...m, [k]: { t, bad } }));
  const disabled = !ctx.canAct && !ctx.sample;
  const session = useQuery({ queryKey: ['portal-session', ctx.sample], queryFn: async () => (ctx.sample ? { created: new Date().toISOString() } : { created: (await supabase.auth.getUser()).data.user?.last_sign_in_at ?? null }) });
  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    if (pw.length < 12) return say('pw', 'Use at least 12 characters.', true);
    if (pw !== pw2) return say('pw', 'The two passwords do not match.', true);
    if (ctx.sample) return say('pw', 'Sample mode: the password was not changed.');
    const { error } = await supabase.auth.updateUser({ password: pw });
    if (error) say('pw', error.message, true); else { setPw(''); setPw2(''); say('pw', 'Password changed.'); }
  }
  async function signInLink() {
    if (ctx.sample) return say('link', 'Sample mode: no link was sent.');
    if (!ctx.dash.email) return;
    let siteUrl: string;
    try { ({ siteUrl } = await config()); } catch { return say('link', 'Temporarily unavailable, please try again later.', true); }
    const { error } = await supabase.auth.signInWithOtp({ email: ctx.dash.email, options: { shouldCreateUser: false, emailRedirectTo: authReturnUrl(siteUrl, window.location.origin, '/auth') } });
    say('link', error ? error.message : `A sign-in link was sent to ${ctx.dash.email}.`, !!error);
  }
  async function signOut(scope: 'others' | 'global') {
    if (ctx.sample) return say('sess', 'Sample mode: no sessions were signed out.');
    const { error } = await supabase.auth.signOut({ scope });
    say('sess', error ? error.message : scope === 'others' ? 'Signed out on all other devices.' : 'Signed out everywhere.', !!error);
  }
  async function saveNotify(next: typeof notify) {
    setNotify(next);
    if (ctx.sample) return say('notify', 'Sample mode: preferences were not saved.');
    const { error } = await (supabase.rpc as unknown as (f: string, a: object) => Promise<{ error: unknown }>)('portal_set_notifications', { prefs: next });
    if (error) { setNotify(notify); say('notify', errorMessage(error), true); } else say('notify', 'Preferences saved.');
  }
  const Msg = ({ k }: { k: string }) => (msg[k] ? <p role={msg[k].bad ? 'alert' : 'status'} className={cn('rounded-md p-3 text-sm', msg[k].bad ? 'bg-failed text-failed-foreground' : 'bg-muted')}>{msg[k].t}</p> : null);
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <ReadOnlyNote ctx={ctx} />
      <section className="panel space-y-3 p-5 lg:col-span-1"><h2 className="font-display text-lg font-medium">Change password</h2>
        <form className="space-y-3" onSubmit={changePassword}>
          <div className="space-y-1"><Label htmlFor="pw1">New password (12 characters or more)</Label><Input id="pw1" type="password" autoComplete="new-password" className="min-h-11" value={pw} disabled={disabled} onChange={e => setPw(e.target.value)} /></div>
          <div className="space-y-1"><Label htmlFor="pw2">Repeat new password</Label><Input id="pw2" type="password" autoComplete="new-password" className="min-h-11" value={pw2} disabled={disabled} onChange={e => setPw2(e.target.value)} /></div>
          <Button type="submit" className="min-h-11" disabled={disabled}>Change password</Button><Msg k="pw" />
        </form></section>
      <section className="panel space-y-3 p-5"><h2 className="font-display text-lg font-medium">Sign-in link</h2>
        <p className="text-muted-foreground text-sm">Send a one-time sign-in link to {ctx.dash.email ?? 'your email'}.</p>
        <Button className="min-h-11" variant="outline" disabled={disabled} onClick={() => void signInLink()}>Send sign-in link</Button><Msg k="link" /></section>
      <section className="panel space-y-3 p-5"><h2 className="font-display text-lg font-medium">Sessions</h2>
        <ul><li className="flex flex-wrap items-center justify-between gap-2"><span>This device · signed in {dateTime(session.data?.created)}</span><StatusChip tone="positive">Current session</StatusChip></li></ul>
        <p className="text-muted-foreground text-sm">Other devices are not listed individually. You can sign them out here.</p>
        <div className="flex flex-wrap gap-2"><Button variant="outline" className="min-h-11" disabled={disabled} onClick={() => void signOut('others')}>Sign out other devices</Button><Button variant="outline" className="min-h-11" disabled={disabled} onClick={() => void signOut('global')}>Sign out everywhere</Button></div><Msg k="sess" /></section>
      <section className="panel space-y-3 p-5"><h2 className="font-display text-lg font-medium">Email notifications</h2>
        {([['new_documents', 'New documents shared with you'], ['engagement_updates', 'Engagement stage changes'], ['team_changes', 'Administrator and invitation changes']] as const).map(([k, l]) => (
          <div key={k} className="flex min-h-11 items-center justify-between gap-3"><Label htmlFor={`n-${k}`}>{l}</Label><div className="flex items-center gap-2"><span className="text-sm">{notify[k] ? 'On' : 'Off'}</span><Switch id={`n-${k}`} checked={notify[k]} disabled={disabled} onCheckedChange={v => void saveNotify({ ...notify, [k]: v })} /></div></div>
        ))}
        <p className="text-muted-foreground text-sm">Your choices are saved. Email delivery is not switched on yet.</p><Msg k="notify" /></section>
      <section className="panel space-y-2 p-5"><h2 className="font-display text-lg font-medium">Two-step verification</h2><StatusChip tone="info">Not available yet</StatusChip></section>
    </div>
  );
}

export { FileText };
