import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/AppShell";
import { Chip, Section } from "@/components/engagement/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { hubHead } from "@/lib/hub";
import { formatDateTime } from "@/lib/format";
import { errText, homeGateway } from "@/lib/home-gateway";
import { applyVisibility, CONTENT_TYPES, NO_CONTENT_TYPES, sampleSearchGateway, searchGateway, type SearchFilters, type SearchKind, type SearchMode } from "@/lib/search-gateway";

export const Route = createFileRoute("/_authenticated/evidence-search")({
  validateSearch: (r: Record<string, unknown>): { preview?: "sample" | undefined } => ({ preview: r["preview"] === "sample" ? "sample" : undefined }),
  head: () => hubHead("Evidence search", "One search across captures, cases, narratives, entities and reports you may see in FA Portal."),
  component: EvidenceSearch,
});

type Saved = { id: string; name: string; mode: SearchMode; query: string | null; filters: SearchFilters; at: string; promotion: string | null; requirement: string | null };
type Overview = { can_edit_settings: boolean; is_curator: boolean; content_types: SearchKind[]; saved: Saved[]; requirements: { id: string; code: string }[] };
type Row = ReturnType<typeof applyVisibility>["shown"][number];
const sel = "border-input bg-background min-h-11 w-full rounded-md border px-3 text-sm";
const Refuse = ({ t }: { t: string | null }) => (t ? <p role="alert" className="bg-failed text-failed-foreground rounded-md px-3 py-2 text-sm">{t}</p> : null);
const Dot = ({ c }: { c: string }) => <span aria-hidden className={`${c} size-2 rounded-full`} />;
const PROMO: Record<string, [string, string]> = { requested: ["Waiting for Curator", "bg-warn"], approved: ["Approved", "bg-positive"], declined: ["Declined", "bg-muted-foreground"] };

