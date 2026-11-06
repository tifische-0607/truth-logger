import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { supabase } from '@/integrations/supabase/client';
import { getAccountEmailStatus } from '@/lib/account.functions';
import { levelLabel } from '@/lib/access-levels';
import { errorMessage } from '@/lib/portal-access';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ActivityList } from '@/components/account/UsersAccess';

export type Profile = { user_id: string; email: string | null; full_name: string | null; display_name: string | null; phone: string | null; job_title: string | null; language: string | null; preferred_theme: string | null; level: string | null; status: string; roles: string[] };
const FIELDS = ['full_name', 'display_name', 'phone', 'job_title'] as const;
const FIELD_LABEL: Record<(typeof FIELDS)[number], string> = { full_name: 'Full name', display_name: 'Display name', phone: 'Phone', job_title: 'Job title' };

export function applyTheme(t: string | null | undefined) {
  if (!t || t === 'system') return;
  try { localStorage.setItem('fa.theme', t); } catch { /* ignore */ }
  document.documentElement.classList.remove('dark', 'high-contrast');
  if (t !== 'light') document.documentElement.classList.add(t);
}

function Msg({ m }: { m: { t: string; bad: boolean } | null }) {
  if (!m) return null;
  return <p role={m.bad ? 'alert' : 'status'} className={m.bad ? 'bg-failed text-failed-foreground rounded-md p-3 text-sm' : 'text-sm'}>{m.t}</p>;
}

/** Profile editor for yourself or (when the database allows) for someone you manage. */
export function ProfileForm({ target, onSaved }: { target?: string | undefined; onSaved?: () => void }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['account-profile', target ?? 'me'], queryFn: async () => { const { data, error } = await supabase.rpc('account_profile', target ? { target } : {}); if (error) throw error; return data as unknown as Profile; } });
  const [f, setF] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false); const [msg, setMsg] = useState<{ t: string; bad: boolean } | null>(null);
  useEffect(() => { if (q.data) setF({ full_name: q.data.full_name ?? '', display_name: q.data.display_name ?? '', phone: q.data.phone ?? '', job_title: q.data.job_title ?? '', language: q.data.language ?? 'en', preferred_theme: q.data.preferred_theme ?? 'system' }); }, [q.data]);
  if (q.isPending) return <p>Loading profile…</p>;
  if (q.error) return <p role="alert" className="text-failed-foreground">{errorMessage(q.error)}</p>;
  const p = q.data;
  const save = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setMsg(null);
    const changed: Record<string, string> = {};
    for (const k of Object.keys(f)) { const was = (p as unknown as Record<string, string | null>)[k] ?? (k === 'language' ? 'en' : k === 'preferred_theme' ? 'system' : ''); if ((f[k] ?? '') !== was) changed[k] = f[k] ?? ''; }
    const { error } = await supabase.rpc('account_update_profile', { target: p.user_id, p: changed });
    setBusy(false);
    if (error) { setMsg({ t: error.message, bad: true }); return; }
    setMsg({ t: 'Profile saved.', bad: false });
    if (!target) applyTheme(f['preferred_theme']);
    void qc.invalidateQueries({ queryKey: ['account-profile'] }); void qc.invalidateQueries({ queryKey: ['access-users'] }); void qc.invalidateQueries({ queryKey: ['access-activity'] }); void qc.invalidateQueries({ queryKey: ['me'] });
    onSaved?.();
  };
  return (
    <form onSubmit={save} className="space-y-4" aria-label="Profile">
      <p className="text-muted-foreground text-sm">{p.email} · {levelLabel(p.level)}{p.roles.length ? ` · ${p.roles.join(', ')}` : ''}</p>
      <div className="grid gap-4 sm:grid-cols-2">
        {FIELDS.map(k => <div key={k} className="space-y-1"><Label htmlFor={`pf-${k}-${p.user_id}`}>{FIELD_LABEL[k]}</Label><Input id={`pf-${k}-${p.user_id}`} className="min-h-11" value={f[k] ?? ''} onChange={e => setF({ ...f, [k]: e.target.value })} /></div>)}
        <div className="space-y-1"><Label htmlFor={`pf-lang-${p.user_id}`}>Language</Label>
          <Select value={f['language'] ?? 'en'} onValueChange={v => setF({ ...f, language: v })}><SelectTrigger id={`pf-lang-${p.user_id}`} className="min-h-11"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="en">English</SelectItem><SelectItem value="ms">Bahasa Melayu</SelectItem></SelectContent></Select></div>
        <div className="space-y-1"><Label htmlFor={`pf-theme-${p.user_id}`}>Preferred theme</Label>
          <Select value={f['preferred_theme'] ?? 'system'} onValueChange={v => setF({ ...f, preferred_theme: v })}><SelectTrigger id={`pf-theme-${p.user_id}`} className="min-h-11"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="system">Device setting</SelectItem><SelectItem value="light">Light</SelectItem><SelectItem value="dark">Dark</SelectItem><SelectItem value="high-contrast">High contrast</SelectItem></SelectContent></Select></div>
      </div>
      <Button type="submit" className="min-h-11" disabled={busy}>{busy ? 'Saving…' : 'Save profile'}</Button>
      <Msg m={msg} />
    </form>
  );
}

