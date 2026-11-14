import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Pencil } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import type { Project } from '@/lib/projects';
import { projectDetailsSchema } from '@/lib/project-details';
import { errorMessage } from '@/lib/portal-access';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';

export function EditProjectDetails({ project, compact = false }: { project: Project; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(project.name);
  const [summary, setSummary] = useState(project.summary ?? '');
  const [due, setDue] = useState(project.due_on ?? '');
  const qc = useQueryClient();
  const permission = useQuery({
    queryKey: ['project-details-permission', project.id],
    queryFn: async () => {
      const { data: auth, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;
      if (!auth.user) return false;
      const { data, error } = await supabase.rpc('can_manage_project', { _user_id: auth.user.id, _project_id: project.id });
      if (error) throw error;
      return data === true;
    },
  });
  const save = useMutation({
    mutationFn: async () => {
      const details = projectDetailsSchema.parse({ name, summary, due_on: due });
      const { data, error } = await supabase.from('projects').update(details).eq('id', project.id).select('id').single();
      if (error) throw error;
      if (!data) throw new Error('You are not permitted to edit this project.');
    },
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['project', project.id] }),
        qc.invalidateQueries({ queryKey: ['clients-projects'] }),
        qc.invalidateQueries({ queryKey: ['workable-projects'] }),
      ]);
      setOpen(false);
      toast.success('Project details saved');
    },
  });
  if (!permission.data) return null;
  const changeOpen = (value: boolean) => {
    if (save.isPending) return;
    if (value) {
      setName(project.name);
      setSummary(project.summary ?? '');
      setDue(project.due_on ?? '');
      save.reset();
    }
    setOpen(value);
  };
  return <>
    <Button variant="outline" size={compact ? 'icon' : 'default'} className="min-h-11 min-w-11 shrink-0" aria-label={`Edit project details: ${project.name}`} title="Edit project details" onClick={() => changeOpen(true)}>
      <Pencil className="size-4" />{compact ? null : 'Edit details'}
    </Button>
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader><DialogTitle>Edit project details</DialogTitle><DialogDescription>{project.code}{' · '}{project.name}</DialogDescription></DialogHeader>
        <form className="grid gap-4" onSubmit={event => { event.preventDefault(); save.mutate(); }}>
          <div className="grid gap-1.5"><Label htmlFor={`edit-name-${project.id}`}>Project name</Label><Input id={`edit-name-${project.id}`} className="min-h-11" value={name} onChange={event => setName(event.target.value)} required disabled={save.isPending} /></div>
          <div className="grid gap-1.5"><Label htmlFor={`edit-due-${project.id}`}>Due date</Label><Input id={`edit-due-${project.id}`} className="min-h-11" type="date" value={due} onChange={event => setDue(event.target.value)} disabled={save.isPending} /></div>
          <div className="grid gap-1.5"><Label htmlFor={`edit-summary-${project.id}`}>Summary</Label><Textarea id={`edit-summary-${project.id}`} rows={4} value={summary} onChange={event => setSummary(event.target.value)} disabled={save.isPending} /></div>
          {save.error ? <p role="alert" className="bg-failed text-failed-foreground rounded-md p-3 text-sm">{errorMessage(save.error)}</p> : null}
          <DialogFooter><Button variant="outline" type="button" className="min-h-11" disabled={save.isPending} onClick={() => changeOpen(false)}>Cancel</Button><Button type="submit" className="min-h-11" disabled={!name.trim() || save.isPending}>{save.isPending ? <Loader2 className="size-4 animate-spin" /> : null}Save changes</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  </>;
}