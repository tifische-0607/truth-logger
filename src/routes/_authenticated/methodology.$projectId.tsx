import { useMemo, useState, type ReactNode } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, CircleDashed, RotateCcw, XCircle } from "lucide-react";
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
import { useMe } from "@/lib/projects";
import { formatDateTime } from "@/lib/format";
import { CHECKPOINTS, CHECKPOINT_NAMES, CONFIDENCE, canSupport, defaultStatement, stepState, type CheckpointId, type StepState } from "@/lib/u6";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/methodology/$projectId")({
  head: () => hubHead("Methodology checkpoints", "U6 methodology checkpoints V1, V2, Q1, Q2, R and C for an FA Portal engagement."),
  component: Methodology,
});

const errText = (e: unknown) => (e && typeof e === "object" && "message" in e ? String((e as { message: unknown }).message) : String(e));
const sel = "border-input bg-background min-h-11 w-full rounded-md border px-3 text-sm";
const Refuse = ({ t }: { t: string | null }) => (t ? <p role="alert" className="bg-failed text-failed-foreground rounded-md px-3 py-2 text-sm">{t}</p> : null);
type Result = { subject_id: string; checkpoint: string; result: string; reason: string | null; checked_at: string; subject_kind: string };

function useData(projectId: string) {
  return useQuery({
    queryKey: ["u6", projectId],
    queryFn: async () => {
      const [proj, std, res, caps, ver, reqs, meas, neg, fin, fi, rev, outs, figs, stm, appr, conf] = await Promise.all([
        (supabase.from("projects").select("id, name").eq("id", projectId).maybeSingle()),
        (supabase.rpc("u6_standard")),
        (supabase.from("checkpoint_results").select("subject_id, checkpoint, result, reason, checked_at, subject_kind").eq("project_id", projectId).order("checked_at", { ascending: false })),
        (supabase.from("research_captures").select("id, item_ref, platform, item_type, sha256_at_capture, captured_at").eq("project_id", projectId).order("captured_at", { ascending: false }).limit(200)),
        (supabase.from("verification_records").select("*").eq("project_id", projectId).order("rated_at", { ascending: false })),
        (supabase.from("research_requirements").select("id, req_no, code, version, status, platform, window_from, window_to").eq("project_id", projectId).order("req_no").order("version", { ascending: false })),
        (supabase.from("collection_measures").select("*").eq("project_id", projectId)),
        (supabase.from("negative_results").select("*").eq("project_id", projectId)),
        (supabase.from("findings").select("*").eq("project_id", projectId).order("created_at", { ascending: false })),
        (supabase.from("finding_items").select("*").eq("project_id", projectId)),
        (supabase.from("finding_reviews").select("*").eq("project_id", projectId).order("decided_at", { ascending: false })),
        (supabase.from("project_outputs").select("id, title, kind, status").eq("project_id", projectId).order("created_at", { ascending: false })),
        (supabase.from("report_figures").select("*").eq("project_id", projectId)),
        (supabase.from("report_statements").select("*").eq("project_id", projectId).order("version", { ascending: false })),
        (supabase.from("report_statement_approvals").select("*").eq("project_id", projectId)),
        (supabase.from("conflict_declarations").select("*").eq("project_id", projectId).order("declared_at", { ascending: false })),
      ]);
      const err = [proj, std, res, caps, ver, reqs, meas, neg, fin, fi, rev, outs, figs, stm, appr, conf].find((x) => x.error)?.error;
      if (err) throw err;
      const results = (res.data ?? []) as Result[];
      const latest = new Map<string, Result>();
      for (const r of results) { const k = `${r.subject_id}:${r.checkpoint}`; if (!latest.has(k)) latest.set(k, r); }
      const verByCap = new Map<string, { confidence: string }>();
      for (const v of ver.data ?? []) if (!verByCap.has(v.capture_id)) verByCap.set(v.capture_id, v);
      const curReqs = Object.values(Object.fromEntries([...(reqs.data ?? [])].reverse().map((r) => [r.req_no, r]))).filter((r) => r.status === "active");
      return {
        project: proj.data, standard: std.data as { version_id: string; version: number; sample: boolean } | null,
        results, latest: (s: string, c: CheckpointId) => latest.get(`${s}:${c}`),
        captures: caps.data ?? [], verByCap, requirements: curReqs, measures: meas.data ?? [], negatives: neg.data ?? [],
        findings: fin.data ?? [], findingItems: fi.data ?? [], reviews: rev.data ?? [], outputs: outs.data ?? [],
        figures: figs.data ?? [], statements: stm.data ?? [], approvals: new Set((appr.data ?? []).map((a) => a.statement_id)), conflicts: conf.data ?? [],
      };
    },
  });
}
type D = NonNullable<ReturnType<typeof useData>["data"]>;

