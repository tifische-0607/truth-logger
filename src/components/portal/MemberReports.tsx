import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download, FileText } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { downloadLibraryDocument } from '@/lib/library-download';
import { errorMessage } from '@/lib/portal-access';
import { formatBytes } from '@/lib/format';
import { hubDate } from '@/lib/hub';
import { Button } from '@/components/ui/button';

type Report = { id: string; code: string; title: string; kind: string; file_name: string | null; size_bytes: number | null; sha256: string | null; version: number; created_at: string; available: boolean };

/** Members see only reports released to Members (and their tier). The database returns nothing else: no client names, engagements or research. */
export function MemberReports() {
  const q = useQuery({ queryKey: ['member-reports'], queryFn: async () => { const { data, error } = await supabase.rpc('member_reports'); if (error) throw error; return data as unknown as Report[]; } });
  const [st, setSt] = useState<{ id: string; t: string; bad: boolean } | null>(null);
  if (q.isPending) return <p>Loading reports…</p>;
  if (q.error) return <p role="alert" className="bg-failed text-failed-foreground rounded-md p-4">{errorMessage(q.error)}</p>;
  if (q.data.length === 0) return <p className="text-muted-foreground">No reports have been released to Members yet.</p>;
  const dl = async (r: Report) => {
    setSt({ id: r.id, t: 'Fetching from DarkNight and checking the file…', bad: false });
    try { const x = await downloadLibraryDocument(r.id); setSt({ id: r.id, t: x.message, bad: !x.ok }); } catch (e) { setSt({ id: r.id, t: errorMessage(e), bad: true }); }
  };
  return (
    <ul className="grid gap-3">
      {q.data.map(r => (
        <li key={r.id} className="panel space-y-2 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex gap-3"><FileText className="mt-1 size-5 shrink-0" aria-hidden /><div><p className="font-medium">{r.title}</p><p className="text-muted-foreground text-sm">{r.code} · v{r.version} · {hubDate(r.created_at)}{r.size_bytes ? ` · ${formatBytes(r.size_bytes)}` : ''}</p>{r.sha256 ? <p className="text-muted-foreground font-mono text-xs break-all">SHA-256 {r.sha256}</p> : null}</div></div>
            <Button variant="outline" className="min-h-11" disabled={!r.available} onClick={() => void dl(r)}><Download className="size-4" />{r.available ? 'Download' : 'Not yet available'}</Button>
          </div>
          {st?.id === r.id ? <p role={st.bad ? 'alert' : 'status'} className={st.bad ? 'bg-failed text-failed-foreground rounded-md p-3 text-sm' : 'text-sm'}>{st.t}</p> : null}
        </li>))}
    </ul>
  );
}
