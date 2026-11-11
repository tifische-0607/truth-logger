import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { Copy } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { createAccount, resendAccountInvite } from '@/lib/account.functions';
import { levelLabel, type AccessLevel } from '@/lib/access-levels';
import { errorMessage } from '@/lib/portal-access';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const ROLES = [['analyst', 'Analyst'], ['curator', 'Curator'], ['management', 'Management']] as const;
type Pending = { id: string; name: string; email: string; level: string; roles: string[]; client: string | null; tier: string | null; expires: string | null };
const when = (t: string | null) => (t ? new Date(t).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');

function LinkBox({ link }: { link: string }) {
  return <div className="space-y-2" role="status"><p className="text-sm">Single-use link, shown once and valid 7 days. An invitation email is sent automatically; if it does not arrive, copy this link and send it yourself. They set their own password.</p>
    <div className="flex gap-2"><Input readOnly value={link} className="min-h-11" aria-label="Invitation link" /><Button type="button" variant="outline" className="min-h-11" onClick={() => void navigator.clipboard.writeText(link)}><Copy className="size-4" />Copy</Button></div></div>;
}

/** Create account: SuperAdmin may choose any level; Management only Member. The database enforces who may create what, email reuse, seats and the 2-administrator cap. */
export function CreateAccount({ superadmin, onDone }: { superadmin: boolean; onDone: () => void }) {
  const fn = useServerFn(createAccount);
  const levels: AccessLevel[] = superadmin ? ['superadmin', 'fa_staff', 'client_admin', 'client_staff', 'member'] : ['member'];
  const tiers = useQuery({ queryKey: ['billing-tiers-list'], queryFn: async () => { const { data, error } = await supabase.from('billing_tiers').select('id, name, rank').order('rank'); if (error) throw error; return data; } });
  const clients = useQuery({ queryKey: ['create-account-clients'], enabled: superadmin, queryFn: async () => { const { data, error } = await supabase.from('clients').select('id, name, display_name').order('name'); if (error) throw error; return data; } });
  const [level, setLevel] = useState<AccessLevel>(levels[0]!);
  const [name, setName] = useState(''); const [email, setEmail] = useState('');
  const [roles, setRoles] = useState<string[]>(['analyst']); const [client, setClient] = useState(''); const [tier, setTier] = useState('none');
  const [busy, setBusy] = useState(false); const [err, setErr] = useState(''); const [link, setLink] = useState('');
  const go = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setErr(''); setLink('');
    try {
      const r = await fn({ data: { level, name, email, roles: level === 'fa_staff' ? roles as ('analyst' | 'curator' | 'management')[] : [], ...((level === 'client_admin' || level === 'client_staff') && client ? { clientId: client } : {}), ...(level === 'member' && tier !== 'none' ? { tierId: tier } : {}) } });
      setLink(r.link); setName(''); setEmail(''); onDone();
    } catch (x) { setErr(errorMessage(x)); } finally { setBusy(false); }
  };
  return (
    <form onSubmit={go} className="panel space-y-4 p-5" aria-label="Create account">
      <h3 className="font-semibold">{superadmin ? 'Create account' : 'Invite a Member'}</h3>
      <p className="text-muted-foreground text-sm">Creates a recorded invitation with a one-time link. Nobody types, sees or sets another person's password.</p>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1"><Label htmlFor="ca-name">Name</Label><Input id="ca-name" required className="min-h-11" value={name} onChange={e => setName(e.target.value)} /></div>
        <div className="space-y-1"><Label htmlFor="ca-email">Email</Label><Input id="ca-email" type="email" required className="min-h-11" value={email} onChange={e => setEmail(e.target.value)} /></div>
        <div className="space-y-1"><Label htmlFor="ca-level">Access level</Label><Select value={level} onValueChange={v => setLevel(v as AccessLevel)}><SelectTrigger id="ca-level" className="min-h-11"><SelectValue /></SelectTrigger><SelectContent>{levels.map(l => <SelectItem key={l} value={l}>{levelLabel(l)}</SelectItem>)}</SelectContent></Select></div>
      </div>
      {level === 'fa_staff' ? <fieldset className="space-y-2"><legend className="text-sm font-medium">Job role (one or more)</legend><div className="flex flex-wrap gap-4">{ROLES.map(([k, l]) => <div key={k} className="flex min-h-11 items-center gap-2"><Checkbox id={`ca-role-${k}`} checked={roles.includes(k)} onCheckedChange={v => setRoles(r => (v ? [...r, k] : r.filter(x => x !== k)))} /><Label htmlFor={`ca-role-${k}`}>{l}</Label></div>)}</div></fieldset> : null}
      {level === 'client_admin' || level === 'client_staff' ? <div className="max-w-sm space-y-1"><Label htmlFor="ca-client">Client (required)</Label><Select value={client} onValueChange={setClient}><SelectTrigger id="ca-client" className="min-h-11"><SelectValue placeholder="Choose a client" /></SelectTrigger><SelectContent>{clients.data?.map(c => <SelectItem key={c.id} value={c.id}>{c.display_name ?? c.name}</SelectItem>)}</SelectContent></Select></div> : null}
      {level === 'member' ? <div className="max-w-sm space-y-1"><Label htmlFor="ca-tier">Tier (optional)</Label><Select value={tier} onValueChange={setTier}><SelectTrigger id="ca-tier" className="min-h-11"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">No tier</SelectItem>{tiers.data?.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent></Select></div> : null}
      <Button type="submit" className="min-h-11" disabled={busy}>{busy ? 'Recording…' : 'Create invitation link'}</Button>
      {err ? <p role="alert" className="bg-failed text-failed-foreground rounded-md p-3 text-sm">{err}</p> : null}
      {link ? <LinkBox link={link} /> : null}
    </form>
  );
}

/** Pending invitations of every level the viewer may manage, with resend and cancel. */
export function PendingInvites({ onDone }: { onDone: () => void }) {
  const resendFn = useServerFn(resendAccountInvite);
  const q = useQuery({ queryKey: ['account-pending-invites'], queryFn: async () => { const { data, error } = await supabase.rpc('account_pending_invites'); if (error) throw error; return data as unknown as Pending[]; } });
  const [st, setSt] = useState<{ id: string; t: string; bad: boolean; link?: string } | null>(null); const [busy, setBusy] = useState('');
  const act = async (id: string, f: () => Promise<{ t: string; link?: string }>) => {
    setBusy(id); setSt(null);
    try { const r = await f(); setSt({ id, bad: false, ...r }); void q.refetch(); onDone(); } catch (x) { setSt({ id, t: errorMessage(x), bad: true }); } finally { setBusy(''); }
  };
  if (q.isPending) return <p>Loading invitations…</p>;
  if (q.error) return <p role="alert" className="text-failed-foreground">{errorMessage(q.error)}</p>;
  return (
    <section aria-labelledby="pi-h" className="space-y-2">
      <h3 id="pi-h" className="font-semibold">Pending invitations</h3>
      {q.data.length === 0 ? <p className="text-muted-foreground text-sm">No pending invitations.</p> : (
        <ul className="grid gap-2">{q.data.map(i => (
          <li key={i.id} className="panel space-y-2 p-3 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span><span className="font-medium">{i.name}</span> · {i.email} · {levelLabel(i.level)}{i.roles.length ? ` (${i.roles.join(', ')})` : ''}{i.client ? ` · ${i.client}` : ''}{i.level === 'member' ? ` · ${i.tier ?? 'No tier'}` : ''} · expires {when(i.expires)}</span>
              <span className="flex gap-2">
                <Button variant="outline" className="min-h-11" disabled={!!busy} onClick={() => act(i.id, async () => { const r = await resendFn({ data: { id: i.id } }); return { t: r.emailed ? `New link emailed to ${r.email}; the old one no longer works.` : 'New link created; the old one no longer works. Email could not be sent, so copy the link below.', link: r.link }; })}>Resend</Button>
                <Button variant="outline" className="min-h-11" disabled={!!busy} onClick={() => act(i.id, async () => { const { error } = await supabase.rpc('account_invite_cancel', { rid: i.id }); if (error) throw error; return { t: 'Invitation cancelled.' }; })}>Cancel</Button>
              </span>
            </div>
            {st?.id === i.id ? (st.link ? <div className="space-y-2"><p role="status">{st.t}</p><LinkBox link={st.link} /></div> : <p role={st.bad ? 'alert' : 'status'} className={st.bad ? 'bg-failed text-failed-foreground rounded-md p-3' : ''}>{st.t}</p>) : null}
          </li>))}</ul>)}
    </section>
  );
}