/** Runs one database action; shows the database's refusal verbatim; refreshes only after the database answers. */
function useAct(projectId: string) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (fn: () => PromiseLike<{ error: unknown; data?: unknown }>, ok?: string) => {
    setBusy(true); setError(null);
    const { error: e, data } = await fn();
    setBusy(false);
    await qc.invalidateQueries({ queryKey: ["u6", projectId] });
    if (e) { setError(errText(e)); return false; }
    const r = data as { result?: string; reason?: string } | null;
    if (r && r.result === "failed") { setError(r.reason ?? "The check did not pass"); return true; }
    if (ok) toast.success(ok);
    return true;
  };
  return { busy, error, run, setError };
}

function Methodology() {
  const { projectId } = Route.useParams();
  const d = useData(projectId);
  if (d.error) return <><PageHeader title="Methodology checkpoints" /><Refuse t={errText(d.error)} /></>;
  if (!d.data) return <p className="text-muted-foreground text-sm">Loading checkpoints…</p>;
  const D = d.data;
  return (
    <>
      <PageHeader kicker="02 · Projects · U6" title="Methodology checkpoints" subtitle={D.project?.name ?? "Engagement"}
        actions={<Link to="/projects/$projectId" params={{ projectId }} search={{ tab: "overview" }} className="bg-secondary text-secondary-foreground inline-flex min-h-11 items-center rounded-[10px] px-4 text-sm font-medium">Back to engagement</Link>} />
      <StandardNote D={D} />
      <CheckpointBar D={D} />
      <div className="grid gap-6">
        <ConflictSection D={D} projectId={projectId} />
        <MeasuresSection D={D} projectId={projectId} />
        <ItemsSection D={D} projectId={projectId} />
        <FindingsSection D={D} projectId={projectId} />
        <ReviewQueue D={D} projectId={projectId} />
        <ReportBuilder D={D} projectId={projectId} />
        <StaffSection projectId={projectId} />
      </div>
    </>
  );
}

function StandardNote({ D }: { D: D }) {
  if (!D.standard) return <p role="alert" className="bg-warn text-warn-foreground mb-4 rounded-md px-3 py-2 text-sm">No universal standard version exists, so the database will refuse every checkpoint.</p>;
  return (
    <p className="bg-muted mb-4 flex flex-wrap items-center gap-2 rounded-md px-3 py-2 text-sm">
      Universal standard version {D.standard.version} is recorded on every check.
      {D.standard.sample ? <Chip tone="bg-warn text-warn-foreground"><span className="bg-caution size-2 rounded-full" aria-hidden />Sample standard</Chip> : <Chip tone="bg-done text-done-foreground"><span className="bg-positive size-2 rounded-full" aria-hidden />Approved</Chip>}
    </p>
  );
}

const STEP: Record<StepState, { label: string; icon: ReactNode; tone: string }> = {
  passed: { label: "Passed", icon: <CheckCircle2 className="text-positive size-5" aria-hidden />, tone: "border-positive" },
  failed: { label: "Blocked", icon: <XCircle className="text-negative size-5" aria-hidden />, tone: "border-negative" },
  reopened: { label: "Reopened", icon: <RotateCcw className="text-caution size-5" aria-hidden />, tone: "border-caution" },
  waiting: { label: "Not yet passed", icon: <CircleDashed className="text-muted-foreground size-5" aria-hidden />, tone: "border-border" },
};

function CheckpointBar({ D }: { D: D }) {
  const out = D.outputs[0];
  const naming = D.findings.filter((f) => f.names_person_or_org);
  const subjects: Record<CheckpointId, string[]> = {
    V1: D.captures.map((c) => c.id), V2: D.captures.map((c) => c.id), Q1: [D.project?.id ?? ""],
    Q2: out ? [out.id] : [], R: naming.map((f) => f.id), C: out ? [out.id] : [],
  };
  return (
    <ol aria-label="Checkpoints" className="mb-6 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
      {CHECKPOINTS.map((cp) => {
        const latest = subjects[cp].map((s) => D.latest(s, cp));
        const st = stepState(latest.map((l) => l?.result), subjects[cp].length);
        const reason = latest.find((l) => l && l.result !== "passed")?.reason;
        const done = latest.filter((l) => l?.result === "passed").length;
        return (
          <li key={cp} className={cn("bg-card rounded-lg border-l-4 p-3", STEP[st].tone)}>
            <div className="flex items-center gap-2">{STEP[st].icon}<span className="font-display font-medium">{cp}</span></div>
            <p className="text-sm">{CHECKPOINT_NAMES[cp]}</p>
            <p className="text-muted-foreground text-xs">{STEP[st].label}{subjects[cp].length > 1 ? ` · ${done} of ${subjects[cp].length}` : ""}</p>
            {reason && st !== "passed" ? <p className="text-foreground mt-1 text-xs">{reason}</p> : null}
          </li>
        );
      })}
    </ol>
  );
}

