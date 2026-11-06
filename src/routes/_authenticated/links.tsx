import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/AppShell";
import { Chip, Section } from "@/components/engagement/ui";
import { GraphCanvas } from "@/components/links/GraphCanvas";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { hubHead } from "@/lib/hub";
import { formatDateTime } from "@/lib/format";
import { fetchGraph, fetchNeighbours, sampleGateway, type GraphResult } from "@/lib/link-gateway";
import { bursts, clusters, degreeCentrality, ENTITY_LABEL, filterByTime, LINK_LABEL, onlyEvidencedLinks, type Graph, type MergeSuggestion } from "@/lib/link-graph";
import { THRESHOLD_NOT_SET } from "@/lib/early-warning";

export const Route = createFileRoute("/_authenticated/links")({
  validateSearch: (r: Record<string, unknown>): { preview?: "sample" | undefined } => ({ preview: r["preview"] === "sample" ? "sample" : undefined }),
  head: () => hubHead("Link analysis", "Graph of accounts, groups and narratives built on preserved evidence in FA Portal."),
  component: Links,
});

type Overview = {
  can_edit_settings: boolean; standard_version_id: string | null;
  thresholds: { burst_min_accounts: number | null; burst_window_minutes: number | null };
  merges: { a: string; b: string; decision: "confirmed" | "rejected"; reason: string; at: string }[];
  released: { graph_ref: string; output_id: string; sha256: string; at: string }[];
};
const errText = (e: unknown) => (e && typeof e === "object" && "message" in e ? String((e as { message: unknown }).message) : String(e));
const sel = "border-input bg-background min-h-11 w-full rounded-md border px-3 text-sm";
const Refuse = ({ t }: { t: string | null }) => (t ? <p role="alert" className="bg-failed text-failed-foreground rounded-md px-3 py-2 text-sm">{t}</p> : null);

function merge(a: Graph, b: Graph): Graph {
  const n = new Map(a.nodes.map((x) => [x.id, x])); b.nodes.forEach((x) => n.set(x.id, x));
  const e = new Map(a.edges.map((x) => [x.id, x])); b.edges.forEach((x) => e.set(x.id, x));
  return { standard_version: a.standard_version, nodes: [...n.values()], edges: [...e.values()], suggestions: [...a.suggestions, ...b.suggestions] };
}

async function homeGateway(): Promise<{ url: string | null; token: string | null }> {
  const { data } = await supabase.from("sources").select("gateway_url,enabled").eq("kind", "home_vault").eq("enabled", true).limit(1).maybeSingle();
  const { data: { session } } = await supabase.auth.getSession();
  return { url: data?.gateway_url ?? null, token: session?.access_token ?? null };
}

