import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { supabase } from '@/integrations/supabase/client';
import { getAccountEmailStatus, sendPasswordReset, setAccountStatus } from '@/lib/account.functions';
import { levelLabel } from '@/lib/access-levels';
import { errorMessage } from '@/lib/portal-access';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ProfileForm } from '@/components/account/AccountPanel';
import { CreateAccount, PendingInvites } from '@/components/account/CreateAccount';

type User = { user_id: string; name: string | null; full_name: string | null; email: string | null; level: string; status: 'active' | 'inactive'; roles: string[]; client: string | null; member_tier: string | null; last_sign_in: string | null; is_me: boolean; can_manage: boolean };
type Invite = { id: string; name: string; email: string; status: string; expires: string | null; tier: string | null };
type UsersData = { scope: 'all' | 'members' | 'client'; users: User[]; member_invitations: Invite[] };
type Event = { at: string; action: string; detail: Record<string, unknown>; actor_name: string | null; target_name: string | null };

const when = (t: string | null) => (t ? new Date(t).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');
const ACTION: Record<string, string> = {
  level_changed: 'Level changed', deactivated: 'Deactivated', reactivated: 'Reactivated', profile_updated: 'Profile edited', password_reset_sent: 'Password reset link sent',
  password_changed: 'Password changed', signed_out_other_sessions: 'Signed out of other sessions', email_change_requested: 'Email change requested',
  account_created: 'Account created (invitation)', account_invite_resent: 'Invitation resent', account_invite_cancelled: 'Invitation cancelled', account_accepted: 'Invitation accepted',
  member_invited: 'Member invited', member_invite_resent: 'Member invitation resent', member_invite_cancelled: 'Member invitation cancelled', member_accepted: 'Member invitation accepted',
};
function describe(e: Event) {
  if (e.action === 'level_log') {
    const d = e.detail as { from_level: string | null; to_level: string | null; from_status: string | null; to_status: string | null };
    if (d.from_level === d.to_level) return `Status ${d.from_status ?? '—'} → ${d.to_status ?? '—'}`;
    return `Level ${d.from_level ? levelLabel(d.from_level) : 'none'} → ${d.to_level ? levelLabel(d.to_level) : 'none'}`;
  }
  if (e.action === 'level_changed') return `${ACTION[e.action]}: ${levelLabel(String(e.detail['from']))} → ${levelLabel(String(e.detail['to']))}`;
  if (e.action === 'account_created') { const x = e.detail as { level?: string; roles?: string[]; client?: string | null; tier?: string | null }; return `${ACTION[e.action]}: ${levelLabel(x.level)}${x.roles?.length ? ` (${x.roles.join(', ')})` : ''}${x.client ? ` · ${x.client}` : ''}${x.tier ? ` · ${x.tier}` : ''}`; }
  if (e.action === 'profile_updated') return `${ACTION[e.action]}: ${Object.keys(e.detail).join(', ')}`;
  return ACTION[e.action] ?? e.action;
}

function Dot({ on }: { on: boolean }) {
  return <span className="inline-flex items-center gap-2 text-sm"><span aria-hidden className={`size-2 rounded-full ${on ? 'bg-positive' : 'bg-muted-foreground'}`} />{on ? 'Active' : 'Inactive'}</span>;
}

/** Append-only User activity: who did what to whom, and level/status changes. The database limits what each viewer sees. */
export function ActivityList() {
  const q = useQuery({ queryKey: ['access-activity'], queryFn: async () => { const { data, error } = await supabase.rpc('access_activity'); if (error) throw error; return data as unknown as Event[]; } });
  if (q.isPending) return <p>Loading activity…</p>;
  if (q.error) return <p role="alert" className="text-failed-foreground">{errorMessage(q.error)}</p>;
  return (
    <section aria-labelledby="ua-h" className="space-y-3">
      <h3 id="ua-h" className="font-semibold">User activity</h3>
      {q.data.length === 0 ? <p className="text-muted-foreground text-sm">No activity yet.</p> : (
        <ul className="divide-y">{q.data.map((e, i) => <li key={i} className="py-2 text-sm"><span className="font-medium">{describe(e)}</span> · {e.target_name ?? (typeof e.detail['email'] === 'string' ? e.detail['email'] : '—')}<span className="text-muted-foreground"> · by {e.actor_name ?? 'System'} · {when(e.at)}</span></li>)}</ul>
      )}
    </section>
  );
}

/** Users and access. SuperAdmin: everyone. Management: Members. Client Admin: their own Client Staff. The database returns only that scope. */
export function UsersAccess() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['access-users'], queryFn: async () => { const { data, error } = await supabase.rpc('access_users'); if (error) throw error; return data as unknown as UsersData; } });
  const emailSt = useServerFn(getAccountEmailStatus); const emailQ = useQuery({ queryKey: ['account-email-status'], queryFn: () => emailSt() });
  const resetFn = useServerFn(sendPasswordReset); const statusFn = useServerFn(setAccountStatus);
  const [msg, setMsg] = useState<{ id: string; t: string; bad: boolean } | null>(null);
  const [busy, setBusy] = useState(''); const [edit, setEdit] = useState<User | null>(null);
  const [filter, setFilter] = useState('all');
  const refresh = () => { void qc.invalidateQueries({ queryKey: ['access-users'] }); void qc.invalidateQueries({ queryKey: ['account-pending-invites'] }); void qc.invalidateQueries({ queryKey: ['access-activity'] }); };
  const run = async (id: string, f: () => Promise<string>) => {
    setBusy(id); setMsg(null);
    try { setMsg({ id, t: await f(), bad: false }); refresh(); } catch (x) { setMsg({ id, t: errorMessage(x), bad: true }); } finally { setBusy(''); }
  };
  if (q.isPending) return <p>Loading users…</p>;
  if (q.error) return <p role="alert" className="bg-failed text-failed-foreground rounded-md p-4">{errorMessage(q.error)}</p>;
  const d = q.data; const emailOn = !!emailQ.data?.configured;
  const users = d.users.filter(u => filter === 'all' || u.level === filter);
  return (
    <div className="space-y-6">
      <p className="text-muted-foreground text-sm">{d.scope === 'all' ? 'Every login, with level, job role, client and status.' : d.scope === 'members' ? 'Members only. SuperAdmin manages every other level.' : 'Client Staff in your organisation.'} Nobody can see or set another person's password; resets go by emailed link.</p>
      {!emailOn ? <p className="text-sm"><span className="bg-muted inline-flex items-center gap-2 rounded-md px-2 py-1"><span className="bg-muted-foreground size-2 rounded-full" aria-hidden />Not configured</span> Account emails are not set up, so password reset links cannot be sent yet.</p> : null}
      {d.scope === 'all' ? <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by level">{['all', 'superadmin', 'fa_staff', 'client_admin', 'client_staff', 'member'].map(l => <Button key={l} className="min-h-11" variant={filter === l ? 'default' : 'outline'} aria-pressed={filter === l} onClick={() => setFilter(l)}>{l === 'all' ? 'All' : levelLabel(l)} ({d.users.filter(u => l === 'all' || u.level === l).length})</Button>)}</div> : null}
      {users.length === 0 ? <p className="text-muted-foreground">No users yet.</p> : (
        <ul className="grid gap-3">
          {users.map(u => (
            <li key={u.user_id} className="panel space-y-3 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div><p className="font-medium">{u.name ?? u.email}{u.is_me ? ' (you)' : ''}</p><p className="text-muted-foreground text-sm">{u.email}</p>
                  <p className="text-sm">{levelLabel(u.level)}{u.roles.length ? ` · ${u.roles.join(', ')}` : ''}{u.client ? ` · ${u.client}` : ''}{u.level === 'member' ? ` · ${u.member_tier ?? 'No tier'}` : ''}</p>
                  <p className="text-muted-foreground text-xs">Last sign-in {when(u.last_sign_in)}</p></div>
                <Dot on={u.status === 'active'} />
              </div>
              {u.can_manage ? (
                <div className="flex flex-wrap gap-2">
                  {d.scope === 'all' && (u.level === 'superadmin' || u.level === 'fa_staff') ? (
                    <Button variant="outline" className="min-h-11" disabled={!!busy} onClick={() => run(u.user_id, async () => { const { error } = await supabase.rpc('access_set_level', { target: u.user_id, lvl: u.level === 'superadmin' ? 'fa_staff' : 'superadmin' }); if (error) throw error; return 'Level changed.'; })}>{u.level === 'superadmin' ? 'Make FA Staff' : 'Make SuperAdmin'}</Button>) : null}
                  <Button variant="outline" className="min-h-11" disabled={!!busy} onClick={() => run(u.user_id, async () => { const r = await statusFn({ data: { target: u.user_id, active: u.status !== 'active' } }); return r.note || (u.status === 'active' ? 'Deactivated. They can no longer sign in.' : 'Reactivated.'); })}>{u.status === 'active' ? 'Deactivate' : 'Reactivate'}</Button>
                  <Button variant="outline" className="min-h-11" disabled={!!busy || !emailOn} onClick={() => run(u.user_id, async () => { await resetFn({ data: { target: u.user_id } }); return 'Password reset link sent.'; })}>Send password reset link</Button>
                  <Button variant="outline" className="min-h-11" onClick={() => setEdit(u)}>Edit profile</Button>
                </div>) : null}
              {msg?.id === u.user_id ? <p role={msg.bad ? 'alert' : 'status'} className={msg.bad ? 'bg-failed text-failed-foreground rounded-md p-3 text-sm' : 'text-sm'}>{msg.t}</p> : null}
            </li>))}
        </ul>)}
      {d.scope !== 'client' ? <><CreateAccount superadmin={d.scope === 'all'} onDone={refresh} /><PendingInvites onDone={refresh} /></> : null}
      <ActivityList />
      <Dialog open={!!edit} onOpenChange={o => { if (!o) setEdit(null); }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Edit profile</DialogTitle><DialogDescription>{edit?.email}. Changes are logged with your name.</DialogDescription></DialogHeader>
          {edit ? <ProfileForm target={edit.user_id} onSaved={() => setEdit(null)} /> : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
