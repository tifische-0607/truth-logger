import { Link } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { hubDate } from '@/lib/hub';
import { refFiles } from '@/lib/home-vault';
import { SourceBadge } from './SourceStatus';
import { cachedReferences } from '@/lib/reference-cache';

export function HomeReferences({ caseId }: { caseId: string }) {
  const q = useQuery({ queryKey: ['home-refs', caseId], networkMode:'always', queryFn: () => cachedReferences(caseId) });
  return <section className="mt-8 space-y-4"><h2 className="text-xl font-semibold">Home vault</h2>{q.error && <p role="alert">Home references unavailable</p>}<div className="relative overflow-x-auto"><table className="w-full min-w-[680px] text-left text-sm"><thead><tr className="border-b"><th className="p-3">Record</th><th className="p-3">Source</th><th className="p-3">Published</th><th className="p-3">Linking fingerprints</th></tr></thead><tbody>{q.data?.map(ref => <tr key={ref.id} className="border-b"><td className="p-3"><Link className="font-mono underline" to="/vault/$sourceId/$recordId" params={{ sourceId: ref.source_id, recordId: ref.record_id }}>{ref.record_code || ref.record_id}</Link><p>{ref.platform} · {ref.item_type}</p></td><td className="p-3"><SourceBadge home /></td><td className="p-3">{hubDate(ref.published_at)}</td><td className="p-3">{refFiles(ref).map(f => <div key={f.file_id}><span>{f.filename}</span><p className="hash">{f.sha256}</p>{f.element_crop && <span>Element crop</span>}</div>)}</td></tr>)}</tbody></table></div>{!q.isLoading && !q.data?.length && <p className="text-muted-foreground text-sm">No home-vault references linked.</p>}</section>;
}