function EmailChange() {
  const statusFn = useServerFn(getAccountEmailStatus);
  const st = useQuery({ queryKey: ['account-email-status'], queryFn: () => statusFn() });
  const [email, setEmail] = useState(''); const [busy, setBusy] = useState(false); const [msg, setMsg] = useState<{ t: string; bad: boolean } | null>(null);
  const configured = !!st.data?.configured;
  const go = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setMsg(null);
    const r = await supabase.auth.updateUser({ email: email.trim().toLowerCase() });
    if (r.error) { setBusy(false); setMsg({ t: r.error.message, bad: true }); return; }
    await supabase.rpc('account_log_self', { a: 'email_change_requested', detail: { new_email: email.trim().toLowerCase() } });
    setBusy(false); setMsg({ t: 'Check the new address for a confirmation link. Your email changes only after you confirm it.', bad: false });
  };
  return (
    <form onSubmit={go} className="space-y-2" aria-label="Change email">
      <h3 className="font-semibold">Email address</h3>
      {!configured ? <p className="text-sm"><span className="chip bg-muted inline-flex items-center gap-2 rounded-md px-2 py-1"><span className="bg-muted-foreground size-2 rounded-full" aria-hidden />Not configured</span> Changing your email needs a confirmation email, and account emails are not set up yet.</p> : null}
      <div className="flex flex-wrap gap-2"><Label htmlFor="new-email" className="sr-only">New email address</Label><Input id="new-email" type="email" required className="min-h-11 max-w-sm" placeholder="New email address" value={email} onChange={e => setEmail(e.target.value)} disabled={!configured} />
        <Button type="submit" variant="outline" className="min-h-11" disabled={!configured || busy}>Send confirmation</Button></div>
      <Msg m={msg} />
    </form>
  );
}

function PasswordChange() {
  const [cur, setCur] = useState(''); const [next, setNext] = useState(''); const [again, setAgain] = useState('');
  const [busy, setBusy] = useState(false); const [msg, setMsg] = useState<{ t: string; bad: boolean } | null>(null);
  const go = async (e: React.FormEvent) => {
    e.preventDefault(); setMsg(null);
    if (next.length < 12) { setMsg({ t: 'Use at least 12 characters.', bad: true }); return; }
    if (next !== again) { setMsg({ t: 'The new passwords do not match.', bad: true }); return; }
    setBusy(true);
    const { data: u } = await supabase.auth.getUser();
    const email = u.user?.email;
    if (!email) { setBusy(false); setMsg({ t: 'Sign in to continue.', bad: true }); return; }
    const check = await supabase.auth.signInWithPassword({ email, password: cur });
    if (check.error) { setBusy(false); setMsg({ t: 'Your current password is not correct.', bad: true }); return; }
    const r = await supabase.auth.updateUser({ password: next });
    if (r.error) { setBusy(false); setMsg({ t: r.error.message, bad: true }); return; }
    await supabase.rpc('account_log_self', { a: 'password_changed', detail: {} });
    setBusy(false); setCur(''); setNext(''); setAgain(''); setMsg({ t: 'Password changed.', bad: false });
  };
  return (
    <form onSubmit={go} className="space-y-3" aria-label="Change password">
      <h3 className="font-semibold">Change my password</h3>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1"><Label htmlFor="pw-cur">Current password</Label><Input id="pw-cur" type="password" autoComplete="current-password" required className="min-h-11" value={cur} onChange={e => setCur(e.target.value)} /></div>
        <div className="space-y-1"><Label htmlFor="pw-new">New password</Label><Input id="pw-new" type="password" autoComplete="new-password" required className="min-h-11" value={next} onChange={e => setNext(e.target.value)} /></div>
        <div className="space-y-1"><Label htmlFor="pw-again">New password again</Label><Input id="pw-again" type="password" autoComplete="new-password" required className="min-h-11" value={again} onChange={e => setAgain(e.target.value)} /></div>
      </div>
      <Button type="submit" className="min-h-11" disabled={busy}>{busy ? 'Changing…' : 'Change password'}</Button>
      <Msg m={msg} />
    </form>
  );
}

function OtherSessions() {
  const [busy, setBusy] = useState(false); const [msg, setMsg] = useState<{ t: string; bad: boolean } | null>(null);
  const go = async () => {
    setBusy(true); setMsg(null);
    const r = await supabase.auth.signOut({ scope: 'others' });
    if (r.error) { setBusy(false); setMsg({ t: r.error.message, bad: true }); return; }
    await supabase.rpc('account_log_self', { a: 'signed_out_other_sessions', detail: {} });
    setBusy(false); setMsg({ t: 'Every other device has been signed out. This device stays signed in.', bad: false });
  };
  return <div className="space-y-2"><h3 className="font-semibold">Other sessions</h3><Button variant="outline" className="min-h-11" disabled={busy} onClick={go}>Sign out of other sessions</Button><Msg m={msg} /></div>;
}

const SECTIONS = ['My profile', 'Security', 'My activity'] as const;
/** The Account section every level gets: profile, security and own activity. */
export function AccountPanel() {
  const [s, setS] = useState<(typeof SECTIONS)[number]>('My profile');
  return (
    <div className="space-y-5">
      <nav aria-label="Account sections" className="flex flex-wrap gap-2">
        {SECTIONS.map(x => <Button key={x} className="min-h-11 rounded-full" variant={s === x ? 'default' : 'outline'} aria-current={s === x ? 'page' : undefined} onClick={() => setS(x)}>{x}</Button>)}
      </nav>
      <section className="panel space-y-6 p-5">
        {s === 'My profile' ? <><ProfileForm /><EmailChange /></> : s === 'Security' ? <><PasswordChange /><OtherSessions /></> : <ActivityList />}
      </section>
    </div>
  );
}
