import { TAGLINE } from '@/lib/brand';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { hubHead } from '@/lib/hub';
import { errorMessage } from '@/lib/portal-access';
import { portalApi } from '@/lib/portal-data';
import { sampleDashboard, sampleDocs, sampleEngagements, sampleEvents } from '@/lib/portal-sample';
import { ThemeControl } from '@/components/ThemeControl';
import { Button } from '@/components/ui/button';
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '@/components/ui/select';
import { LogOut } from 'lucide-react';
import { DOCUMENT_FOOTER } from '@/lib/document-footer';
import { BaseStrip, COMPANY, GradientHero, Kicker, ProductLockup } from '@/components/BrandLogo';
import { BillingTab, PricingTab } from '@/components/portal/BillingTabs';
import { AdministrationTab, DashboardTab, DocumentsTab, EngagementsTab, PageTitle, StatusChip, type PortalCtx } from '@/components/portal/PortalScreens';

type Home = { preview: boolean; access_disabled?: boolean; clients?: { id: string; name: string }[]; client_id?: string; portal_enabled?: boolean };
const TABS = ['Dashboard', 'Engagements', 'Documents', 'Pricing', 'Billing', 'Administration'] as const;
const str = (v: unknown) => (typeof v === 'string' && v ? v : undefined);
const search = (r: Record<string, unknown>): { preview?: string | undefined; tab?: string | undefined; e?: string | undefined; pill?: string | undefined } => ({ preview: str(r['preview']), tab: str(r['tab']), e: str(r['e']), pill: str(r['pill']) });
export const Route = createFileRoute('/portal')({ validateSearch: search, head: () => hubHead('Client portal', 'Private client access to FA Portal.'), component: Portal });

