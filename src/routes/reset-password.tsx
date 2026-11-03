import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { hubHead } from '@/lib/hub';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
export const Route=createFileRoute('/reset-password')({head:()=>hubHead('Reset password','Set a new FA Portal password with a recovery link.'),component:ResetPassword});
function ResetPassword(){const navigate=useNavigate();const [valid,setValid]=useState(false);const [password,setPassword]=useState('');const [busy,setBusy]=useState(false);const [error,setError]=useState('');useEffect(()=>{const recovery=new URLSearchParams(window.location.hash.slice(1)).get('type')==='recovery';if(recovery)void supabase.auth.getUser().then(r=>setValid(!!r.data.user));},[]);return <main className="flex min-h-screen items-center justify-center bg-background px-4"><form className="panel w-full max-w-md p-6 space-y-4" onSubmit={async e=>{e.preventDefault();setBusy(true);const {error}=await supabase.auth.updateUser({password});if(error){setError(error.message);setBusy(false);}else await navigate({to:'/auth'});}}><h1 className="text-xl font-bold">FA Portal · Reset password</h1>{valid?<><Label htmlFor="new-password">New password</Label><Input id="new-password" type="password" autoComplete="new-password" required minLength={12} value={password} onChange={e=>setPassword(e.target.value)}/><Button disabled={busy}>Save password</Button></>:<p>Open a valid password recovery link to reset your password.</p>}{error&&<p role="alert" className="text-failed-foreground">{error}</p>}</form></main>;}
