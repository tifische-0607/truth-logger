import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { House } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { HashChip } from "@/components/HashChip";
import { SourceBadge } from "@/components/SourceBadge";
import { platformLabel, useDarkNight } from "@/lib/darknight";
import { formatDateTime } from "@/lib/format";
import { refFiles } from "@/lib/sources";

/** Home-vault items linked to a case: references only, content opens live from DarkNight. */
export function HomeVaultItems({ caseId }: { caseId: string }) {
  const dn = useDarkNight();
  const refs = useQuery({
    queryKey: ["evidence-refs", "case", caseId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("evidence_refs")
        .select("*, incidents(incident_id)")
        .eq("case_id", caseId)
        .order("published_at", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return data;
    },
  });

  if (!refs.data?.length) return null;

  return (
    <section
      className="panel border-home-foreground/30 overflow-hidden"
      aria-labelledby="home-vault-h"
    >
      <div className="bg-home/40 flex flex-wrap items-center gap-3 border-b px-5 py-4">
        <House className="text-home-foreground size-5" aria-hidden />
        <h2 id="home-vault-h" className="font-semibold">
          Home-vault items
        </h2>
        <SourceBadge vault="home" state={dn.online ? undefined : dn.state} label="DarkNight" />
        <span className="text-muted-foreground ml-auto text-xs">
          {dn.online ? "Content opens live from home" : "Reference and hashes only while offline"}
        </span>
      </div>
      <ul className="divide-border divide-y">
        {refs.data.map((ref) => {
          const files = refFiles(ref.files);
          return (
            <li key={ref.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3.5">
              <Link
                to="/vault/$sourceId/$recordId"
                params={{ sourceId: ref.source_id, recordId: ref.record_id }}
                className="font-mono text-sm font-semibold hover:underline"
              >
                {ref.record_code}
              </Link>
              <span className="min-w-0 flex-1 basis-56 text-sm">
                {ref.item_type ?? "Record"} · {platformLabel(ref.platform)} ·{" "}
                {formatDateTime(ref.published_at)}
                {ref.incidents?.incident_id ? ` · INC-${ref.incidents.incident_id}` : ""}
                <span className="text-muted-foreground block text-xs">
                  {files.length} file hash{files.length === 1 ? "" : "es"} · linked{" "}
                  {formatDateTime(ref.linked_at)}
                  {ref.linked_by_name ? ` by ${ref.linked_by_name}` : ""}
                </span>
              </span>
              {files[0]?.sha256 ? <HashChip value={files[0].sha256} /> : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