function ConflictSection({ D, projectId }: { D: D; projectId: string }) {
  const a = useAct(projectId);
  const [text, setText] = useState("");
  return (
    <Section id="conflict" title="G0 · Conflict of interest" hint="Required before G0 can be signed. Write “None declared” if there is none.">
      <ul className="mb-3 grid gap-2 text-sm">
        {D.conflicts.map((c) => <li key={c.id} className="bg-muted rounded-md px-3 py-2">{c.declaration} <span className="text-muted-foreground">· {formatDateTime(c.declared_at)}</span></li>)}
        {D.conflicts.length === 0 ? <li className="text-muted-foreground">No declaration recorded yet.</li> : null}
      </ul>
      <form className="grid gap-2" onSubmit={async (e) => { e.preventDefault(); if (await a.run(() => supabase.rpc("u6_declare_conflict", { _project: projectId, _declaration: text }), "Declaration recorded")) setText(""); }}>
        <Label htmlFor="coi">Declaration</Label>
        <Textarea id="coi" value={text} onChange={(e) => setText(e.target.value)} placeholder="None declared" />
        <Refuse t={a.error} />
        <div><Button type="submit" className="min-h-11" disabled={a.busy}>Record declaration</Button></div>
      </form>
    </Section>
  );
}

function MeasuresSection({ D, projectId }: { D: D; projectId: string }) {
  const a = useAct(projectId);
  return (
    <Section id="q1" title="Q1 · Collection measures" hint="Volume, reach, time window and platform coverage per requirement ID, or a recorded negative result. Analysis cannot start until Q1 passes."
      actions={<Button className="min-h-11" disabled={a.busy} onClick={() => a.run(() => supabase.rpc("u6_check_q1", { _project: projectId }), "Q1 passed")}>Run Q1 check</Button>}>
      <Refuse t={a.error} />
      {D.requirements.length === 0 ? <p className="text-muted-foreground text-sm">The requirements register has no active requirements.</p> : null}
      <ul className="grid gap-3">
        {D.requirements.map((r) => {
          const m = D.measures.filter((x) => x.requirement_id === r.id);
          const n = D.negatives.filter((x) => x.requirement_id === r.id);
          return (
            <li key={r.id} className="bg-muted rounded-lg p-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-mono">{r.code} · {r.platform}</span>
                <span className="flex gap-2"><MeasureDialog req={r} projectId={projectId} /><NegativeDialog req={r} projectId={projectId} /></span>
              </div>
              {m.map((x) => <p key={x.id} className="mt-1">Volume {x.volume} · reach {x.reach} · {x.window_from} to {x.window_to} · {x.platform_coverage}</p>)}
              {n.map((x) => <p key={x.id} className="mt-1">Negative result ({x.searched_on}): {x.searched} — nothing found</p>)}
              {m.length + n.length === 0 ? <p className="text-muted-foreground mt-1">No measures yet.</p> : null}
            </li>
          );
        })}
      </ul>
    </Section>
  );
}

