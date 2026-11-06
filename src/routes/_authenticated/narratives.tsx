import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/AppShell";
import { Chip, Section } from "@/components/engagement/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { hubHead } from "@/lib/hub";
import { formatDateTime } from "@/lib/format";
import { THRESHOLD_NOT_SET } from "@/lib/early-warning";
import { errText, homeGateway } from "@/lib/home-gateway";
import { COORD_KIND_LABEL, eligible, fetchNarratives, formatWindow, onlyCited, sampleNarrativeGateway, type CoordinationFinding, type NarrativeCluster, type NarrativeResult } from "@/lib/narrative-gateway";

export const Route = createFileRoute("/_authenticated/narratives")({
  validateSearch: (r: Record<string, unknown>): { preview?: "sample" | undefined } => ({ preview: r["preview"] === "sample" ? "sample" : undefined }),
  head: () => hubHead("Narratives and coordination", "Narrative clusters and coordinated behaviour, confirmed by analysts, in FA Portal."),
  component: Narratives,
});

type Thresholds = { similarity_min: number | null; cluster_window_minutes: number | null; coord_min_accounts: number | null; coord_window_minutes: number | null; new_account_min: number | null };
type Overview = {
  can_edit_settings: boolean; standard_version_id: string | null; thresholds: Thresholds;
  narratives: { cluster_ref: string; decision: string; name: string | null; myths: string[]; scenarios: string[]; at: string }[];
  coordination: { finding_ref: string; kind: string; decision: string; accounts: string[]; at: string }[];
};
const EMPTY_T: Thresholds = { similarity_min: null, cluster_window_minutes: null, coord_min_accounts: null, coord_window_minutes: null, new_account_min: null };
const sel = "border-input bg-background min-h-11 w-full rounded-md border px-3 text-sm";
const Refuse = ({ t }: { t: string | null }) => (t ? <p role="alert" className="bg-failed text-failed-foreground rounded-md px-3 py-2 text-sm">{t}</p> : null);
const Dot = ({ c }: { c: string }) => <span aria-hidden className={`${c} size-2 rounded-full`} />;
const NotSet = () => <Chip><Dot c="bg-muted-foreground" />{THRESHOLD_NOT_SET}</Chip>;
const uuidRe = /^[0-9a-f-]{36}$/i;

