import { useQuery } from "@tanstack/react-query";
import { FileCheck2 } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { formatDateTime } from "@/lib/format";

// How long a view/download or export link stays valid after it is issued.
const LINK_LIFETIME_S: Record<string, number> = { accessed: 300, exported: 3600 };

export function CaptureCustodyTrail({ itemId }: { itemId: string }) {
  const q = useQuery({
    queryKey: ["capture-custody", itemId],
    queryFn: async () => {
      const { data: kids } = await supabase.from("items").select("id").eq("parent_item_id", itemId);
      const ids = [itemId, ...(kids ?? []).map((k) => k.id)];
      const { data: arts, error } = await supabase
        .from("artefacts")
        .select("id, filename, kind, sha256, created_at")
        .in("item_id", ids)
        .order("created_at");
      if (error) throw error;
      const artIds = (arts ?? []).map((a) => a.id);
      const { data: evs } = artIds.length
        ? await supabase
            .from("custody_events")
            .select("id, artefact_id, action, handler, notes, created_at")
            .in("artefact_id", artIds)
            .order("created_at")
        : { data: [] };
      return { arts: arts ?? [], evs: evs ?? [] };
    },
  });

  const now = Date.now();
  return (
    <div className="panel overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3">
        <h2 className="flex items-center gap-2 font-semibold">
          <FileCheck2 className="size-4" /> Custody trail
        </h2>
        <span className="text-muted-foreground text-xs">
          {q.data?.arts.length ?? 0} files · stored files never expire
        </span>
      </div>
      {q.isLoading ? (
        <p className="text-muted-foreground px-5 pb-4 text-sm">Loading…</p>
      ) : !q.data?.arts.length ? (
        <p className="text-muted-foreground px-5 pb-4 text-sm">No files recorded for this capture yet.</p>
      ) : (
        <ul className="divide-y">
          {q.data.arts.map((a) => {
            const evs = q.data.evs.filter((e) => e.artefact_id === a.id);
            return (
              <li key={a.id} className="px-5 py-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-mono text-sm font-semibold break-all">{a.filename}</span>
                  <span className="text-muted-foreground text-xs">
                    Uploaded {formatDateTime(a.created_at)}
                  </span>
                </div>
                <div className="hash text-muted-foreground mt-1 break-all">{a.sha256 ?? "no hash"}</div>
                <ol className="mt-3 space-y-1.5 border-l pl-4">
                  {evs.map((e) => {
                    const life = LINK_LIFETIME_S[e.action];
                    const exp = life ? new Date(e.created_at).getTime() + life * 1000 : null;
                    return (
                      <li key={e.id} className="text-sm">
                        <span className="font-medium capitalize">{e.action}</span>
                        <span className="text-muted-foreground">
                          {" "}· {formatDateTime(e.created_at)} · by {e.handler ?? "unknown"}
                        </span>
                        {exp ? (
                          <span className="text-muted-foreground block text-xs">
                            Link {exp < now ? "expired" : "expires"} {formatDateTime(new Date(exp).toISOString())}
                          </span>
                        ) : null}
                        {e.notes ? <span className="text-muted-foreground block text-xs">{e.notes}</span> : null}
                      </li>
                    );
                  })}
                  {!evs.length ? <li className="text-muted-foreground text-sm">No custody events.</li> : null}
                </ol>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
