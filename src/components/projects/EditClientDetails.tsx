import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Pencil, Save } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import type { Client } from '@/lib/projects';
import { clientDetails, clientDetailsSchema, type ClientDetails } from '@/lib/client-administration';
import { errText } from '@/lib/billing';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export function EditClientDetails({ client }: { client: Client }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(() => clientDetails(client));
  const qc = useQueryClient();
  const save = useMutation({
    mutationFn: async () => {
      const parsed = clientDetailsSchema.safeParse(form);
      if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? 'Check client details');
      const { error } = await supabase.rpc('client_admin_save', { _client: client.id, _details: parsed.data });
      if (error) throw error;
    },
    onSuccess: async () => {
      await Promise.all([qc.invalidateQueries({ queryKey: ['client-administration'] }), qc.invalidateQueries({ queryKey: ['clients-projects'] })]);
      setOpen(false); toast.success('Client details saved');
    },
  });
  const field = (key: keyof ClientDetails, label: string, type = 'text') => <div className="grid min-w-0 gap-1.5"><Label htmlFor={`edit-client-${key}`}>{label}</Label><Input id={`edit-client-${key}`} type={type} value={form[key]} disabled={save.isPending} onChange={e => setForm({ ...form, [key]: e.target.value })} className="min-h-11" /></div>;
  return <>
    <Button variant="outline" size="icon" className="size-11 shrink-0" aria-label={`Edit ${client.name}`} title="Edit client details and database links" onClick={() => { setForm(clientDetails(client)); save.reset(); setOpen(true); }}><Pencil className="size-4" /></Button>
    <Dialog open={open} onOpenChange={value => { if (!save.isPending) setOpen(value); }}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader><DialogTitle>Edit client — {client.name}</DialogTitle></DialogHeader>
        <form onSubmit={e => { e.preventDefault(); save.mutate(); }} className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            {field('name', 'Client name')}{field('display_name', 'Display name')}
            <div className="grid gap-1.5"><Label>Client type</Label><Select value={form.kind} disabled={save.isPending} onValueChange={value => setForm({ ...form, kind: value === 'individual' ? 'individual' : 'organization' })}><SelectTrigger aria-label="Client type" className="min-h-11"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="organization">Organization</SelectItem><SelectItem value="individual">Individual</SelectItem></SelectContent></Select></div>
            {field('legal_name', 'Legal name')}{field('sector', 'Sector')}{field('contact_name', 'Contact name')}{field('contact_email', 'Contact email', 'email')}{field('phone', 'Phone')}{field('time_zone', 'Time zone')}
          </div>
          <div className="grid gap-1.5"><Label htmlFor="edit-client-notes">Notes</Label><Textarea id="edit-client-notes" value={form.notes} disabled={save.isPending} onChange={e => setForm({ ...form, notes: e.target.value })} /></div>
          <section className="space-y-4 border-t pt-4"><h3 className="font-semibold">Database reference</h3><div className="grid gap-4 sm:grid-cols-2">{field('database_name', 'Database name')}{field('database_schema', 'Schema name')}</div>{field('database_url', 'Database link (HTTPS)', 'url')}<p className="text-sm text-muted-foreground">Reference only · Connection not checked · Credentials must not be included</p></section>
          {save.error ? <p role="alert" className="text-failed-foreground">{errText(save.error)}</p> : null}
          <DialogFooter><Button type="button" variant="outline" disabled={save.isPending} onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" disabled={save.isPending}><Save className="size-4" />{save.isPending ? 'Saving…' : 'Save client'}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  </>;
}