function Portal() {
  const navigate = useNavigate({ from: '/portal' }); const qc = useQueryClient();
  const raw = Route.useSearch();
  const s = { preview: raw.preview ?? '', tab: raw.tab ?? 'Dashboard', e: raw.e ?? '', pill: raw.pill ?? 'Team' };
  const [clientId, setClientId] = useState('');
  const set = (p: Partial<typeof s>) => void navigate({ search: prev => ({ ...prev, ...p }) });
  const home = useQuery({ queryKey: ['portal-home', clientId], queryFn: async () => { const u = await supabase.auth.getUser(); if (!u.data.user) return null; const { data, error } = await supabase.rpc('portal_home', clientId ? { c: clientId } : {}); if (error) throw error; return data as unknown as Home; } });
  const h = home.data;
  const sample = !!h?.preview && s.preview === 'sample';
  const cid = sample ? '' : h?.client_id ?? '';
  const live = !!cid && (h?.portal_enabled || h?.preview) && !h?.access_disabled;
  const arg = h?.preview ? cid : undefined;
  const dash = useQuery({ queryKey: ['portal-dash', cid], enabled: !!live, queryFn: () => portalApi.dashboard(arg) });
  const engs = useQuery({ queryKey: ['portal-engs', cid], enabled: !!live, queryFn: () => portalApi.engagements(arg) });
  const docs = useQuery({ queryKey: ['portal-docs', cid], enabled: !!live, queryFn: () => portalApi.documents(cid) });
  const act = useQuery({ queryKey: ['portal-act', cid], enabled: !!live, queryFn: () => portalApi.activity(arg) });
  const err = dash.error ?? engs.error ?? docs.error ?? act.error;
  const ctx: PortalCtx | null = sample
    ? { sample: true, canAct: false, dash: sampleDashboard, engagements: sampleEngagements, docs: sampleDocs, activity: sampleEvents, openEngagement: id => set({ tab: 'Engagements', e: id }), goDocuments: () => set({ tab: 'Documents' }), refresh: () => {} }
    : dash.data && engs.data && docs.data && act.data
      ? { sample: false, canAct: !h?.preview, dash: dash.data, engagements: engs.data, docs: docs.data, activity: act.data, openEngagement: id => set({ tab: 'Engagements', e: id }), goDocuments: () => set({ tab: 'Documents' }), refresh: () => { void qc.invalidateQueries({ queryKey: ['portal-dash'] }); void qc.invalidateQueries({ queryKey: ['portal-docs'] }); void qc.invalidateQueries({ queryKey: ['portal-act'] }); } }
      : null;
  const tab = (TABS as readonly string[]).includes(s.tab) ? s.tab : 'Dashboard';
  const indiv = ctx?.dash.kind === 'individual';
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b"><div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-4"><div className="flex items-center gap-3"><ProductLockup /><span className="text-muted-foreground hidden text-sm sm:inline">Client portal</span></div>
        <div className="flex items-center gap-3"><div className="w-36"><ThemeControl /></div>{h ? <Button variant="ghost" className="min-h-11" aria-label="Sign out" onClick={async () => { await qc.cancelQueries(); qc.clear(); await supabase.auth.signOut(); await navigate({ to: '/auth', replace: true }); }}><LogOut className="size-4" /><span className="hidden sm:inline">Sign out</span></Button> : null}</div></div>
        {ctx ? <nav aria-label="Client portal pages" className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-4">{TABS.map(t => <Button key={t} variant="ghost" className={`min-h-11 rounded-none border-b-2 ${tab === t ? 'border-primary font-semibold' : 'border-transparent'}`} aria-current={tab === t ? 'page' : undefined} onClick={() => set({ tab: t, e: '' })}>{t}</Button>)}</nav> : null}
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 space-y-6 px-4 py-6">
        {home.isPending ? <p>Loading client access…</p> : home.error ? <p role="alert" className="text-failed-foreground">{errorMessage(home.error)}</p> : !h ? (
          <div className="space-y-4"><Kicker>Client portal</Kicker><h1 className="font-display text-2xl font-medium">Client sign-in</h1><Button asChild className="min-h-11"><Link to="/auth">Sign in</Link></Button></div>
        ) : <>
          {h.preview ? <div className="flex flex-wrap items-center gap-3 border-b pb-4"><StatusChip tone="caution">{sample ? 'Sample data · staff only · not saved' : 'Staff preview'}</StatusChip>
            {!sample ? <Select value={clientId} onValueChange={setClientId}><SelectTrigger className="min-h-11 w-64" aria-label="Preview client"><SelectValue placeholder="Choose a client" /></SelectTrigger><SelectContent>{h.clients?.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent></Select> : null}
            <Button variant="outline" className="min-h-11" onClick={() => set({ preview: sample ? '' : 'sample' })}>{sample ? 'Leave Sample mode' : 'Open Sample mode'}</Button>
            <Button asChild variant="outline" className="min-h-11"><Link to="/dashboard">Back to staff workspace</Link></Button></div> : null}
          {h.access_disabled || (cid && !h.portal_enabled && !h.preview) ? <p className="bg-warn text-warn-foreground rounded-md p-4">Your client portal is not enabled yet. Contact FridayAnalytics.</p>
            : err ? <p role="alert" className="bg-failed text-failed-foreground rounded-md p-4">{errorMessage(err)}</p>
            : !ctx ? <p className="text-muted-foreground">{h.preview ? (cid ? 'Loading…' : 'Choose a client to preview, or open Sample mode.') : cid ? 'Loading…' : 'This account has no active client access.'}</p>
            : <>
              {tab === 'Dashboard' ? <>
                <GradientHero className="rounded-xl px-6 pt-6 pb-20"><p className="text-on-gradient text-sm font-semibold tracking-widest uppercase">{sample ? 'Sample · ' : ''}Client portal</p><h1 className="text-on-gradient font-display text-3xl font-medium">Welcome{ctx.dash.name ? `, ${ctx.dash.name}` : ''}</h1><p className="text-on-gradient mt-1 text-2xl">{TAGLINE}</p><p className="text-on-gradient mt-3 text-lg">Last sign-in: {ctx.dash.previous_sign_in ? new Date(ctx.dash.previous_sign_in).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'First visit'}</p></GradientHero>
                <DashboardTab ctx={ctx} /></>
                : tab === 'Engagements' ? <>{!s.e ? <PageTitle kicker="02 · Engagements" title="Engagements" sub={indiv ? 'Work FridayAnalytics is doing for you.' : `Work FridayAnalytics is doing for ${ctx.dash.client_name}.`} /> : null}<EngagementsTab ctx={ctx} openId={s.e || undefined} onBack={() => set({ e: '' })} /></>
                : tab === 'Documents' ? <><PageTitle kicker="03 · Documents" title="Documents" sub="Every download re-checks the file against its recorded SHA-256." /><DocumentsTab ctx={ctx} /></>
                : tab === 'Pricing' ? <><PageTitle kicker="04 · Pricing" title="Pricing" sub="Compare the tiers. Request an upgrade and FridayAnalytics will be in touch." />{sample ? <p className="text-muted-foreground">Pricing is not shown in Sample mode.</p> : <PricingTab clientId={cid} preview={!!h.preview} canAct={ctx.canAct} />}</>
                : tab === 'Billing' ? <><PageTitle kicker="05 · Billing" title="Billing" sub={indiv ? 'Your tier, seats and invoices.' : 'Your organisation\'s tier, seats and invoices.'} />{sample ? <p className="text-muted-foreground">Billing is not shown in Sample mode.</p> : <BillingTab clientId={cid} preview={!!h.preview} />}</>
                : <><PageTitle kicker="06 · Administration" title="Administration" sub={indiv ? 'Your administrators, your name and details, activity and security.' : 'Administrators, organisation details, activity and security.'} /><AdministrationTab ctx={ctx} pill={s.pill} setPill={p => set({ pill: p })} /></>}
            </>}
        </>}
      </main>
      <footer className="mx-auto w-full max-w-6xl border-t px-4 py-6 text-xs text-muted-foreground">{DOCUMENT_FOOTER} · {COMPANY.name} · {COMPANY.reg} · {COMPANY.email} · {COMPANY.web}</footer><BaseStrip />
    </div>
  );
}