function MeasureDialog({ req, projectId }: { req: D["requirements"][number]; projectId: string }) {
  const a = useAct(projectId);
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ volume: "", reach: "", from: req.window_from, to: req.window_to, coverage: "" });
  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); a.setError(null); }}>
      <DialogTrigger asChild><Button variant="secondary" className="min-h-11">Add measures</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Collection measures · {req.code}</DialogTitle><DialogDescription>Recorded once; a later entry adds to the record.</DialogDescription></DialogHeader>
        <form className="grid gap-3" onSubmit={async (e) => { e.preventDefault(); if (await a.run(() => supabase.rpc("u6_record_measure", { _req: req.id, _volume: Number(f.volume), _reach: Number(f.reach), _from: f.from, _to: f.to, _coverage: f.coverage }), "Measures recorded")) setOpen(false); }}>
          <div className="grid grid-cols-2 gap-3">
            <div><Label htmlFor="m-v">Volume (items)</Label><Input id="m-v" inputMode="numeric" className="min-h-11" value={f.volume} onChange={(e) => setF({ ...f, volume: e.target.value })} /></div>
            <div><Label htmlFor="m-r">Reach</Label><Input id="m-r" inputMode="numeric" className="min-h-11" value={f.reach} onChange={(e) => setF({ ...f, reach: e.target.value })} /></div>
            <div><Label htmlFor="m-f">From</Label><Input id="m-f" type="date" className="min-h-11" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} /></div>
            <div><Label htmlFor="m-t">To</Label><Input id="m-t" type="date" className="min-h-11" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} /></div>
          </div>
          <div><Label htmlFor="m-c">Platform coverage</Label><Input id="m-c" className="min-h-11" value={f.coverage} onChange={(e) => setF({ ...f, coverage: e.target.value })} /></div>
          <Refuse t={a.error} />
          <DialogFooter><Button type="submit" className="min-h-11" disabled={a.busy}>Record measures</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function NegativeDialog({ req, projectId }: { req: D["requirements"][number]; projectId: string }) {
  const a = useAct(projectId);
  const [open, setOpen] = useState(false);
  const [s, setS] = useState(""); const [on, setOn] = useState(new Date().toISOString().slice(0, 10));
  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); a.setError(null); }}>
      <DialogTrigger asChild><Button variant="secondary" className="min-h-11">Negative result</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Negative result · {req.code}</DialogTitle><DialogDescription>Nothing found is evidence too.</DialogDescription></DialogHeader>
        <form className="grid gap-3" onSubmit={async (e) => { e.preventDefault(); if (await a.run(() => supabase.rpc("u6_record_negative", { _req: req.id, _searched: s, _on: on }), "Negative result recorded")) setOpen(false); }}>
          <div><Label htmlFor="n-s">What was searched</Label><Textarea id="n-s" value={s} onChange={(e) => setS(e.target.value)} /></div>
          <div><Label htmlFor="n-d">Date</Label><Input id="n-d" type="date" className="min-h-11" value={on} onChange={(e) => setOn(e.target.value)} /></div>
          <Refuse t={a.error} />
          <DialogFooter><Button type="submit" className="min-h-11" disabled={a.busy}>Record</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const Status = ({ r }: { r?: Result | undefined }) => {
  const st: StepState = r ? (r.result as StepState) : "waiting";
  return <Chip><span className={cn("size-2 rounded-full", st === "passed" ? "bg-positive" : st === "failed" ? "bg-negative" : st === "reopened" ? "bg-caution" : "bg-muted-foreground")} aria-hidden />{STEP[st].label}</Chip>;
};

function ItemsSection({ D, projectId }: { D: D; projectId: string }) {
  const a = useAct(projectId);
  return (
    <Section id="items" title="Items · V1 integrity and V2 verification" hint="An item without V1 cannot be verified; an item without V2 cannot be cited.">
      <Refuse t={a.error} />
      {D.captures.length === 0 ? <p className="text-muted-foreground text-sm">No collected items in this engagement yet.</p> : null}
      <ul className="grid gap-2">
        {D.captures.map((c) => {
          const v1 = D.latest(c.id, "V1"); const v = D.verByCap.get(c.id);
          return (
            <li key={c.id} className="bg-muted grid gap-2 rounded-lg p-3 text-sm sm:grid-cols-[1fr_auto] sm:items-center">
              <div>
                <p className="font-mono break-all">{c.item_ref} · {c.platform ?? "—"} {c.item_type ?? ""}</p>
                <p className="text-muted-foreground font-mono text-xs break-all">SHA-256 {c.sha256_at_capture ?? "not recorded"}</p>
                <p className="mt-1 flex flex-wrap gap-2">V1 <Status r={v1} /> V2 {v ? <Chip>{v.confidence}</Chip> : <Status />}</p>
                {v1?.result === "failed" ? <p className="mt-1 text-xs">{v1.reason}</p> : null}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" className="min-h-11" disabled={a.busy} onClick={() => a.run(() => supabase.rpc("u6_check_v1", { _capture: c.id }), "V1 passed")}>Run V1 check</Button>
                <VerifyDialog captureId={c.id} label={c.item_ref} projectId={projectId} />
              </div>
            </li>
          );
        })}
      </ul>
    </Section>
  );
}

