import { useQuery } from "@tanstack/react-query";
import { Network } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type Released = { id: string; graph_ref: string; sha256: string; report: string; engagement: string; released_at: string };

/** Client portal: link graphs that FridayAnalytics released inside a report. The database returns nothing else. */
export function ReleasedGraphs({ clientId, sample }: { clientId: string; sample: boolean }) {
  const q = useQuery({
    queryKey: ["portal-released-graphs", clientId], enabled: !sample,
    queryFn: async () => { const { data, error } = await supabase.rpc("portal_released_graphs", { c: clientId }); if (error) throw error; return data as unknown as Released[]; },
  });
  const rows = sample ? [] : q.data ?? [];
  if (!rows.length) return null;
  return (
    <section aria-labelledby="released-graphs" className="panel p-5">
      <h2 id="released-graphs" className="font-display flex items-center gap-2 text-lg font-medium"><Network className="size-5" />Link graphs in your reports</h2>
      <ul className="mt-2 space-y-2">{rows.map((r) => (
        <li key={r.id}><p className="font-medium">{r.report} · {r.engagement}</p><p className="text-muted-foreground font-mono text-sm break-all">{r.graph_ref} · SHA-256 {r.sha256}</p></li>
      ))}</ul>
    </section>
  );
}
