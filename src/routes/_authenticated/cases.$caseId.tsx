import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Camera, ChevronRight, LayoutList, Printer, Tablet , UserRound, FileText, MessageSquare } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/AppShell";
import { StatusBadge } from "@/components/StatusBadge";
import { CaseTimeline } from "@/components/CaseTimeline";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatDateTime } from "@/lib/format";
import { getCachedCase, offlineFirst } from "@/lib/offline";

export const Route = createFileRoute("/_authenticated/cases/$caseId")({
  component: CasePage,
});

async function fetchCase(caseId: string) {
  const { data, error } = await supabase.from("cases").select("*").eq("id", caseId).maybeSingle();
  if (error) throw error;
  return data;
}

async function fetchIncidents(caseId: string) {
  const { data, error } = await supabase
    .from("incidents")
    .select(
      "*, accounts(id, handle, display_name, platform, profile_url, account_snapshots(id, captured_at, followers, following, verified, display_name, bio_verbatim), items(id, item_code, item_type, author_name, captured_at, parent_item_id))",
    )
    .eq("case_id", caseId)
    .order("incident_id");
  if (error) throw error;
  return data;
}

type CaseData = Awaited<ReturnType<typeof fetchCase>>;
type IncidentData = Awaited<ReturnType<typeof fetchIncidents>>;