function Narratives() {
  const { preview } = Route.useSearch();
  const sample = preview === "sample";
  const [project, setProject] = useState("");
  const projects = useQuery({ queryKey: ["nar-projects"], enabled: !sample, queryFn: async () => { const { data, error } = await supabase.from("projects").select("id,name").order("name"); if (error) throw error; return data; } });
  const ov = useQuery({ queryKey: ["nar-overview", project], enabled: !sample, queryFn: async () => { const { data, error } = await supabase.rpc("nar_overview", { _project: (project || null) as string }); if (error) throw error; return data as unknown as Overview; } });
  const overview: Overview | undefined = sample ? { can_edit_settings: false, standard_version_id: null, thresholds: EMPTY_T, narratives: [], coordination: [] } : ov.data;
  const t = overview?.thresholds ?? EMPTY_T;
  const dq = useQuery({
    queryKey: ["nar-data", sample, project], enabled: sample || !!project, retry: false,
    queryFn: async (): Promise<NarrativeResult> => { if (sample) return sampleNarrativeGateway.load(); const gw = await homeGateway(); return fetchNarratives(gw.url, project, gw.token); },
  });
  const data = dq.data?.ok ? dq.data.data : null;
  const clusters = data ? onlyCited(data.clusters) : [];
  const coord = data ? onlyCited(data.coordination) : [];
  const clusterSet = t.similarity_min != null && t.cluster_window_minutes != null;

  return (
    <>
      <PageHeader kicker="06 · Analyse" title="Narratives and coordination" subtitle="Posts grouped into narratives and accounts acting together. Results are worked out on DarkNight and read live; nothing is labelled until an analyst confirms it." />
      {sample ? <p className="bg-warn text-warn-foreground mb-4 rounded-md px-3 py-2 text-sm">Sample — fake gateway with demonstration data. Nothing here is real or saved.</p> : null}
      {ov.error ? <Refuse t={errText(ov.error)} /> : null}
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        {!sample ? (
          <div className="grid gap-1"><Label htmlFor="nar-p">Engagement</Label>
            <select id="nar-p" className={sel} value={project} onChange={(e) => setProject(e.target.value)}><option value="">Choose…</option>{projects.data?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
        ) : <div className="grid gap-1"><Label>Engagement</Label><p className="flex min-h-11 items-center text-sm">Sample engagement</p></div>}
      </div>

      <Section id="nar-thresholds" title="Thresholds" hint="Nothing is labelled or sent to Early warning while a threshold is not set.">
        <dl className="grid gap-2 text-sm sm:grid-cols-2">
          {([["Similarity (1–20, 5% steps)", t.similarity_min, (v: number) => `${v} · ${v * 5}%`], ["Narrative time window", t.cluster_window_minutes, formatWindow],
            ["Coordination: minimum accounts", t.coord_min_accounts, String], ["Coordination time window", t.coord_window_minutes, formatWindow], ["New-account burst: minimum accounts", t.new_account_min, String]] as const).map(([l, v, f]) => (
            <div key={l} className="flex min-h-11 items-center justify-between gap-2 rounded-md border px-3"><dt>{l}</dt><dd>{v == null ? <NotSet /> : <span className="font-mono">{f(v)}</span>}</dd></div>
          ))}
        </dl>
        {overview?.can_edit_settings ? <ThresholdDialog current={t} /> : null}
      </Section>

      {!sample && !project ? <p className="text-muted-foreground mt-4 text-sm">Choose an engagement to load its narratives from DarkNight.</p> : null}
      {dq.isFetching ? <p className="text-muted-foreground mt-4 text-sm">Loading from DarkNight…</p> : null}
      {dq.data && !dq.data.ok ? <p role="alert" className="bg-warn text-warn-foreground mt-4 rounded-md px-3 py-2 text-sm">{dq.data.message}</p> : null}

      {data ? (
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <Section id="nar-clusters" title="Narrative clusters" hint={`Model: ${data.model ?? "not stated"} · Standard version: ${data.standard_version ?? "not stated"}`}>
            {clusters.length === 0 ? <p className="text-muted-foreground text-sm">No clusters.</p> : (
              <ul className="grid gap-3">{clusters.map((c) => {
                const done = overview?.narratives.find((n) => n.cluster_ref === c.id);
                return <li key={c.id} className="bg-muted grid gap-2 rounded-md p-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2"><span className="font-mono">{c.id}</span>
                    {done ? <Chip tone={done.decision === "confirmed" ? "bg-done text-done-foreground" : undefined}><Dot c={done.decision === "confirmed" ? "bg-positive" : "bg-muted-foreground"} />{done.decision === "confirmed" ? `Narrative: ${done.name}` : "Rejected"}</Chip>
                      : <Chip><Dot c="bg-warn" />Awaiting analyst</Chip>}</div>
                  <p>{c.summary}</p>
                  <p className="text-muted-foreground">Languages: {c.languages.join(", ")} · Similarity {(c.similarity * 100).toFixed(0)}%</p>
                  <table className="w-full text-left"><thead><tr><th>Day</th><th>Volume</th><th>Platforms</th><th>New accounts</th></tr></thead>
                    <tbody>{c.timeline.map((d) => <tr key={d.day}><td>{d.day}</td><td>{d.volume}</td><td>{d.platforms.join(", ")}</td><td>{d.new_accounts}</td></tr>)}</tbody></table>
                  <p className="font-medium">Evidence</p><p className="font-mono break-all">{c.captures.join(", ")}</p>
                  {!done ? (clusterSet || sample ? <ClusterDialog c={c} project={project} sample={sample} /> : <p className="text-sm"><NotSet /> Clusters cannot be confirmed yet.</p>) : null}
                </li>;
              })}</ul>
            )}
          </Section>
          <Section id="nar-coord" title="Coordination findings" hint="Suggested by DarkNight. Only an analyst can label accounts as coordinated; confirmed findings go to the link graph and Early warning.">
            {coord.length === 0 ? <p className="text-muted-foreground text-sm">No findings.</p> : (
              <ul className="grid gap-3">{coord.map((f) => {
                const done = overview?.coordination.find((n) => n.finding_ref === f.id);
                const el = eligible(f, t);
                return <li key={f.id} className="bg-muted grid gap-2 rounded-md p-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2"><span className="font-medium">{COORD_KIND_LABEL[f.kind]}</span>
                    {done ? <Chip tone={done.decision === "confirmed" ? "bg-done text-done-foreground" : undefined}><Dot c={done.decision === "confirmed" ? "bg-positive" : "bg-muted-foreground"} />{done.decision === "confirmed" ? "Coordinated (analyst confirmed)" : "Rejected"}</Chip>
                      : el === null ? <NotSet /> : el ? <Chip><Dot c="bg-warn" />Meets threshold · awaiting analyst</Chip> : <Chip><Dot c="bg-muted-foreground" />Below threshold</Chip>}</div>
                  <p>{f.basis}</p>
                  <p>{f.accounts.length} accounts · {formatDateTime(f.window_start)} – {formatDateTime(f.window_end)}</p>
                  <p className="font-mono break-all">{f.accounts.join(", ")}</p>
                  <p className="font-medium">Evidence</p><p className="font-mono break-all">{f.captures.join(", ")}</p>
                  {!done && el ? <CoordDialog f={f} project={project} sample={sample} /> : null}
                </li>;
              })}</ul>
            )}
          </Section>
        </div>
      ) : null}
    </>
  );
}

function useRpc(onDone: (d: unknown) => void) {
  const qc = useQueryClient();
  const [err, setErr] = useState<string | null>(null);
  const m = useMutation({
    mutationFn: async (f: () => PromiseLike<{ data?: unknown; error: { message: string } | null }>) => { const r = await f(); if (r.error) throw new Error(r.error.message); return r.data; },
    onMutate: () => setErr(null), onError: (e) => setErr(errText(e)),
    onSuccess: async (d) => { await qc.invalidateQueries({ queryKey: ["nar-overview"] }); onDone(d); },
  });
  return { m, err };
}

const splitIds = (s: string) => s.split(/[\s,]+/).map((x) => x.trim()).filter(Boolean);

function ClusterDialog({ c, project, sample }: { c: NarrativeCluster; project: string; sample: boolean }) {
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState(true);
  const [f, setF] = useState({ name: "", myths: "", scenarios: "", reason: "" });
  const { m, err } = useRpc(() => { setOpen(false); toast.success("Decision logged"); });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button className="h-11 justify-self-start">Name and confirm</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Narrative decision</DialogTitle><DialogDescription>Stored: the cluster identifier, your name for it, the myth and scenario identifiers from the universal standard, the cited captures and your reason. The decision is permanent.</DialogDescription></DialogHeader>
        <form className="grid gap-3" onSubmit={(e) => { e.preventDefault(); if (sample) { setOpen(false); toast("Sample mode: nothing is saved."); return; }
          m.mutate(() => supabase.rpc("nar_decide_cluster", { _project: project, _cluster: c.id, _confirm: confirm, _name: f.name, _myths: splitIds(f.myths), _scenarios: splitIds(f.scenarios), _captures: c.captures.filter((x) => uuidRe.test(x)), _reason: f.reason })); }}>
          <fieldset className="flex flex-wrap gap-4"><legend className="sr-only">Decision</legend>
            <label className="flex min-h-11 items-center gap-2"><input type="radio" checked={confirm} onChange={() => setConfirm(true)} />Confirm as a narrative</label>
            <label className="flex min-h-11 items-center gap-2"><input type="radio" checked={!confirm} onChange={() => setConfirm(false)} />Reject</label>
          </fieldset>
          {confirm ? <>
            <div className="grid gap-1"><Label htmlFor="nar-name">Narrative name</Label><Input id="nar-name" className="h-11" maxLength={120} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
            <div className="grid gap-1"><Label htmlFor="nar-myths">Known myths (identifiers, comma separated)</Label><Input id="nar-myths" className="h-11 font-mono" value={f.myths} onChange={(e) => setF({ ...f, myths: e.target.value })} /></div>
            <div className="grid gap-1"><Label htmlFor="nar-scen">Scenarios (identifiers, comma separated)</Label><Input id="nar-scen" className="h-11 font-mono" value={f.scenarios} onChange={(e) => setF({ ...f, scenarios: e.target.value })} /></div>
          </> : null}
          <div className="grid gap-1"><Label htmlFor="nar-reason">Reason</Label><Textarea id="nar-reason" value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} /></div>
          <Refuse t={err} />
          <DialogFooter><Button type="submit" className="h-11" disabled={m.isPending}>{m.isPending ? "Saving…" : "Record decision"}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function CoordDialog({ f, project, sample }: { f: CoordinationFinding; project: string; sample: boolean }) {
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState(true); const [reason, setReason] = useState("");
  const { m, err } = useRpc((d) => { setOpen(false); const ew = (d as { early_warning?: string } | null)?.early_warning; toast.success(ew ? `Decision logged · Early warning: ${ew}` : "Decision logged"); });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button className="h-11 justify-self-start">Confirm or reject</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Are these accounts coordinated?</DialogTitle><DialogDescription>Only account identifiers, cited captures and your decision are stored. A confirmation is sent to the link graph and Early warning, and is logged permanently.</DialogDescription></DialogHeader>
        <form className="grid gap-3" onSubmit={(e) => { e.preventDefault(); if (sample) { setOpen(false); toast("Sample mode: nothing is saved."); return; }
          m.mutate(() => supabase.rpc("nar_decide_coordination", { _project: project, _finding: f.id, _kind: f.kind, _confirm: confirm, _accounts: f.accounts, _captures: f.captures.filter((x) => uuidRe.test(x)), _reason: reason })); }}>
          <p className="text-sm">{COORD_KIND_LABEL[f.kind]} · {f.accounts.length} accounts</p>
          <fieldset className="flex flex-wrap gap-4"><legend className="sr-only">Decision</legend>
            <label className="flex min-h-11 items-center gap-2"><input type="radio" checked={confirm} onChange={() => setConfirm(true)} />Confirm coordinated</label>
            <label className="flex min-h-11 items-center gap-2"><input type="radio" checked={!confirm} onChange={() => setConfirm(false)} />Reject</label>
          </fieldset>
          <div className="grid gap-1"><Label htmlFor="crd-reason">Reason</Label><Textarea id="crd-reason" value={reason} onChange={(e) => setReason(e.target.value)} /></div>
          <Refuse t={err} />
          <DialogFooter><Button type="submit" className="h-11" disabled={m.isPending}>{m.isPending ? "Saving…" : "Record decision"}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const WINDOW_STEPS = [1, 5, 10, 15, 30, 45, 60, 90, 120, 180, 240, 360, 480, 720, 960, 1440, 2160, 2880, 4320];

function ThresholdDialog({ current }: { current: Thresholds }) {
  const [open, setOpen] = useState(false);
  const [v, setV] = useState<Record<keyof Thresholds, number | null>>(current);
  const { m, err } = useRpc(() => setOpen(false));
  const rows: { k: keyof Thresholds; label: string; window: boolean }[] = [
    { k: "similarity_min", label: "Similarity (1–20, 5% steps)", window: false },
    { k: "cluster_window_minutes", label: "Narrative time window", window: true },
    { k: "coord_min_accounts", label: "Coordination: minimum accounts", window: false },
    { k: "coord_window_minutes", label: "Coordination time window", window: true },
    { k: "new_account_min", label: "New-account burst: minimum accounts", window: false },
  ];
  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (o) setV(current); }}>
      <DialogTrigger asChild><Button variant="outline" className="mt-3 h-11">Set thresholds</Button></DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Narrative and coordination thresholds</DialogTitle><DialogDescription>Counts run from 1 to 20. Time windows run from 1 minute to 72 hours. Clear a value for Threshold not set. Every change is logged.</DialogDescription></DialogHeader>
        <form className="grid gap-4" onSubmit={(e) => { e.preventDefault(); m.mutate(async () => { for (const r of rows) { if (v[r.k] === current[r.k]) continue; const x = await supabase.rpc("nar_set_threshold", { _key: r.k, _value: v[r.k] as number }); if (x.error) return x; } return { error: null }; }); }}>
          {rows.map((r) => {
            const val = v[r.k];
            const idx = r.window ? Math.max(0, WINDOW_STEPS.findIndex((s) => s >= (val ?? 1))) : null;
            return <div key={r.k} className="grid gap-2">
              <div className="flex items-center justify-between"><Label htmlFor={`nt-${r.k}`}>{r.label}</Label><span className="font-mono" aria-live="polite">{val == null ? "Not set" : r.window ? formatWindow(val) : val}</span></div>
              {r.window
                ? <Slider id={`nt-${r.k}`} min={0} max={WINDOW_STEPS.length - 1} step={1} value={[idx ?? 0]} onValueChange={([n]) => setV({ ...v, [r.k]: WINDOW_STEPS[n ?? 0]! })} aria-label={`${r.label}, 1 minute to 72 hours`} className="py-3" />
                : <Slider id={`nt-${r.k}`} min={1} max={20} step={1} value={[val ?? 1]} onValueChange={([n]) => setV({ ...v, [r.k]: n ?? 1 })} aria-label={`${r.label}, 1 to 20`} className="py-3" />}
              {val != null ? <Button type="button" variant="outline" className="h-11 justify-self-start" onClick={() => setV({ ...v, [r.k]: null })}>Clear (Threshold not set)</Button> : null}
            </div>;
          })}
          <Refuse t={err} />
          <DialogFooter><Button type="submit" className="h-11" disabled={m.isPending}>Save</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