function Links() {
  const { preview } = Route.useSearch();
  const sample = preview === "sample";
  const [project, setProject] = useState("");
  const [from, setFrom] = useState(""); const [to, setTo] = useState("");
  const [extra, setExtra] = useState<Graph | null>(null);
  const [picked, setPicked] = useState<{ kind: "node" | "edge"; id: string } | null>(null);
  const [expandMsg, setExpandMsg] = useState<string | null>(null);

  const projects = useQuery({ queryKey: ["lnk-projects"], enabled: !sample, queryFn: async () => { const { data, error } = await supabase.from("projects").select("id,name").order("name"); if (error) throw error; return data; } });
  const ov = useQuery({
    queryKey: ["lnk-overview", project], enabled: !sample,
    queryFn: async () => { const { data, error } = await supabase.rpc("lnk_overview", { _project: (project || null) as string }); if (error) throw error; return data as unknown as Overview; },
  });
  const overview: Overview | undefined = sample ? { can_edit_settings: false, standard_version_id: null, thresholds: { burst_min_accounts: null, burst_window_minutes: null }, merges: [], released: [] } : ov.data;

  const gq = useQuery({
    queryKey: ["lnk-graph", sample, project], enabled: sample || !!project, retry: false,
    queryFn: async (): Promise<GraphResult> => {
      setExtra(null); setPicked(null);
      if (sample) return sampleGateway.graph();
      const gw = await homeGateway();
      return fetchGraph(gw.url, project, gw.token ?? "");
    },
  });
  const base = gq.data?.ok ? gq.data.graph : null;
  const { graph, dropped } = useMemo(() => {
    if (!base) return { graph: null, dropped: 0 };
    const r = onlyEvidencedLinks(extra ? merge(base, extra) : base);
    return { graph: filterByTime(r.graph, from || undefined, to || undefined), dropped: r.dropped };
  }, [base, extra, from, to]);

  const expand = async (id: string) => {
    setExpandMsg(null);
    let r: GraphResult;
    if (sample) r = sampleGateway.neighbours(id);
    else { const gw = await homeGateway(); r = await fetchNeighbours(gw.url, project, id, gw.token ?? ""); }
    if (!r.ok) return setExpandMsg(r.message);
    if (!r.graph.nodes.length) return setExpandMsg("No further connections.");
    setExtra((x) => (x ? merge(x, r.graph) : r.graph));
  };

  const central = graph ? degreeCentrality(graph).slice(0, 5) : [];
  const groups = graph ? clusters(graph) : [];
  const t = overview?.thresholds;
  const bs = graph ? bursts(graph, t?.burst_min_accounts, t?.burst_window_minutes) : null;
  const label = (id: string) => graph?.nodes.find((n) => n.id === id)?.label ?? id;
  const edge = picked?.kind === "edge" ? graph?.edges.find((e) => e.id === picked.id) : undefined;
  const node = picked?.kind === "node" ? graph?.nodes.find((n) => n.id === picked.id) : undefined;

  return (
    <>
      <PageHeader kicker="06 · Analyse" title="Link analysis" subtitle="How accounts, groups and narratives connect. Graph data is read live from DarkNight and never stored in the cloud. Every link cites the captures that prove it." />
      {sample ? <p className="bg-warn text-warn-foreground mb-4 rounded-md px-3 py-2 text-sm">Sample — fake gateway with demonstration data. Nothing here is real or saved.</p> : null}
      {ov.error ? <Refuse t={errText(ov.error)} /> : null}
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        {!sample ? (
          <div className="grid gap-1"><Label htmlFor="lnk-p">Engagement</Label>
            <select id="lnk-p" className={sel} value={project} onChange={(e) => setProject(e.target.value)}><option value="">Choose…</option>{projects.data?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
        ) : <div className="grid gap-1"><Label>Engagement</Label><p className="flex min-h-11 items-center text-sm">Sample engagement</p></div>}
        <div className="grid gap-1"><Label htmlFor="lnk-from">From</Label><Input id="lnk-from" type="date" className="h-11" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
        <div className="grid gap-1"><Label htmlFor="lnk-to">To</Label><Input id="lnk-to" type="date" className="h-11" value={to} onChange={(e) => setTo(e.target.value)} /></div>
      </div>

      {!sample && !project ? <p className="text-muted-foreground text-sm">Choose an engagement to load its graph from DarkNight.</p> : null}
      {gq.isFetching ? <p className="text-muted-foreground text-sm">Loading from DarkNight…</p> : null}
      {gq.data && !gq.data.ok ? <p role="alert" className="bg-warn text-warn-foreground rounded-md px-3 py-2 text-sm">{gq.data.message}</p> : null}

      {graph ? (
        <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
          <div className="grid gap-3">
            <GraphCanvas graph={graph} onNode={(id) => setPicked({ kind: "node", id })} onEdge={(id) => setPicked({ kind: "edge", id })} />
            <p className="text-muted-foreground text-sm">Standard version: {graph.standard_version ?? "not stated by the gateway"}{dropped ? ` · ${dropped} link(s) hidden because they cite no evidence` : ""}</p>
            <Section id="lnk-list" title="Entities and links">
              <div className="grid gap-4 sm:grid-cols-2">
                <ul className="grid gap-1">{graph.nodes.map((n) => <li key={n.id}><button type="button" className="hover:bg-accent min-h-11 w-full rounded-md px-2 text-left text-sm" onClick={() => setPicked({ kind: "node", id: n.id })}>{ENTITY_LABEL[n.type]} · {n.label}</button></li>)}</ul>
                <ul className="grid gap-1">{graph.edges.map((e) => <li key={e.id}><button type="button" className="hover:bg-accent min-h-11 w-full rounded-md px-2 text-left text-sm" onClick={() => setPicked({ kind: "edge", id: e.id })}>{label(e.source)} → {LINK_LABEL[e.type]} → {label(e.target)}</button></li>)}</ul>
              </div>
            </Section>
          </div>
          <div className="grid content-start gap-4">
            <Section id="lnk-picked" title="Selected">
              {!picked ? <p className="text-muted-foreground text-sm">Select an entity or a link.</p> : null}
              {node ? (<div className="grid gap-2 text-sm"><p><strong>{node.label}</strong> · {ENTITY_LABEL[node.type]}</p><p className="font-mono">{node.id}</p><Button className="h-11" onClick={() => expand(node.id)}>Expand connections</Button>{expandMsg ? <p role="status">{expandMsg}</p> : null}</div>) : null}
              {edge ? (<div className="grid gap-2 text-sm"><p>{label(edge.source)} → <strong>{LINK_LABEL[edge.type]}</strong> → {label(edge.target)}</p><p>{formatDateTime(edge.at)}</p>
                <p className="font-medium">Evidence behind this link</p><ul className="grid gap-1">{edge.captures.map((c) => <li key={c} className="bg-muted rounded px-2 py-1 font-mono break-all">{c}</li>)}</ul></div>) : null}
            </Section>
            <Section id="lnk-measures" title="Measures">
              <p className="text-sm font-medium">Most connected</p>
              <ol className="mb-3 grid gap-0.5 text-sm">{central.map((c) => <li key={c.id}>{label(c.id)} — {c.degree} links ({(c.centrality * 100).toFixed(0)}%)</li>)}</ol>
              <p className="text-sm font-medium">Clusters</p>
              <p className="mb-3 text-sm">{groups.length} cluster(s); largest has {groups[0]?.length ?? 0} entities.</p>
              <p className="text-sm font-medium">Coordinated posting bursts</p>
              {bs === null ? <p className="text-sm"><Chip><span aria-hidden className="bg-muted-foreground size-2 rounded-full" />{THRESHOLD_NOT_SET}</Chip> No bursts are flagged until the coordination threshold is set.</p>
                : bs.length === 0 ? <p className="text-sm">None found.</p>
                : <ul className="grid gap-2 text-sm">{bs.map((b, i) => <li key={i} className="bg-muted rounded p-2">{b.accounts.length} accounts into {label(b.target)} · {formatDateTime(b.start)}–{formatDateTime(b.end)}
                    {!sample ? <SendToEarlyWarning project={project} accounts={b.accounts.length} captures={b.captures} /> : null}</li>)}</ul>}
              <p className="text-muted-foreground mt-2 text-sm">Burst rule: {t?.burst_min_accounts && t?.burst_window_minutes ? `${t.burst_min_accounts} or more accounts within ${t.burst_window_minutes} minutes` : THRESHOLD_NOT_SET}.</p>
              {overview?.can_edit_settings ? <CoordinationThresholds current={t!} /> : null}
            </Section>
            <Section id="lnk-merges" title="Same-actor suggestions" hint="The platform suggests; an analyst confirms or rejects. Decisions are logged.">
              {graph.suggestions.length === 0 ? <p className="text-muted-foreground text-sm">No suggestions.</p> : (
                <ul className="grid gap-2 text-sm">{graph.suggestions.map((s) => {
                  const done = overview?.merges.find((m) => (m.a === s.a && m.b === s.b) || (m.a === s.b && m.b === s.a));
                  return <li key={s.id} className="bg-muted rounded p-2"><p>{label(s.a)} ↔ {label(s.b)} · {(s.score * 100).toFixed(0)}%</p><p className="text-muted-foreground">{s.basis}</p>
                    {done ? <Chip tone={done.decision === "confirmed" ? "bg-done text-done-foreground" : undefined}><span aria-hidden className={done.decision === "confirmed" ? "bg-positive size-2 rounded-full" : "bg-muted-foreground size-2 rounded-full"} />{done.decision === "confirmed" ? "Confirmed" : "Rejected"}</Chip>
                      : <MergeDialog s={s} project={project} sample={sample} />}</li>;
                })}</ul>
              )}
            </Section>
            <Section id="lnk-released" title="Graphs released in reports" hint="Clients see only these.">
              {(overview?.released.length ?? 0) === 0 ? <p className="text-muted-foreground text-sm">None released.</p> : <ul className="grid gap-1 text-sm">{overview!.released.map((r) => <li key={r.graph_ref + r.output_id}><span className="font-mono">{r.graph_ref}</span> · {formatDateTime(r.at)}</li>)}</ul>}
              {!sample && project ? <ReleaseDialog project={project} /> : null}
            </Section>
          </div>
        </div>
      ) : null}
    </>
  );
}

function useRpc(onDone: () => void) {
  const qc = useQueryClient();
  const [err, setErr] = useState<string | null>(null);
  const m = useMutation({
    mutationFn: async (f: () => PromiseLike<{ error: { message: string } | null }>) => { const { error } = await f(); if (error) throw new Error(error.message); },
    onMutate: () => setErr(null), onError: (e) => setErr(errText(e)),
    onSuccess: async () => { await qc.invalidateQueries({ queryKey: ["lnk-overview"] }); onDone(); },
  });
  return { m, err };
}

function MergeDialog({ s, project, sample }: { s: MergeSuggestion; project: string; sample: boolean }) {
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState(true); const [reason, setReason] = useState("");
  const { m, err } = useRpc(() => { setOpen(false); toast.success("Decision logged"); });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button className="mt-2 h-11">Confirm or reject</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Same actor?</DialogTitle><DialogDescription>Only the two identifiers and your decision are stored. The decision is logged permanently.</DialogDescription></DialogHeader>
        <form className="grid gap-3" onSubmit={(e) => { e.preventDefault(); if (sample) { setOpen(false); toast("Sample mode: nothing is saved."); return; } m.mutate(() => supabase.rpc("lnk_decide_merge", { _project: project, _a: s.a, _b: s.b, _confirm: confirm, _reason: reason, _suggestion: s.id })); }}>
          <p className="font-mono text-sm">{s.a} ↔ {s.b}</p>
          <fieldset className="flex gap-4"><legend className="sr-only">Decision</legend>
            <label className="flex min-h-11 items-center gap-2"><input type="radio" checked={confirm} onChange={() => setConfirm(true)} />Confirm same actor</label>
            <label className="flex min-h-11 items-center gap-2"><input type="radio" checked={!confirm} onChange={() => setConfirm(false)} />Reject</label>
          </fieldset>
          <div className="grid gap-1"><Label htmlFor="lnk-reason">Reason</Label><Textarea id="lnk-reason" value={reason} onChange={(e) => setReason(e.target.value)} /></div>
          <Refuse t={err} />
          <DialogFooter><Button type="submit" className="h-11" disabled={m.isPending}>{m.isPending ? "Saving…" : "Record decision"}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ReleaseDialog({ project }: { project: string }) {
  const [open, setOpen] = useState(false);
  const outputs = useQuery({ queryKey: ["lnk-outputs", project], enabled: open, queryFn: async () => { const { data, error } = await supabase.from("project_outputs").select("id,title,status").eq("project_id", project).eq("status", "released"); if (error) throw error; return data; } });
  const [f, setF] = useState({ output: "", ref: "", sha: "" });
  const { m, err } = useRpc(() => setOpen(false));
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button variant="outline" className="mt-2 h-11">Attach graph to released report</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Release a graph in a report</DialogTitle><DialogDescription>Only the graph reference and its SHA-256 are stored; the graph stays on DarkNight.</DialogDescription></DialogHeader>
        <form className="grid gap-3" onSubmit={(e) => { e.preventDefault(); m.mutate(() => supabase.rpc("lnk_release_graph", { _project: project, _output: f.output, _graph: f.ref, _sha256: f.sha })); }}>
          <div className="grid gap-1"><Label htmlFor="lnk-o">Released report</Label><select id="lnk-o" className={sel} value={f.output} onChange={(e) => setF({ ...f, output: e.target.value })}><option value="">Choose…</option>{outputs.data?.map((o) => <option key={o.id} value={o.id}>{o.title}</option>)}</select></div>
          <div className="grid gap-1"><Label htmlFor="lnk-r">Graph reference</Label><Input id="lnk-r" className="h-11 font-mono" value={f.ref} onChange={(e) => setF({ ...f, ref: e.target.value })} /></div>
          <div className="grid gap-1"><Label htmlFor="lnk-h">Graph snapshot SHA-256</Label><Input id="lnk-h" className="h-11 font-mono" value={f.sha} onChange={(e) => setF({ ...f, sha: e.target.value })} /></div>
          <Refuse t={err} />
          <DialogFooter><Button type="submit" className="h-11" disabled={m.isPending}>Release graph</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function CoordinationThresholds({ current }: { current: Overview["thresholds"] }) {
  const [open, setOpen] = useState(false);
  const [a, setA] = useState(current.burst_min_accounts?.toString() ?? ""); const [w, setW] = useState(current.burst_window_minutes?.toString() ?? "");
  const { m, err } = useRpc(() => setOpen(false));
  const num = (v: string) => (v.trim() === "" ? null : Number(v)) as number;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button variant="outline" className="mt-2 h-11">Set coordination threshold</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Coordination threshold</DialogTitle><DialogDescription>Leave empty for Threshold not set. Every change is logged.</DialogDescription></DialogHeader>
        <form className="grid gap-3" onSubmit={(e) => { e.preventDefault(); m.mutate(async () => { const r = await supabase.rpc("lnk_set_threshold", { _key: "burst_min_accounts", _value: num(a) }); return r.error ? r : supabase.rpc("lnk_set_threshold", { _key: "burst_window_minutes", _value: num(w) }); }); }}>
          <div className="grid gap-1"><Label htmlFor="lnk-ta">Minimum accounts</Label><Input id="lnk-ta" className="h-11" inputMode="numeric" value={a} onChange={(e) => setA(e.target.value)} /></div>
          <div className="grid gap-1"><Label htmlFor="lnk-tw">Within minutes</Label><Input id="lnk-tw" className="h-11" inputMode="numeric" value={w} onChange={(e) => setW(e.target.value)} /></div>
          <Refuse t={err} />
          <DialogFooter><Button type="submit" className="h-11" disabled={m.isPending}>Save</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function SendToEarlyWarning({ project, accounts, captures }: { project: string; accounts: number; captures: string[] }) {
  const [err, setErr] = useState<string | null>(null);
  const send = async () => {
    setErr(null);
    const { data, error } = await supabase.rpc("ew_record_signal", { _project: project, _signal: "coordinated_posting", _score: accounts, _framework: "DSP", _captures: captures, _note: "From link analysis burst" });
    if (error) return setErr(error.message);
    toast((data as { outcome: string }).outcome === "alert" ? "Alert raised for analysts." : "Signal recorded in Early warning.");
  };
  return <div className="mt-1"><Button variant="outline" className="h-11" onClick={send}>Send to Early warning</Button><Refuse t={err} /></div>;
}
