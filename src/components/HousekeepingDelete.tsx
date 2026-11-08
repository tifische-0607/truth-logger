import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { accessMenuQuery } from '@/lib/access-levels';
import { canDeleteHousekeeping } from '@/lib/housekeeping';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel } from '@/components/ui/alert-dialog';

export function HousekeepingDelete({ kind, id, label, running = false, onDeleted }: {
  kind: 'project' | 'capture_job'; id: string; label: string; running?: boolean; onDeleted?: () => void;
}) {
  const access = useQuery(accessMenuQuery);
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const deletion = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('housekeeping_delete', { _kind: kind, _id: id, _reason: reason });
      if (error) throw error;
    },
    onSuccess: async () => {
      setOpen(false);
      await qc.invalidateQueries();
      toast.success('Deleted from active records. Deletion logged; evidence retained.');
      onDeleted?.();
    },
    onError: (e: { message?: string }) => setError(e.message ?? 'Could not delete this record.'),
  });
  if (!canDeleteHousekeeping(access.data)) return null;
  const noun = kind === 'project' ? 'project' : 'capture job';
  return <>
    <Button variant="ghost" size="icon" className="min-h-11 min-w-11 text-destructive" aria-label={`Delete ${noun}`} title={running ? 'Stop the running capture job before deleting it.' : `Delete ${noun}`} disabled={running} onClick={() => { setReason(''); setError(''); setOpen(true); }}><Trash2 className="size-4" /></Button>
    <AlertDialog open={open} onOpenChange={value => { if (!deletion.isPending) setOpen(value); }}>
      <AlertDialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-lg">
        <AlertDialogHeader><AlertDialogTitle>Delete {noun}?</AlertDialogTitle><AlertDialogDescription className="break-words">{label}<br />This removes the {noun} from active lists. Original records, evidence files and custody history remain untouched. The deletion and your reason are permanently logged.</AlertDialogDescription></AlertDialogHeader>
        <label className="space-y-2 text-sm font-medium">Deletion reason<Textarea aria-label="Deletion reason" value={reason} maxLength={1000} onChange={e => setReason(e.target.value)} /></label>
        {error ? <p role="alert" className="text-destructive text-sm">{error}</p> : null}
        <AlertDialogFooter><AlertDialogCancel disabled={deletion.isPending} className="min-h-11">Cancel</AlertDialogCancel><Button variant="destructive" className="min-h-11" disabled={!reason.trim() || deletion.isPending} onClick={() => deletion.mutate()}>{deletion.isPending ? 'Deleting…' : `Delete ${noun}`}</Button></AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </>;
}