function VerifyDialog({ captureId, label, projectId }: { captureId: string; label: string; projectId: string }) {
  const a = useAct(projectId);
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ source: "", technical: "", content: "", confidence: "", reasoning: "" });
  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); a.setError(null); }}>
      <DialogTrigger asChild><Button className="min-h-11">Verify</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Verification record</DialogTitle><DialogDescription className="break-all">{label}</DialogDescription></DialogHeader>
        <form className="grid gap-3" onSubmit={async (e) => { e.preventDefault(); if (await a.run(() => supabase.rpc("u6_verify", { _capture: captureId, _source: f.source, _technical: f.technical, _content: f.content, _confidence: f.confidence, _reasoning: f.reasoning }), "Verification recorded")) setOpen(false); }}>
          <div><Label htmlFor="v-s">Source check</Label><Textarea id="v-s" value={f.source} onChange={(e) => setF({ ...f, source: e.target.value })} /></div>
          <div><Label htmlFor="v-t">Technical check</Label><Textarea id="v-t" value={f.technical} onChange={(e) => setF({ ...f, technical: e.target.value })} /></div>
          <div><Label htmlFor="v-c">Content check</Label><Textarea id="v-c" value={f.content} onChange={(e) => setF({ ...f, content: e.target.value })} /></div>
          <div><Label htmlFor="v-r">Confidence</Label>
            <select id="v-r" className={sel} value={f.confidence} onChange={(e) => setF({ ...f, confidence: e.target.value })}>
              <option value="">Choose…</option>{CONFIDENCE.map((c) => <option key={c}>{c}</option>)}
            </select></div>
          <div><Label htmlFor="v-why">Reasoning</Label><Textarea id="v-why" value={f.reasoning} onChange={(e) => setF({ ...f, reasoning: e.target.value })} /></div>
          <Refuse t={a.error} />
          <DialogFooter><Button type="submit" className="min-h-11" disabled={a.busy}>Record verification</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const FSTATUS: Record<string, string> = { draft: "Draft", in_review: "Waiting for second review", approved: "Approved", returned: "Returned to analysis", ready: "Ready (names no one)" };

function FindingsSection({ D, projectId }: { D: D; projectId: string }) {
  const a = useAct(projectId);
  const [f, setF] = useState({ text: "", alternatives: "", names: "" });
  return (
    <Section id="findings" title="Findings" hint="Link verified items, record alternative explanations, and flag findings that name a person or organisation.">
      <form className="mb-4 grid gap-3" onSubmit={async (e) => { e.preventDefault(); if (await a.run(() => supabase.rpc("u6_create_finding", { _project: projectId, _text: f.text, _alternatives: f.alternatives, _names: f.names === "" ? (null as unknown as boolean) : f.names === "yes" }), "Finding recorded")) setF({ text: "", alternatives: "", names: "" }); }}>
        <div><Label htmlFor="f-t">Finding</Label><Textarea id="f-t" value={f.text} onChange={(e) => setF({ ...f, text: e.target.value })} /></div>
        <div><Label htmlFor="f-a">Alternative explanations considered, and why they were rejected</Label><Textarea id="f-a" value={f.alternatives} onChange={(e) => setF({ ...f, alternatives: e.target.value })} /></div>
        <div><Label htmlFor="f-n">Names a person or organisation?</Label>
          <select id="f-n" className={sel} value={f.names} onChange={(e) => setF({ ...f, names: e.target.value })}><option value="">Choose…</option><option value="yes">Yes</option><option value="no">No</option></select></div>
        <Refuse t={a.error} />
        <div><Button type="submit" className="min-h-11" disabled={a.busy}>Create finding</Button></div>
      </form>
      <ul className="grid gap-3">{D.findings.map((x) => <FindingCard key={x.id} f={x} D={D} projectId={projectId} />)}</ul>
    </Section>
  );
}

