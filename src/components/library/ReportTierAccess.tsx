import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';

type Tier = { id: string; name: string; rank: number };
type Overview = { any_set: boolean; docs: Record<string, string[]> };

export function useTierOverview() {
  return useQuery({ queryKey: ['report-tier-overview'], queryFn: async () => {
    const { data, error } = await supabase.rpc('report_tier_overview'); if (error) throw error; return data as unknown as Overview;
  } });
}

/** Staff choose which tiers see a FridayAnalytics report. No tiers ticked = not yet set (every tier sees it). The database decides who may save. */
export function ReportTierAccess({ docId, source }: { docId: string; source: string }) {
  const qc = useQueryClient();
  const tiers = useQuery({ queryKey: ['billing-tiers-list'], queryFn: async () => {
    const { data, error } = await supabase.from('billing_tiers').select('id, name, rank').order('rank'); if (error) throw error; return data as Tier[];
  } });
  const ov = useTierOverview();
  const inForce = ov.data?.docs[docId] ?? [];
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false); const [msg, setMsg] = useState<{ t: string; bad: boolean } | null>(null);
  useEffect(() => { setPicked(inForce); }, [docId, ov.data]); // eslint-disable-line react-hooks/exhaustive-deps
  if (source === 'client') return <p className="text-muted-foreground text-sm">Client uploads are always visible to their own client.</p>;
  const save = async () => {
    setBusy(true); setMsg(null);
    const { error } = await supabase.rpc('report_set_tiers', { doc: docId, tiers: picked });
    setBusy(false);
    if (error) { setMsg({ t: error.message, bad: true }); return; }
    setMsg({ t: 'Report access saved.', bad: false });
    void qc.invalidateQueries({ queryKey: ['report-tier-overview'] }); void qc.invalidateQueries({ queryKey: ['library-log', docId] });
  };
  return (
    <section className="space-y-2" aria-labelledby={`tiers-${docId}`}>
      <h3 id={`tiers-${docId}`} className="font-semibold">Report access by tier</h3>
      <p className="text-muted-foreground text-xs">{inForce.length === 0 ? 'Report access by tier not yet set: every tier sees this report once shared.' : 'Only the ticked tiers see this report once shared.'} Leave all unticked to return to "not yet set".</p>
      <div className="flex flex-wrap gap-3">
        {tiers.data?.map(t => (
          <div key={t.id} className="flex min-h-11 items-center gap-2">
            <Checkbox id={`tier-${docId}-${t.id}`} checked={picked.includes(t.id)} onCheckedChange={v => setPicked(p => (v ? [...p, t.id] : p.filter(x => x !== t.id)))} />
            <Label htmlFor={`tier-${docId}-${t.id}`}>{t.name}</Label>
          </div>
        ))}
      </div>
      <Button variant="outline" className="min-h-11" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save report access'}</Button>
      {msg ? <p role={msg.bad ? 'alert' : 'status'} className={msg.bad ? 'bg-failed text-failed-foreground rounded-md p-3 text-sm' : 'text-sm'}>{msg.t}</p> : null}
    </section>
  );
}