function EvidenceSearch() {
  const { preview } = Route.useSearch();
  const sample = preview === "sample";
  const qc = useQueryClient();
  const [project, setProject] = useState("");
  const [mode, setMode] = useState<SearchMode>("keyword");
  const [query, setQuery] = useState("");
  const [f, setF] = useState<SearchFilters>({});
  const [rows, setRows] = useState<{ shown: Row[]; hidden: number } | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const projects = useQuery({ queryKey: ["srch-projects"], enabled: !sample, queryFn: async () => { const { data, error } = await supabase.from("projects").select("id,name").order("name"); if (error) throw error; return data; } });
  const ov = useQuery({ queryKey: ["srch-overview", project], enabled: !sample, queryFn: async () => { const { data, error } = await supabase.rpc("srch_overview", { _project: (project || null) as string }); if (error) throw error; return data as unknown as Overview; } });
  const overview: Overview | undefined = sample ? { can_edit_settings: false, is_curator: false, content_types: ["captures", "narratives", "entities"], saved: [], requirements: [] } : ov.data;
  const types = overview?.content_types ?? [];

  const run = async (e?: React.FormEvent) => {
    e?.preventDefault(); setMsg(null); setRows(null);
    if (!sample && !project) return setMsg("Choose an engagement first.");
    if (types.length === 0) return setMsg(NO_CONTENT_TYPES);
    setBusy(true);
    try {
      const filters: SearchFilters = { ...f, kinds: (f.kinds?.length ? f.kinds : types).filter((k) => types.includes(k)) };
      if (sample) {
        const r = sampleSearchGateway.search(mode, filters);
        if (r.ok) setRows(applyVisibility(r.hits, sampleSearchGateway.visible(r.hits)));
        return;
      }
      const gw = await homeGateway();
      const r = await searchGateway(gw.url, { project_id: project, mode, query, filters }, gw.token);
      if (!r.ok) return setMsg(r.message);
      const { data, error } = await supabase.rpc("srch_visible", { _results: r.hits as never });
      if (error) return setMsg(error.message);
      const out = applyVisibility(r.hits, (data ?? []) as never);
      setRows(out);
      await supabase.rpc("srch_log_search", { _project: project, _mode: mode, _filters: Object.keys(f).filter((k) => (f as Record<string, unknown>)[k]), _shown: out.shown.length, _hidden: out.hidden });
    } finally { setBusy(false); }
  };

  return (
    <>
      <PageHeader kicker="06 · Analyse" title="Evidence search" subtitle="One search across the evidence you may see. Indexes stay on DarkNight; every result opens to its capture and custody log." />
      {sample ? <p className="bg-warn text-warn-foreground mb-4 rounded-md px-3 py-2 text-sm">Sample — fake gateway with demonstration data. Nothing here is real or saved.</p> : null}
      {ov.error ? <Refuse t={errText(ov.error)} /> : null}

      <Section id="srch-types" title="Content types indexed" hint="Staff setting. Search covers only the content types chosen here.">
        {types.length === 0 ? <p className="text-sm"><Chip><Dot c="bg-muted-foreground" />{NO_CONTENT_TYPES}</Chip></p>
          : <div className="flex flex-wrap gap-2">{types.map((t) => <Chip key={t}><Dot c="bg-positive" />{CONTENT_TYPES.find((c) => c.key === t)?.label}</Chip>)}</div>}
        {overview?.can_edit_settings ? <TypesDialog current={types} /> : null}
      </Section>

      <form onSubmit={run} className="mt-4 grid gap-3">
        <div className="grid gap-3 sm:grid-cols-3">
          {!sample ? <div className="grid gap-1"><Label htmlFor="srch-p">Engagement</Label><select id="srch-p" className={sel} value={project} onChange={(e) => setProject(e.target.value)}><option value="">Choose…</option>{projects.data?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
            : <div className="grid gap-1"><Label>Engagement</Label><p className="flex min-h-11 items-center text-sm">Sample engagement</p></div>}
          <div className="grid gap-1"><Label htmlFor="srch-mode">Search by</Label><select id="srch-mode" className={sel} value={mode} onChange={(e) => setMode(e.target.value as SearchMode)}><option value="keyword">Keywords (Malay and English)</option><option value="meaning">Meaning</option><option value="image">Image copies and edits</option></select></div>
          <div className="grid gap-1"><Label htmlFor="srch-q">{mode === "image" ? "Image capture ID" : "Search for"}</Label><Input id="srch-q" className="h-11" value={query} onChange={(e) => setQuery(e.target.value)} /></div>
        </div>
        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <div className="grid gap-1"><Label htmlFor="srch-pl">Platform</Label><select id="srch-pl" className={sel} value={f.platform ?? ""} onChange={(e) => setF({ ...f, platform: e.target.value || undefined })}><option value="">Any</option>{["facebook", "google", "threads", "x", "instagram", "tiktok"].map((p) => <option key={p}>{p}</option>)}</select></div>
          <div className="grid gap-1"><Label htmlFor="srch-from">From</Label><Input id="srch-from" type="date" className="h-11" value={f.from ?? ""} onChange={(e) => setF({ ...f, from: e.target.value || undefined })} /></div>
          <div className="grid gap-1"><Label htmlFor="srch-to">To</Label><Input id="srch-to" type="date" className="h-11" value={f.to ?? ""} onChange={(e) => setF({ ...f, to: e.target.value || undefined })} /></div>
          <div className="grid gap-1"><Label htmlFor="srch-n">Narrative ID</Label><Input id="srch-n" className="h-11 font-mono" value={f.narrative ?? ""} onChange={(e) => setF({ ...f, narrative: e.target.value || undefined })} /></div>
          <div className="grid gap-1"><Label htmlFor="srch-e">Entity ID</Label><Input id="srch-e" className="h-11 font-mono" value={f.entity ?? ""} onChange={(e) => setF({ ...f, entity: e.target.value || undefined })} /></div>
          <div className="grid gap-1"><Label htmlFor="srch-v">Verification</Label><select id="srch-v" className={sel} value={f.verification ?? ""} onChange={(e) => setF({ ...f, verification: e.target.value || undefined })}><option value="">Any</option><option value="verified">Verified</option><option value="unverified">Unverified</option></select></div>
        </div>
        <div className="flex flex-wrap gap-2"><Button type="submit" className="h-11" disabled={busy}>{busy ? "Searching DarkNight…" : "Search"}</Button>
          {!sample && project ? <SaveDialog project={project} mode={mode} query={query} filters={f} onSaved={() => qc.invalidateQueries({ queryKey: ["srch-overview"] })} /> : null}</div>
      </form>

      {msg ? <p role="alert" className="bg-warn text-warn-foreground mt-4 rounded-md px-3 py-2 text-sm">{msg}</p> : null}
      {rows ? (
        <Section id="srch-results" title={`Results (${rows.shown.length})`} hint={rows.hidden ? `${rows.hidden} result(s) removed because you may not see them or they cite no capture.` : "Every result shown is one you may open."}>
          {rows.shown.length === 0 ? <p className="text-muted-foreground text-sm">No results.</p> : (
            <ul className="grid gap-2">{rows.shown.map(({ hit, link }) => (
              <li key={hit.key} className="bg-muted grid gap-1 rounded-md p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2"><span className="font-medium">{hit.title}</span><Chip><Dot c={hit.verification === "verified" ? "bg-positive" : "bg-warn"} />{hit.verification === "verified" ? "Verified" : "Unverified"}</Chip></div>
                <p>{hit.snippet}</p>
                <p className="text-muted-foreground">{CONTENT_TYPES.find((c) => c.key === hit.kind)?.label} · {hit.platform} · {formatDateTime(hit.at)} · match {(hit.score * 100).toFixed(0)}%</p>
                <div className="flex flex-wrap gap-2">
                  {sample ? <><span className="inline-flex min-h-11 items-center font-mono">{hit.capture.id}</span><span className="text-muted-foreground inline-flex min-h-11 items-center">Sample — links open real captures and custody logs.</span></>
                    : link.run_id ? <Link to="/research/runs/$runId" params={{ runId: link.run_id }} hash={`capture-${hit.capture.id}`} className="hover:bg-accent inline-flex min-h-11 items-center rounded-md border px-3">Open capture and custody</Link>
                    : link.item_id ? <><Link to="/items/$itemId" params={{ itemId: link.item_id }} className="hover:bg-accent inline-flex min-h-11 items-center rounded-md border px-3">Open evidence</Link>
                      {hit.case_id ? <Link to="/custody/$caseId" params={{ caseId: hit.case_id }} className="hover:bg-accent inline-flex min-h-11 items-center rounded-md border px-3">Custody log</Link> : null}</> : null}
                </div>
              </li>))}</ul>
          )}
        </Section>
      ) : null}

      {!sample && project ? (
        <Section id="srch-saved" title="Saved searches" hint="A saved search becomes a monitoring requirement only after the Curator approves it against the engagement's requirements register.">
          {(overview?.saved.length ?? 0) === 0 ? <p className="text-muted-foreground text-sm">None saved.</p> : (
            <ul className="grid gap-2">{overview!.saved.map((s) => (
              <li key={s.id} className="bg-muted grid gap-2 rounded-md p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2"><span className="font-medium">{s.name}</span>
                  {s.promotion ? <Chip><Dot c={PROMO[s.promotion]![1]} />{PROMO[s.promotion]![0]}{s.requirement ? ` · ${s.requirement}` : ""}</Chip> : <Chip><Dot c="bg-muted-foreground" />Not a requirement</Chip>}</div>
                <p className="text-muted-foreground">{s.mode} · {s.query ?? "(no text)"} · {formatDateTime(s.at)}</p>
                <div className="flex flex-wrap gap-2">
                  {!s.promotion || s.promotion === "declined" ? <RequestButton saved={s.id} /> : null}
                  {s.promotion === "requested" && overview!.is_curator ? <DecideDialog saved={s} requirements={overview!.requirements} /> : null}
                </div>
              </li>))}</ul>
          )}
        </Section>
      ) : null}
    </>
  );
}

function useRpc(onDone: () => void) {
  const qc = useQueryClient();
  const [err, setErr] = useState<string | null>(null);
  const m = useMutation({
    mutationFn: async (f: () => PromiseLike<{ error: { message: string } | null }>) => { const r = await f(); if (r.error) throw new Error(r.error.message); },
    onMutate: () => setErr(null), onError: (e) => setErr(errText(e)),
    onSuccess: async () => { await qc.invalidateQueries({ queryKey: ["srch-overview"] }); onDone(); },
  });
  return { m, err };
}

function TypesDialog({ current }: { current: SearchKind[] }) {
  const [open, setOpen] = useState(false);
  const [v, setV] = useState<SearchKind[]>(current);
  const { m, err } = useRpc(() => setOpen(false));
  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (o) setV(current); }}>
      <DialogTrigger asChild><Button variant="outline" className="mt-3 h-11">Choose content types</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Content types to index</DialogTitle><DialogDescription>DarkNight indexes only what is chosen here. Every change is logged.</DialogDescription></DialogHeader>
        <form className="grid gap-2" onSubmit={(e) => { e.preventDefault(); m.mutate(() => supabase.rpc("srch_set_content_types", { _types: v })); }}>
          {CONTENT_TYPES.map((c) => <label key={c.key} className="flex min-h-11 items-center gap-3"><input type="checkbox" className="size-5" checked={v.includes(c.key)} onChange={(e) => setV(e.target.checked ? [...v, c.key] : v.filter((x) => x !== c.key))} />{c.label}</label>)}
          <Refuse t={err} />
          <DialogFooter><Button type="submit" className="h-11" disabled={m.isPending}>Save</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function SaveDialog({ project, mode, query, filters, onSaved }: { project: string; mode: SearchMode; query: string; filters: SearchFilters; onSaved: () => void }) {
  const [open, setOpen] = useState(false); const [name, setName] = useState("");
  const { m, err } = useRpc(() => { setOpen(false); onSaved(); toast.success("Search saved"); });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button type="button" variant="outline" className="h-11">Save this search</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Save search</DialogTitle><DialogDescription>Only your search words and filters are saved, not the results.</DialogDescription></DialogHeader>
        <form className="grid gap-3" onSubmit={(e) => { e.preventDefault(); m.mutate(() => supabase.rpc("srch_save", { _project: project, _name: name, _mode: mode, _query: query, _filters: filters as never })); }}>
          <div className="grid gap-1"><Label htmlFor="srch-name">Name</Label><Input id="srch-name" className="h-11" maxLength={120} value={name} onChange={(e) => setName(e.target.value)} /></div>
          <Refuse t={err} />
          <DialogFooter><Button type="submit" className="h-11" disabled={m.isPending}>Save</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RequestButton({ saved }: { saved: string }) {
  const { m, err } = useRpc(() => toast.success("Sent to the Curator"));
  return <div><Button variant="outline" className="h-11" disabled={m.isPending} onClick={() => m.mutate(() => supabase.rpc("srch_request_promotion", { _saved: saved }))}>{m.isPending ? "Sending…" : "Ask Curator to make this a monitoring requirement"}</Button><Refuse t={err} /></div>;
}

function DecideDialog({ saved, requirements }: { saved: Saved; requirements: { id: string; code: string }[] }) {
  const [open, setOpen] = useState(false); const [approve, setApprove] = useState(true);
  const [req, setReq] = useState(""); const [reason, setReason] = useState("");
  const { m, err } = useRpc(() => setOpen(false));
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button className="h-11">Curator decision</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Make "{saved.name}" a monitoring requirement?</DialogTitle><DialogDescription>Approval links the search to an active requirement in this engagement's register. The decision is permanent.</DialogDescription></DialogHeader>
        <form className="grid gap-3" onSubmit={(e) => { e.preventDefault(); m.mutate(() => supabase.rpc("srch_decide_promotion", { _saved: saved.id, _approve: approve, _requirement: (req || null) as string, _reason: reason })); }}>
          <fieldset className="flex flex-wrap gap-4"><legend className="sr-only">Decision</legend>
            <label className="flex min-h-11 items-center gap-2"><input type="radio" checked={approve} onChange={() => setApprove(true)} />Approve</label>
            <label className="flex min-h-11 items-center gap-2"><input type="radio" checked={!approve} onChange={() => setApprove(false)} />Decline</label>
          </fieldset>
          {approve ? <div className="grid gap-1"><Label htmlFor="srch-req">Requirement</Label><select id="srch-req" className={sel} value={req} onChange={(e) => setReq(e.target.value)}><option value="">Choose…</option>{requirements.map((r) => <option key={r.id} value={r.id}>{r.code}</option>)}</select></div> : null}
          <div className="grid gap-1"><Label htmlFor="srch-reason">Reason{approve ? " (optional)" : ""}</Label><Textarea id="srch-reason" value={reason} onChange={(e) => setReason(e.target.value)} /></div>
          <Refuse t={err} />
          <DialogFooter><Button type="submit" className="h-11" disabled={m.isPending}>{m.isPending ? "Saving…" : "Record decision"}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