function CasePage() {
  const { caseId } = Route.useParams();
  const queryClient = useQueryClient();

  const caseQuery = useQuery({
    queryKey: ["case", caseId],
    queryFn: async () =>
      offlineFirst<CaseData>(
        () => fetchCase(caseId),
        async () => {
          const cached = await getCachedCase(caseId);
          return (cached?.case ?? null) as CaseData;
        },
      ),
  });

  const incidents = useQuery({
    queryKey: ["case-incidents", caseId],
    queryFn: async () =>
      offlineFirst<IncidentData>(
        () => fetchIncidents(caseId),
        async () => {
          const cached = await getCachedCase(caseId);
          return (cached?.incidents ?? null) as unknown as IncidentData;
        },
      ),
  });


  const [form, setForm] = useState({
    target_of_complaint: "",
    offence_alleged: "",
    jurisdiction_agency: "",
    lead_handler: "",
    status: "open",
    notes: "",
  });

  useEffect(() => {
    if (!caseQuery.data) return;
    setForm({
      target_of_complaint: caseQuery.data.target_of_complaint ?? "",
      offence_alleged: caseQuery.data.offence_alleged ?? "",
      jurisdiction_agency: caseQuery.data.jurisdiction_agency ?? "",
      lead_handler: caseQuery.data.lead_handler ?? "",
      status: caseQuery.data.status,
      notes: caseQuery.data.notes ?? "",
    });
  }, [caseQuery.data]);

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("cases").update(form).eq("id", caseId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Case sheet saved");
      void queryClient.invalidateQueries({ queryKey: ["case", caseId] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Save failed"),
  });

  if (caseQuery.isLoading) return <p className="text-muted-foreground">Loading case…</p>;
  if (!caseQuery.data) return <p className="text-muted-foreground">Case not found.</p>;

  return (
    <>
      <PageHeader
        title={`CASE-${caseId}`}
        subtitle={`Opened ${formatDateTime(caseQuery.data.opened_on)}`}
        actions={
          <div className="flex items-center gap-3">
            <Link
              to="/report/$caseId"
              params={{ caseId }}
              className="border-input hover:bg-accent inline-flex min-h-12 items-center gap-2 rounded-lg border px-4 text-sm font-medium"
            >
              <Printer className="size-4" /> Case report
            </Link>
            <Link
              to="/summary/$caseId"
              params={{ caseId }}
              className="border-input hover:bg-accent inline-flex min-h-12 items-center gap-2 rounded-lg border px-4 text-sm font-medium"
            >
              <LayoutList className="size-4" /> Case summary
            </Link>
            <Link
              to="/timeline/$caseId"
              params={{ caseId }}
              className="border-input hover:bg-accent inline-flex min-h-12 items-center gap-2 rounded-lg border px-4 text-sm font-medium"
            >
              <LayoutList className="size-4" /> Published timeline
            </Link>
            <Link
              to="/dossier/$caseId"
              params={{ caseId }}
              className="border-input hover:bg-accent inline-flex min-h-12 items-center gap-2 rounded-lg border px-4 text-sm font-medium"
            >
              <Printer className="size-4" /> Case dossier
            </Link>
            <Link
              to="/trail/$caseId"
              params={{ caseId }}
              className="border-input hover:bg-accent inline-flex min-h-12 items-center gap-2 rounded-lg border px-4 text-sm font-medium"
            >
              <Camera className="size-4" /> Evidence trail
            </Link>
            <Link
              to="/profiles/$caseId"
              params={{ caseId }}
              className="border-input hover:bg-accent inline-flex min-h-12 items-center gap-2 rounded-lg border px-4 text-sm font-medium"
            >
              <UserRound className="size-4" /> Profile trail
            </Link>
            <Link
              to="/comments/$caseId"
              params={{ caseId }}
              className="border-input hover:bg-accent inline-flex min-h-12 items-center gap-2 rounded-lg border px-4 text-sm font-medium"
            >
              <MessageSquare className="size-4" /> Comment trail
            </Link>
            <Link
              to="/transcripts/$caseId"
              params={{ caseId }}
              className="border-input hover:bg-accent inline-flex min-h-12 items-center gap-2 rounded-lg border px-4 text-sm font-medium"
            >
              <FileText className="size-4" /> Transcript trail
            </Link>
            <Link
              to="/review/$caseId"
              params={{ caseId }}
              className="border-input hover:bg-accent inline-flex min-h-12 items-center gap-2 rounded-lg border px-4 text-sm font-medium"
            >
              <Tablet className="size-4" /> Review mode
            </Link>
            <StatusBadge status={caseQuery.data.status} className="text-sm" />
          </div>
        }
      />

      <div className="grid gap-5 lg:grid-cols-3">
        <section className="panel space-y-4 p-5">
          <h2 className="font-semibold">Case sheet</h2>
          {(
            [
              ["target_of_complaint", "Target of complaint"],
              ["offence_alleged", "Offence alleged"],
              ["jurisdiction_agency", "Jurisdiction / agency"],
              ["lead_handler", "Lead handler"],
            ] as const
          ).map(([key, label]) => (
            <div key={key} className="space-y-2">
              <Label htmlFor={key}>{label}</Label>
              <Input
                id={key}
                value={form[key]}
                onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                className="h-12 text-base"
              />
            </div>
          ))}
          <div className="space-y-2">
            <Label htmlFor="status">Status</Label>
            <select
              id="status"
              value={form.status}
              onChange={(e) => setForm({ ...form, status: e.target.value })}
              className="border-input bg-background h-12 w-full rounded-md border px-3 text-base"
            >
              <option value="open">open</option>
              <option value="filed">filed</option>
              <option value="closed">closed</option>
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              rows={4}
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </div>
          <Button className="h-12 w-full" disabled={save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? "Saving…" : "Save case sheet"}
          </Button>
        </section>

        <section className="space-y-5 lg:col-span-2">
          <CaseTimeline caseId={caseId} />
          {incidents.data?.length ? (
            incidents.data.map((inc) => (
              <div key={inc.id} className="panel p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-mono text-sm font-bold">INC-{inc.incident_id}</h3>
                  <span className="text-muted-foreground text-xs">
                    {inc.start_date ?? "—"}
                    {inc.end_date ? ` → ${inc.end_date}` : ""} · {inc.escalation_stage ?? "—"}
                  </span>
                </div>
                {inc.summary ? <p className="mt-2 text-sm">{inc.summary}</p> : null}
                {inc.narrative_themes?.length ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {inc.narrative_themes.map((theme) => (
                      <span
                        key={theme}
                        className="bg-secondary text-secondary-foreground rounded-full px-3 py-1 text-xs"
                      >
                        {theme}
                      </span>
                    ))}
                  </div>
                ) : null}

                <div className="mt-4 space-y-4">
                  {inc.accounts?.map((acct) => {
                    const snapshots = [...(acct.account_snapshots ?? [])].sort((a, b) =>
                      b.captured_at.localeCompare(a.captured_at),
                    );
                    const posts = (acct.items ?? []).filter((i) => i.item_type === "post");
                    return (
                      <div key={acct.id} className="bg-muted/50 rounded-xl border p-4">
                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                          <div className="font-mono text-sm font-semibold">
                            {acct.platform}_@{acct.handle}
                          </div>
                          <div className="text-muted-foreground text-xs">
                            {acct.display_name ?? "—"}
                          </div>
                        </div>

                        {snapshots.length ? (
                          <div className="mt-3">
                            <div className="text-muted-foreground text-xs font-semibold uppercase">
                              Snapshot history
                            </div>
                            <ul className="mt-1 space-y-1 text-xs">
                              {snapshots.map((s) => (
                                <li key={s.id} className="text-muted-foreground">
                                  <span className="hash">{formatDateTime(s.captured_at)}</span> ·{" "}
                                  {s.followers ?? "—"} followers · {s.following ?? "—"} following ·{" "}
                                  {s.verified ? "verified" : "not verified"}
                                </li>
                              ))}
                            </ul>
                          </div>
                        ) : null}

                        <div className="mt-3 space-y-1">
                          {posts.map((post) => (
                            <Link
                              key={post.id}
                              to="/items/$itemId"
                              params={{ itemId: post.id }}
                              className="hover:bg-background flex min-h-12 items-center justify-between rounded-lg px-3 text-sm transition-colors"
                            >
                              <span className="font-mono font-semibold">{post.item_code}</span>
                              <span className="text-muted-foreground flex items-center gap-1 text-xs">
                                {
                                  (acct.items ?? []).filter((i) => i.item_type !== "post").length
                                }{" "}
                                comments <ChevronRight className="size-4" />
                              </span>
                            </Link>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                  {inc.accounts?.length ? null : (
                    <p className="text-muted-foreground text-sm">No accounts captured yet.</p>
                  )}
                </div>
              </div>
            ))
          ) : (
            <p className="text-muted-foreground panel p-6 text-sm">No incidents yet.</p>
          )}
        </section>
      </div>
    </>
  );
}