function FindingCard({ f, D, projectId }: { f: D["findings"][number]; D: D; projectId: string }) {
  const a = useAct(projectId);
  const [cap, setCap] = useState(""); const [role, setRole] = useState("support");
  const links = D.findingItems.filter((x) => x.finding_id === f.id);
  const editable = f.status === "draft" || f.status === "returned";
  const lastReview = D.reviews.find((r) => r.finding_id === f.id);
  return (
    <li className="bg-muted rounded-lg p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2"><Chip><span className={cn("size-2 rounded-full", f.status === "approved" || f.status === "ready" ? "bg-positive" : f.status === "returned" ? "bg-negative" : "bg-caution")} aria-hidden />{FSTATUS[f.status]}</Chip>{f.names_person_or_org ? <Chip>Names a person or organisation</Chip> : null}</div>
      <p className="mt-2">{f.text}</p>
      <p className="text-muted-foreground mt-1">Alternatives: {f.alternatives}</p>
      {lastReview?.note ? <p className="mt-1">Review note: {lastReview.note}</p> : null}
      <ul className="mt-2 grid gap-1">{links.map((l) => <li key={l.capture_id} className="font-mono text-xs break-all">{l.role === "lead" ? "LEAD (not support)" : "Supports"} · {D.captures.find((c) => c.id === l.capture_id)?.item_ref} · {l.confidence_at_link}</li>)}</ul>
      {editable ? (
        <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto_auto_auto]">
          <select aria-label="Item to link" className={sel} value={cap} onChange={(e) => setCap(e.target.value)}>
            <option value="">Choose an item…</option>
            {D.captures.map((c) => { const conf = D.verByCap.get(c.id)?.confidence; return <option key={c.id} value={c.id}>{c.item_ref} · {conf ?? "no V2"}{conf && !canSupport(conf) ? " (lead only)" : ""}</option>; })}
          </select>
          <select aria-label="Link as" className={sel} value={role} onChange={(e) => setRole(e.target.value)}><option value="support">Supports</option><option value="lead">Lead only</option></select>
          <Button variant="secondary" className="min-h-11" disabled={a.busy || !cap} onClick={() => a.run(() => supabase.rpc("u6_link_item", { _finding: f.id, _capture: cap, _role: role }), "Item linked")}>Link item</Button>
          <Button className="min-h-11" disabled={a.busy} onClick={() => a.run(() => supabase.rpc("u6_send_for_review", { _finding: f.id }), "Sent on")}>Send for second review</Button>
        </div>
      ) : null}
      <Refuse t={a.error} />
    </li>
  );
}

function ReviewQueue({ D, projectId }: { D: D; projectId: string }) {
  const me = useMe();
  const queue = D.findings.filter((f) => f.status === "in_review");
  return (
    <Section id="review" title="Second review queue" hint="A second analyst, not the author, approves each finding that names a person or organisation.">
      {queue.length === 0 ? <p className="text-muted-foreground text-sm">Nothing is waiting for second review.</p> : null}
      <ul className="grid gap-3">{queue.map((f) => <ReviewItem key={f.id} f={f} own={f.author === me.data?.uid} projectId={projectId} />)}</ul>
    </Section>
  );
}

function ReviewItem({ f, own, projectId }: { f: D["findings"][number]; own: boolean; projectId: string }) {
  const a = useAct(projectId);
  const [note, setNote] = useState("");
  return (
    <li className="bg-muted grid gap-2 rounded-lg p-3 text-sm">
      <p>{f.text}</p>
      {own ? <p className="text-muted-foreground">You wrote this finding; the database will refuse your review.</p> : null}
      <Label htmlFor={`rn-${f.id}`}>Note (required to return)</Label>
      <Textarea id={`rn-${f.id}`} value={note} onChange={(e) => setNote(e.target.value)} />
      <Refuse t={a.error} />
      <div className="flex flex-wrap gap-2">
        <Button className="min-h-11" disabled={a.busy} onClick={() => a.run(() => supabase.rpc("u6_review", { _finding: f.id, _approve: true, _note: note }), "Approved")}>Approve</Button>
        <Button variant="secondary" className="min-h-11" disabled={a.busy} onClick={() => a.run(() => supabase.rpc("u6_review", { _finding: f.id, _approve: false, _note: note }), "Returned to analysis")}>Return to analysis</Button>
      </div>
    </li>
  );
}

