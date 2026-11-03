import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { supabase } from '@/integrations/supabase/client';
import { lovable } from '@/integrations/lovable';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ThemeControl } from '@/components/ThemeControl';
import { hubHead } from '@/lib/hub';
import { portalIdentity } from '@/lib/portal-access';
import { getSiteConfig } from '@/lib/portal.functions';
import { authReturnUrl } from '@/lib/site-config';

export const Route = createFileRoute('/auth')({ head: () => hubHead('Sign in','Staff and client sign-in to FA Portal.'), component: AuthPage });
function AuthPage() {
 const navigate=useNavigate(); const qc=useQueryClient(); const config=useServerFn(getSiteConfig);
 const [email,setEmail]=useState(''); const [password,setPassword]=useState(''); const [busy,setBusy]=useState(false); const [error,setError]=useState(''); const [notice,setNotice]=useState('');
 async function finish(record=false) {
  const identity=await portalIdentity();
  if(identity.kind==='none'){setError('This account does not have access to FA Portal.');return;}
  if(record&&identity.kind==='client') await supabase.rpc('portal_record_sign_in');
  qc.clear(); await navigate({to:identity.destination,replace:true});
 }
 useEffect(()=>{void supabase.auth.getUser().then(r=>{if(r.data.user)void finish();});},[]);
 async function submit(e:React.FormEvent){e.preventDefault();setBusy(true);setError('');try{const {error}=await supabase.auth.signInWithPassword({email,password});if(error)throw error;await finish(true);}catch{setError('Check your email and password');}finally{setBusy(false);}}
 async function google(){setBusy(true);setError('');try{const {siteUrl}=await config();const result=await lovable.auth.signInWithOAuth('google',{redirect_uri:authReturnUrl(siteUrl,window.location.origin,'/auth')});if(result.error)throw result.error;if(!result.redirected)await finish(true);}catch{setError('Check your email and password');}finally{setBusy(false);}}
 async function reset(){setBusy(true);setError('');try{const {siteUrl}=await config();const {error}=await supabase.auth.resetPasswordForEmail(email,{redirectTo:authReturnUrl(siteUrl,window.location.origin,'/reset-password')});if(error)throw error;setNotice('If this email has an account, a reset link will arrive.');}catch{setError('Check your email and password');}finally{setBusy(false);}}
 return <main className="bg-background flex min-h-screen items-center justify-center px-4 py-10"><div className="w-full max-w-md space-y-6"><div className="flex items-center gap-4"><img src="/app-icon.png" alt="" className="size-14 rounded-lg"/><div><h1 className="text-2xl font-bold">FA Portal</h1><p className="text-muted-foreground text-sm">FridayAnalytics</p></div></div><section className="panel space-y-5 p-6"><div><h2 className="text-xl font-semibold">Sign in</h2><p className="text-muted-foreground mt-1 text-sm">Staff and client administrators</p></div><Button variant="outline" className="w-full" disabled={busy} onClick={google}>Continue with Google</Button><form className="space-y-4" onSubmit={submit}><div className="space-y-2"><Label htmlFor="email">Email</Label><Input id="email" type="email" required autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)} className="h-12"/></div><div className="space-y-2"><Label htmlFor="password">Password</Label><Input id="password" type="password" required autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)} className="h-12"/></div>{error&&<p role="alert" className="bg-failed text-failed-foreground rounded-md p-3 text-sm">{error}</p>}{notice&&<p role="status" className="text-sm">{notice}</p>}<Button className="w-full h-12" disabled={busy}>{busy?'Signing in…':'Sign in'}</Button><Button type="button" variant="ghost" className="w-full" disabled={busy||!email} onClick={reset}>Forgot password</Button></form></section><ThemeControl/><p className="text-center text-xs text-muted-foreground">Access by invitation only.</p></div></main>;
}
