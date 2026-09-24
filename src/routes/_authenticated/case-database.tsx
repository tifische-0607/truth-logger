import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Save } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/_authenticated/case-database")({
  head: () => ({ meta: [{ title: "Case database — SpyGlass V2" }] }),
  component: CaseDatabasePage,
});

type Row = {
  id: string;
  target_of_complaint: string | null;
  offence_alleged: string | null;
  jurisdiction_agency: string | null;
  status: string;
  lead_handler: string | null;
};

const FIELDS = [
  ["target_of_complaint", "Target"],
  ["offence_alleged", "Offence"],
  ["jurisdiction_agency", "Agency"],
  ["lead_handler", "Lead handler"],
] as const;
const STATUSES = ["open", "on hold", "escalated", "reported", "closed"];

function CaseDatabasePage() {
  const q = useQuery({
    queryKey: ["case-database"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cases")
        .select("id, target_of_complaint, offence_alleged, jurisdiction_agency, status, lead_handler")
        .order("id", { ascending: false });
      if (error) throw error;
      return data as Row[];
    },
  });

  return (
    <div>
      <PageHeader
        title="Case database"
        subtitle="Edit case details here — the case page, summary, report and dossier update automatically"
      />
      {q.isLoading ? <p className="text-muted-foreground">Loading…</p> : null}
      {q.error ? <p className="text-destructive">{(q.error as Error).message}</p> : null}
      <div className="space-y-3">
        {(q.data ?? []).map((r) => (
          <CaseRow key={r.id} row={r} />
        ))}
      </div>
    </div>
  );
}

function CaseRow({ row }: { row: Row }) {
  const qc = useQueryClient();
  const [draft, setDraft] = useState(row);
  useEffect(() => setDraft(row), [row]);
  const dirty = (Object.keys(row) as (keyof Row)[]).some((k) => (row[k] ?? "") !== (draft[k] ?? ""));

  const save = useMutation({
    mutationFn: async () => {
      const clean = (v: string | null) => (v && v.trim() ? v.trim() : null);
      const { error } = await supabase
        .from("cases")
        .update({
          target_of_complaint: clean(draft.target_of_complaint),
          offence_alleged: clean(draft.offence_alleged),
          jurisdiction_agency: clean(draft.jurisdiction_agency),
          lead_handler: clean(draft.lead_handler),
          status: draft.status,
        })
        .eq("id", row.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(`CASE-${row.id} saved`);
      qc.invalidateQueries();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const statuses = STATUSES.includes(draft.status) ? STATUSES : [draft.status, ...STATUSES];

  return (
    <div className="panel grid gap-3 p-4 md:grid-cols-[8rem_repeat(4,minmax(0,1fr))_9rem_auto] md:items-end">
      <Link to="/cases/$caseId" params={{ caseId: row.id }} className="text-primary self-center font-mono font-semibold underline">
        CASE-{row.id}
      </Link>
      {FIELDS.map(([key, label]) => (
        <label key={key} className="text-xs">
          <span className="text-muted-foreground uppercase">{label}</span>
          <Input
            className="mt-1 h-12"
            value={draft[key] ?? ""}
            onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
          />
        </label>
      ))}
      <label className="text-xs">
        <span className="text-muted-foreground uppercase">Status</span>
        <select
          className="border-input bg-background mt-1 h-12 w-full rounded-md border px-3 text-sm"
          value={draft.status}
          onChange={(e) => setDraft({ ...draft, status: e.target.value })}
        >
          {statuses.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </label>
      <Button className="h-12" disabled={!dirty || save.isPending} onClick={() => save.mutate()}>
        <Save className="size-4" /> {save.isPending ? "Saving…" : "Save"}
      </Button>
    </div>
  );
}