function ReportBuilder({ D, projectId }: { D: D; projectId: string }) {
  const me = useMe();
  const [outId, setOutId] = useState(D.outputs[0]?.id ?? "");
  const a = useAct(projectId);
  const figs = D.figures.filter((x) => x.output_id === outId);
  const stms = D.statements.filter((x) => x.output_id === outId);
  const latest = stms[0];
  const platforms = useMemo(() => [...new Set(D.requirements.map((r) => r.platform))], [D.requirements]);
  const windowText = D.requirements.length ? `${D.requirements.map((r) => r.window_from).sort()[0]} to ${D.requirements.map((r) => r.window_to).sort().at(-1)}` : "";
  const [fig, setFig] = useState({ label: "", confidence: "", caps: [] as string[] });
  const [st, setSt] = useState<{ statement: string; window: string; platforms: string; limits: string; confidence: string } | null>(null);
  const form = st ?? { statement: latest?.statement ?? defaultStatement(D.standard?.version ?? null, !!D.standard?.sample), window: latest?.time_window ?? windowText, platforms: (latest?.platforms ?? platforms).join(", "), limits: latest?.limits ?? "", confidence: latest?.confidence_summary ?? "" };
  if (D.outputs.length === 0) return <Section id="report" title="Report builder"><p className="text-muted-foreground text-sm">This engagement has no report outputs yet.</p></Section>;
  return (
    <Section id="report" title="Report builder · Q2 and methodology statement" hint="Figures must re-derive from listed items (Q2). Release needs the statement and Curator approval (C).">
      <Label htmlFor="out">Report</Label>
      <select id="out" className={cn(sel, "mb-4")} value={outId} onChange={(e) => { setOutId(e.target.value); setSt(null); }}>{D.outputs.map((o) => <option key={o.id} value={o.id}>{o.title} · {o.status}</option>)}</select>
      <Refuse t={a.error} />
      <h3 className="font-display mt-2 mb-2 font-medium">Figures <Status r={D.latest(outId, "Q2")} /></h3>
      <ul className="mb-3 grid gap-1 text-sm">{figs.map((x) => <li key={x.id} className="bg-muted rounded-md px-3 py-2">{x.label}: <strong>{x.value}</strong> items · {x.confidence}</li>)}</ul>
      <form className="bg-muted mb-4 grid gap-2 rounded-lg p-3" onSubmit={async (e) => { e.preventDefault(); if (await a.run(() => supabase.rpc("u6_add_figure", { _output: outId, _label: fig.label, _captures: fig.caps, _confidence: fig.confidence }), "Figure added")) setFig({ label: "", confidence: "", caps: [] }); }}>
        <div><Label htmlFor="fg-l">Figure label</Label><Input id="fg-l" className="min-h-11" value={fig.label} onChange={(e) => setFig({ ...fig, label: e.target.value })} /></div>
        <fieldset><legend className="text-sm font-medium">Items it is counted from ({fig.caps.length})</legend>
          <div className="grid max-h-48 gap-1 overflow-auto">{D.captures.map((c) => <label key={c.id} className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" className="size-5" checked={fig.caps.includes(c.id)} onChange={(e) => setFig({ ...fig, caps: e.target.checked ? [...fig.caps, c.id] : fig.caps.filter((x) => x !== c.id) })} /><span className="font-mono text-xs break-all">{c.item_ref}</span></label>)}</div>
        </fieldset>
        <div><Label htmlFor="fg-c">Confidence</Label><select id="fg-c" className={sel} value={fig.confidence} onChange={(e) => setFig({ ...fig, confidence: e.target.value })}><option value="">Choose…</option>{CONFIDENCE.map((c) => <option key={c}>{c}</option>)}</select></div>
        <div className="flex flex-wrap gap-2"><Button type="submit" className="min-h-11" disabled={a.busy}>Add figure</Button><Button type="button" variant="secondary" className="min-h-11" disabled={a.busy} onClick={() => a.run(() => supabase.rpc("u6_check_q2", { _output: outId }), "Q2 passed")}>Run Q2 check</Button></div>
      </form>
      <h3 className="font-display mb-2 font-medium">Methodology statement {latest ? `· version ${latest.version}` : ""} <Status r={D.latest(outId, "C")} /></h3>
      {D.standard?.sample ? <p className="mb-2"><Chip tone="bg-warn text-warn-foreground"><span className="bg-caution size-2 rounded-full" aria-hidden />Sample standard</Chip></p> : null}
      <form className="grid gap-2" onSubmit={async (e) => { e.preventDefault(); if (await a.run(() => supabase.rpc("u6_write_statement", { _output: outId, _statement: form.statement, _window: form.window, _platforms: form.platforms.split(",").map((s) => s.trim()).filter(Boolean), _limits: form.limits, _confidence: form.confidence }), "Statement saved as a new version")) setSt(null); }}>
        <div><Label htmlFor="st-s">Statement (names the three standards)</Label><Textarea id="st-s" rows={6} value={form.statement} onChange={(e) => setSt({ ...form, statement: e.target.value })} /></div>
        <div className="grid gap-2 sm:grid-cols-2">
          <div><Label htmlFor="st-w">Time window</Label><Input id="st-w" className="min-h-11" value={form.window} onChange={(e) => setSt({ ...form, window: e.target.value })} /></div>
          <div><Label htmlFor="st-p">Platforms (comma separated)</Label><Input id="st-p" className="min-h-11" value={form.platforms} onChange={(e) => setSt({ ...form, platforms: e.target.value })} /></div>
        </div>
        <div><Label htmlFor="st-l">Limits</Label><Textarea id="st-l" value={form.limits} onChange={(e) => setSt({ ...form, limits: e.target.value })} /></div>
        <div><Label htmlFor="st-c">Confidence for each finding</Label><Textarea id="st-c" value={form.confidence} onChange={(e) => setSt({ ...form, confidence: e.target.value })} /></div>
        <div className="flex flex-wrap gap-2">
          <Button type="submit" className="min-h-11" disabled={a.busy}>Save statement version</Button>
          {latest && me.data?.isCurator && !D.approvals.has(latest.id) ? <Button type="button" variant="secondary" className="min-h-11" disabled={a.busy} onClick={() => a.run(() => supabase.rpc("u6_approve_statement", { _statement: latest.id, _note: "" }), "Curator approval recorded")}>Curator: approve version {latest.version}</Button> : null}
          {latest ? <Link to="/statement/$statementId" params={{ statementId: latest.id }} className="bg-secondary text-secondary-foreground inline-flex min-h-11 items-center rounded-[10px] px-4 text-sm font-medium">Open printable statement</Link> : null}
        </div>
        {latest ? <p className="text-muted-foreground text-sm">{D.approvals.has(latest.id) ? "Approved by the Curator." : "Waiting for Curator approval."}</p> : null}
      </form>
    </Section>
  );
}

function StaffSection({ projectId }: { projectId: string }) {
  const me = useMe();
  const qc = useQueryClient();
  const list = useQuery({
    queryKey: ["u6-staff", projectId],
    queryFn: async () => {
      const [e, t] = await Promise.all([
        supabase.from("staff_exposure_log").select("*").order("on_date", { ascending: false }).limit(50),
        supabase.from("staff_training_records").select("*").order("on_date", { ascending: false }).limit(50),
      ]);
      if (e.error ?? t.error) throw e.error ?? t.error;
      return { exposure: e.data ?? [], training: t.data ?? [] };
    },
  });
  const [err, setErr] = useState<string | null>(null);
  const [ex, setEx] = useState({ on: new Date().toISOString().slice(0, 10), distressing: false, note: "" });
  const [tr, setTr] = useState({ training: "", on: new Date().toISOString().slice(0, 10) });
  const act = async (p: PromiseLike<{ error: unknown }>) => { setErr(null); const { error } = await p; await qc.invalidateQueries({ queryKey: ["u6-staff", projectId] }); if (error) setErr(errText(error)); else toast.success("Recorded"); };
  return (
    <Section id="staff" title="Staff · exposure log and training" hint="Staff only. Training record format is a placeholder until decided.">
      <Refuse t={err} />
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <h3 className="font-display mb-2 font-medium">Exposure log</h3>
          <form className="grid gap-2" onSubmit={(e) => { e.preventDefault(); if (me.data?.uid) void act(supabase.rpc("u6_log_exposure", { _staff: me.data.uid, _project: projectId, _on: ex.on, _distressing: ex.distressing, _note: ex.note })); }}>
            <Input aria-label="Date" type="date" className="min-h-11" value={ex.on} onChange={(e) => setEx({ ...ex, on: e.target.value })} />
            <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" className="size-5" checked={ex.distressing} onChange={(e) => setEx({ ...ex, distressing: e.target.checked })} />Distressing content</label>
            <Input aria-label="Note" placeholder="Note (optional)" className="min-h-11" value={ex.note} onChange={(e) => setEx({ ...ex, note: e.target.value })} />
            <div><Button type="submit" className="min-h-11">Log my exposure</Button></div>
          </form>
          <ul className="mt-2 grid gap-1 text-sm">{list.data?.exposure.map((x) => <li key={x.id} className="bg-muted rounded-md px-3 py-2">{x.on_date} · {x.distressing ? "Distressing" : "Routine"}{x.note ? ` · ${x.note}` : ""}</li>)}</ul>
        </div>
        <div>
          <h3 className="font-display mb-2 font-medium">Training records</h3>
          <form className="grid gap-2" onSubmit={(e) => { e.preventDefault(); if (me.data?.uid) void act(supabase.rpc("u6_add_training", { _staff: me.data.uid, _training: tr.training, _on: tr.on })); }}>
            <Input aria-label="Training" placeholder="Training" className="min-h-11" value={tr.training} onChange={(e) => setTr({ ...tr, training: e.target.value })} />
            <Input aria-label="Date" type="date" className="min-h-11" value={tr.on} onChange={(e) => setTr({ ...tr, on: e.target.value })} />
            <div><Button type="submit" className="min-h-11">Add my training</Button></div>
          </form>
          <ul className="mt-2 grid gap-1 text-sm">{list.data?.training.map((x) => <li key={x.id} className="bg-muted rounded-md px-3 py-2">{x.on_date} · {x.training}</li>)}</ul>
        </div>
      </div>
    </Section>
  );
}
