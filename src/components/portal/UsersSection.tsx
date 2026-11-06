import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { Copy, Plus, UserRound } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { createClientInvite } from '@/lib/portal.functions';
import { clientAdmins, errorMessage, type ClientAdmin } from '@/lib/portal-access';
import { sampleAdmins } from '@/lib/portal-sample';
import { hubDate } from '@/lib/hub';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { StatusChip, type PortalCtx } from '@/components/portal/PortalScreens';

/** Seats used against the tier limit, as text. Seat count and limit come from the database. */
export function seatText(used: number, limit: number | null | undefined, tier: string | null | undefined) {
  if (!tier) return `${used} seats used · no tier set yet`;
  return limit == null ? `${used} seats used · unlimited on ${tier}` : `${used} of ${limit} seats used on ${tier}`;
}

const STATUS = { active: ['positive', 'Active'], pending: ['caution', 'Pending invitation'], inactive: ['negative', 'Deactivated'] } as const;

/**
 * Client users (non-administrators). Administrators invite, deactivate and reactivate them.
 * Every limit (seats, roles, who may act) is enforced by the database; refusals are shown verbatim.
 */
export function UsersSection({ ctx }: { ctx: PortalCtx }) {
  const qc = useQueryClient(); const inviteFn = useServerFn(createClientInvite);
  const cid = ctx.dash.client_id;
  const list = useQuery({ queryKey: ['client-admins', cid, ctx.sample], queryFn: () => (ctx.sample ? Promise.resolve(sampleAdmins) : clientAdmins(cid)) });
  const [open, setOpen] = useState(false); const [name, setName] = useState(''); const [email, setEmail] = useState(''); const [link, setLink] = useState('');
  const [note, setNote] = useState('');
  const btn = useRef<HTMLButtonElement>(null);
  const refresh = () => { void qc.invalidateQueries({ queryKey: ['client-admins', cid] }); ctx.refresh(); };
  const invite = useMutation({
    mutationFn: async (existing?: ClientAdmin) => {
      if (ctx.sample) return { link: '' };
      return inviteFn({ data: { clientId: cid, role: 'client_user', name: existing?.name ?? name, email: existing?.email ?? email, ...(existing ? { existingId: existing.id } : {}) } });
    },
    onSuccess: r => { if (ctx.sample) { setOpen(false); setNote('Sample mode: no invitation was recorded.'); return; } setLink(r.link); setOpen(true); refresh(); },
  });
  const act = useMutation({
    mutationFn: async ({ id, a }: { id: string; a: 'cancel' | 'deactivate' | 'reactivate' }) => {
      if (ctx.sample) return;
      const { error } = await supabase.rpc('portal_admin_action', { rid: id, a }); if (error) throw error;
    },
    onSuccess: () => { if (ctx.sample) setNote('Sample mode: nothing was saved.'); else refresh(); },
  });
  const users = (list.data ?? []).filter(u => u.role === 'client_user');
  const used = ctx.dash.seats_used ?? (list.data ?? []).filter(u => u.holds_seat).length;
  const limit = ctx.dash.seat_limit; const full = limit != null && used >= limit; const noTier = !ctx.dash.tier_name;
  const actionable = ctx.canAct || ctx.sample; const busy = invite.isPending || act.isPending;
  return (
    <section className="space-y-4 pt-4" aria-labelledby="users-h">
      <h2 id="users-h" className="font-display text-xl font-medium">Users</h2>
      <div className="panel flex flex-wrap items-center gap-3 p-4">
        <p className="font-display text-lg font-medium">{seatText(used, limit, ctx.dash.tier_name)}{ctx.sample ? ' (Sample)' : ''}</p>
        {full ? <StatusChip tone="caution">All seats in use</StatusChip> : null}
      </div>
      <p className="text-muted-foreground text-sm">Administrators and pending invitations count as seats. Deactivated users free their seat. Research is the same on every tier; tiers differ only in seats and report access.</p>
      {[list.error, invite.error, act.error].filter(Boolean).map((e, i) => <p key={i} role="alert" className="bg-failed text-failed-foreground rounded-md p-3 text-sm">{errorMessage(e)}</p>)}
      {note ? <p role="status" className="bg-muted rounded-md p-3 text-sm">{note}</p> : null}
      <ul className="space-y-2">
        {users.length === 0 ? <li className="text-muted-foreground rounded-md border border-dashed p-4">No users yet.</li> : users.map(u => {
          const [tone, word] = STATUS[u.status];
          return (
            <li key={u.id} className="panel flex flex-wrap items-center gap-3 p-4">
              <UserRound className="text-muted-foreground size-5" />
              <div className="min-w-0 flex-1 basis-40"><p className="font-medium">{u.name}</p><p className="text-muted-foreground text-sm break-all">{u.email}</p>
                <p className="text-muted-foreground text-xs">{u.status === 'pending' ? `Invitation expires ${hubDate(u.invite_expires_at)}` : u.last_sign_in ? `Last sign-in ${hubDate(u.last_sign_in)}` : 'Not signed in yet'}</p></div>
              <StatusChip tone={tone}>{word}</StatusChip>
              {actionable ? <div className="flex flex-wrap gap-2">
                {u.status === 'pending' ? <><Button variant="outline" className="min-h-11" disabled={busy} onClick={() => invite.mutate(u)}>Resend</Button><Button variant="outline" className="min-h-11" disabled={busy} onClick={() => act.mutate({ id: u.id, a: 'cancel' })}>Cancel invitation</Button></> : null}
                {u.status === 'active' ? <Button variant="outline" className="min-h-11" disabled={busy} onClick={() => act.mutate({ id: u.id, a: 'deactivate' })}>Deactivate</Button> : null}
                {u.status === 'inactive' && u.user_id ? <Button variant="outline" className="min-h-11" disabled={busy} onClick={() => act.mutate({ id: u.id, a: 'reactivate' })}>Reactivate</Button> : null}
              </div> : null}
            </li>
          );
        })}
      </ul>
      <div className="space-y-2">
        <Button ref={btn} className="min-h-11" disabled={busy || !actionable} onClick={() => { setName(''); setEmail(''); setLink(''); invite.reset(); setOpen(true); }}><Plus className="size-4" />Invite user</Button>
        {noTier ? <p className="text-sm" role="note">No tier is set yet, so only administrators can be added. Ask FridayAnalytics to set a tier.</p> : full ? <p className="text-sm" role="note">All seats are in use. Deactivate a user, or request a larger tier on the Pricing tab.</p> : null}
      </div>
      <Dialog open={open} onOpenChange={v => { setOpen(v); if (!v) setLink(''); }}>
        <DialogContent onCloseAutoFocus={e => { e.preventDefault(); btn.current?.focus(); }}>
          <DialogHeader><DialogTitle>{link ? 'Invitation recorded' : 'Invite user'}</DialogTitle>
            <DialogDescription>{link ? 'Copy this single-use link and send it to the person you invited. It expires in 7 days.' : 'The invitation takes a seat until it is accepted, cancelled or expires. No email is sent.'}</DialogDescription></DialogHeader>
          {link ? <div className="space-y-3"><Input aria-label="Invitation link" type="password" readOnly value={link} className="min-h-11" /><Button className="min-h-11" onClick={() => void navigator.clipboard.writeText(link)}><Copy className="size-4" />Copy invitation link</Button></div> : (
            <form className="space-y-4" onSubmit={e => { e.preventDefault(); invite.mutate(undefined); }}>
              <div className="space-y-1"><Label htmlFor="user-name">Name</Label><Input id="user-name" className="min-h-11" required value={name} onChange={e => setName(e.target.value)} /></div>
              <div className="space-y-1"><Label htmlFor="user-email">Email</Label><Input id="user-email" className="min-h-11" type="email" required value={email} onChange={e => setEmail(e.target.value)} /></div>
              {invite.error ? <p role="alert" className="bg-failed text-failed-foreground rounded-md p-3 text-sm">{errorMessage(invite.error)}</p> : null}
              <Button type="submit" className="min-h-11" disabled={invite.isPending}>{invite.isPending ? 'Recording…' : 'Record invitation'}</Button>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
