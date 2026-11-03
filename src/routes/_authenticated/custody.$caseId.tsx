import { createFileRoute } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { Printer } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { hubHead, hubDate } from '@/lib/hub';
import { SourceBadge } from '@/components/SourceStatus';
import { Button } from '@/components/ui/button';
import { PrintDocument } from '@/components/print/PrintDocument';

export const Route = createFileRoute('/_authenticated/custody/$caseId')({ head: () => hubHead('Case custody'), component: CustodyPage });

function CustodyPage() {
  const { caseId } = Route.useParams();
  const q = useQuery({
    queryKey: ['case-custody', caseId],
    queryFn: async () => {
      const [items, refs] = await Promise.all([
        supabase.from('items').select('id,accounts!inner(incidents!inner(case_id))').eq('accounts.incidents.case_id', caseId),
        supabase.from('evidence_refs').select('id').eq('case_id', caseId),
      ]);
      if (items.error) throw items.error;
      if (refs.error) throw refs.error;
      const ids = items.data.map((i) => i.id);
      const rids = refs.data.map((r) => r.id);
      const results = await Promise.all([
        ids.length ? supabase.from('custody_events').select('*').in('item_id', ids) : Promise.resolve({ data: [], error: null }),
        rids.length ? supabase.from('custody_events').select('*').in('evidence_ref_id', rids) : Promise.resolve({ data: [], error: null }),
      ]);
      for (const r of results) if (r.error) throw r.error;
      return [...(results[0].data ?? []), ...(results[1].data ?? [])].sort((a, b) => a.created_at.localeCompare(b.created_at));
    },
  });
  return (
    <section className="space-y-5">
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="kicker mb-2">04 · Cases · Custody</p>
          <h1 className="font-display text-2xl font-medium">Custody</h1>
        </div>
        <Button className="h-12" onClick={() => window.print()}>
          <Printer className="size-4" /> Print / save as PDF
        </Button>
      </div>
      {q.error && <p role="alert">Custody could not be loaded.</p>}
      <PrintDocument
        label="Custody report"
        kicker="03 · Custody report"
        title={`CASE-${caseId}`}
        subtitle="Chain-of-custody log"
        cover={{
          details: [
            ['Reference', `CASE-${caseId}`],
            ['Date', hubDate(new Date().toISOString())],
            ['Entries', String(q.data?.length ?? 0)],
            ['Version', 'Generated from the append-only custody log'],
          ],
        }}
      >
        <h2>Custody entries</h2>
        <p className="fa-doc-caption">Every recorded action, oldest first. Entries are append-only.</p>
        <div className="relative overflow-x-auto">
          <table className="w-full min-w-[800px] text-left text-sm print:min-w-0">
            <thead>
              <tr className="border-b">
                {['Date', 'Source', 'Action', 'File / reference', 'SHA-256', 'Handler', 'Notes'].map((h) => (
                  <th key={h} className="p-3">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {q.data?.map((e) => (
                <tr key={e.id} className="border-b">
                  <td className="p-3 whitespace-nowrap">{hubDate(e.created_at)}</td>
                  <td className="p-3"><SourceBadge home={e.source_id !== 'cloud'} /></td>
                  <td className="p-3">{e.action}</td>
                  <td className="p-3">{e.filename || e.evidence_ref_id}</td>
                  <td className="p-3"><span className="hash">{e.sha256 || '—'}</span></td>
                  <td className="p-3">{e.handler}</td>
                  <td className="p-3">{e.notes}</td>
                </tr>
              ))}
              {q.data?.length === 0 ? (
                <tr><td colSpan={7} className="p-3">No custody entries recorded yet.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </PrintDocument>
    </section>
  );
}
