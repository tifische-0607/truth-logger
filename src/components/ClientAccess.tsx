import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { Copy, Plus, UserRound } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { createClientInvite } from '@/lib/portal.functions';
import { clientAdmins, errorMessage, type ClientAdmin } from '@/lib/portal-access';
import { Section, Chip } from '@/components/engagement/ui';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';

export function ClientAccess({ clientId, portalEnabled, owner, clientMode = false }: { clientId: string; portalEnabled: boolean; owner: boolean; clientMode?: boolean }) {
  const qc = useQueryClient(); const inviteFn = useServerFn(createClientInvite);
  const admins = useQuery({ queryKey: ['client-admins',clientId], queryFn: () => clientAdmins(clientId) });
  const [open,setOpen]=useState(false); const [name,setName]=useState(''); const [email,setEmail]=useState(''); const [link,setLink]=useState('');
  const refresh=() => { void qc.invalidateQueries({queryKey:['client-admins',clientId]}); void qc.invalidateQueries({queryKey:['portal-home']}); void qc.invalidateQueries({queryKey:['clients-projects']}); void qc.invalidateQueries({queryKey:['client-events',clientId]}); };
  const invite=useMutation({mutationFn: (existing?: ClientAdmin) => inviteFn({data:{clientId,name:existing?.name??name,email:existing?.email??email,...(existing?{existingId:existing.id}:{})}}),onSuccess:r=>{setLink(r.link);setOpen(true);refresh();}});
  const action=useMutation({mutationFn:async ({id,a}:{id:string;a:string})=>{const {error}=await supabase.rpc('portal_admin_action',{rid:id,a});if(error)throw error;},onSuccess:refresh});
  const enable=useMutation({mutationFn:async (enabled:boolean)=>{const {error}=await supabase.from('clients').update({portal_enabled:enabled}).eq('id',clientId);if(error)throw error;},onSuccess:refresh});
  const isAdm=(a:ClientAdmin)=>(a.role??'client_admin')==='client_admin'; const used=(admins.data??[]).filter(a=>isAdm(a)&&a.status!=='inactive'); const userRows=(admins.data??[]).filter(a=>!isAdm(a)); const full=used.length>=2; const busy=invite.isPending||action.isPending||enable.isPending;
  const events=useQuery({queryKey:['client-events',clientId],queryFn:async()=>{const {data,error}=await supabase.from('client_access_events').select('id,action,created_at').eq('client_id',clientId).order('created_at',{ascending:false}).limit(20);if(error)throw error;return data;}});
  return <Section id="client-access" title={clientMode?'Administrators':'Client access'} actions={!clientMode?<div className="flex items-center gap-3"><Label htmlFor="portal-switch">Portal {portalEnabled?'enabled':'disabled'}</Label><Switch id="portal-switch" checked={portalEnabled} disabled={!owner||busy} onCheckedChange={v=>enable.mutate(v)}/></div>:undefined}>
    <div className="space-y-4">
      {[admins.error,invite.error,action.error,enable.error].filter(Boolean).map((e,i)=><p role="alert" className="bg-failed text-failed-foreground rounded-md p-3 text-sm" key={i}>{errorMessage(e)}</p>)}
      <p className="text-sm text-muted-foreground">{used.length} of 2 administrators · Invitations are recorded; no email is sent.</p>
      <p className="text-sm text-muted-foreground">Client users (added by the client's administrators): {userRows.filter(u=>u.status==='active').length} active, {userRows.filter(u=>u.status==='pending').length} pending, {userRows.filter(u=>u.status==='inactive').length} deactivated. Seats used: {(admins.data??[]).filter(a=>a.holds_seat).length}.</p>
      {used.map(a=><div key={a.id} className="flex flex-wrap items-center gap-3 border-b py-3"><UserRound className="size-5 text-muted-foreground"/><div className="min-w-0 basis-40 flex-1"><p className="font-medium">{a.name}</p><p className="break-all text-sm text-muted-foreground">{a.email}</p></div><Chip>{a.status==='pending'?'Pending invitation':'Active'}</Chip><div className="flex flex-wrap gap-2">{(owner||clientMode)&&a.status==='pending'?<><Button variant="outline" disabled={busy} onClick={()=>invite.mutate(a)}>Resend</Button><Button variant="outline" disabled={busy} onClick={()=>action.mutate({id:a.id,a:'cancel'})}>Cancel</Button></>:owner?<Button variant="outline" disabled={busy} onClick={()=>action.mutate({id:a.id,a:'deactivate'})}>Deactivate</Button>:null}</div></div>)}
      {Array.from({length:Math.max(0,2-used.length)},(_,i)=><div key={i} className="flex items-center gap-3 rounded-md border border-dashed p-4 text-muted-foreground"><UserRound className="size-5"/>Free administrator slot</div>)}
      {(admins.data??[]).filter(a=>isAdm(a)&&a.status==='inactive').map(a=><div className="flex flex-wrap items-center justify-between gap-3 border-b py-3" key={a.id}><div><p>{a.name}</p><p className="text-muted-foreground text-sm">Inactive · {a.email}</p></div>{owner&&a.user_id?<Button variant="outline" disabled={busy} onClick={()=>action.mutate({id:a.id,a:'reactivate'})}>Reactivate</Button>:null}</div>)}
      {(owner||clientMode)&&<><Button disabled={full||busy} onClick={()=>{setName('');setEmail('');setLink('');invite.reset();setOpen(true);}}><Plus className="size-4"/>Invite administrator</Button>{full&&<p className="text-sm text-muted-foreground">A client can have at most 2 administrators.</p>}</>}
      {!clientMode&&<details><summary className="min-h-11 cursor-pointer py-3 text-sm font-medium">Access history</summary><ul className="space-y-2 text-sm">{events.data?.map(e=><li key={e.id} className="flex justify-between gap-3"><span>{e.action.replaceAll('_',' ')}</span><time className="text-muted-foreground">{new Date(e.created_at).toLocaleString('en-GB')}</time></li>)}</ul></details>}
    </div>
    <Dialog open={open} onOpenChange={value=>{setOpen(value);if(!value)setLink('');}}><DialogContent><DialogHeader><DialogTitle>{link?'Invitation recorded':'Invite administrator'}</DialogTitle><DialogDescription>{link?'Copy this single-use link to the invited person. It expires in 7 days.':'The invitation takes one administrator slot. No email will be sent.'}</DialogDescription></DialogHeader>{link?<div className="space-y-3"><Input aria-label="Invitation link" type="password" readOnly value={link}/><Button onClick={()=>void navigator.clipboard.writeText(link)}><Copy className="size-4"/>Copy invitation link</Button></div>:<form className="space-y-4" onSubmit={e=>{e.preventDefault();invite.mutate(undefined);}}><div className="space-y-2"><Label htmlFor="invite-name">Name</Label><Input id="invite-name" required value={name} onChange={e=>setName(e.target.value)}/></div><div className="space-y-2"><Label htmlFor="invite-email">Email</Label><Input id="invite-email" type="email" required value={email} onChange={e=>setEmail(e.target.value)}/></div>{invite.error&&<p role="alert" className="text-failed-foreground">{errorMessage(invite.error)}</p>}<Button type="submit" disabled={invite.isPending}>{invite.isPending?'Recording…':'Record invitation'}</Button></form>}</DialogContent></Dialog>
  </Section>;
}