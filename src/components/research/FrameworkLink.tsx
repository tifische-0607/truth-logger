import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Refusal } from "@/components/research/ResearchBits";
import { errText } from "@/lib/research";

/** Research plans record the framework version they use; the database refuses Start without a Curator-approved one. */
export function FrameworkLink({ planId, linked, locked, canEdit }: { planId: string; linked: string | null; locked: boolean; canEdit: boolean }) {
  const qc = useQueryClient();
  const [pick, setPick] = useState(linked ?? "");
  const [err, setErr] = useState<string | null>(null);
  const opts = useQuery({
    queryKey: ["framework-active"],
    queryFn: async () => {
      const { data: entries, error } = await supabase.from("framework_entries").select("id, code, name").order("code");
      if (error) throw error;
      const out: { id: string; label: string }[] = [];
      for (const e of entries ?? []) {
        const { data: v } = await supabase.rpc("fw_active_version", { _entry: e.id });
        if (!v) continue;
        const { data: row } = await supabase.from("framework_versions").select("version").eq("id", v as string).maybeSingle();
        out.push({ id: v as string, label: `${e.code} v${row?.version ?? "?"} · ${e.name}` });
      }
      return out;
    },
  });
  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("research_link_framework", { _plan: planId, _version: pick });
      if (error) throw error;
    },
    onSuccess: () => { setErr(null); void qc.invalidateQueries({ queryKey: ["research"] }); },
    onError: (e) => setErr(errText(e)),
  });
  const current = opts.data?.find((o) => o.id === linked);
  return (
    <div className="mb-4 space-y-2">
      <p className="text-sm font-semibold">Framework version</p>
      {linked ? <p className="text-sm">Linked: {current?.label ?? "a recorded version"}</p> : <p className="text-muted-foreground text-sm">Not linked. Research cannot start without one.</p>}
      {!locked && canEdit ? (
        opts.data && opts.data.length === 0 ? (
          <p className="text-muted-foreground text-sm">No Curator-approved framework version is in force yet. Load one in Frameworks.</p>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <label className="sr-only" htmlFor={`fw-${planId}`}>Framework version</label>
            <select id={`fw-${planId}`} className="border-input bg-background min-h-11 rounded-md border px-3 text-sm" value={pick} onChange={(e) => setPick(e.target.value)}>
              <option value="">Choose a version</option>
              {opts.data?.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
            </select>
            <Button variant="outline" className="min-h-11" disabled={!pick || save.isPending} onClick={() => save.mutate()}>{save.isPending ? "Linking…" : "Link version"}</Button>
          </div>
        )
      ) : null}
      <Refusal text={err} />
    </div>
  );
}
