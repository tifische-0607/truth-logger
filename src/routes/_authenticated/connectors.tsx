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
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { hubHead } from "@/lib/hub";
import { errText } from "@/lib/home-gateway";
import { CERT_CHECKS } from "@/lib/connectors";

export const Route = createFileRoute("/_authenticated/connectors")({
  head: () => hubHead("Connectors", "Collection connectors, their certification and the sources each engagement's brief approves, in FA Portal."),
  component: Connectors,
});

type Conn = { key: string; name: string; version: string; platforms: string[]; status: string; kind: "automated" | "manual"; requires_certification: boolean; certified: boolean; configured: boolean; approved: boolean | null };
type Overview = { is_curator: boolean; can_approve: boolean; connectors: Conn[] };
const sel = "border-input bg-background min-h-11 w-full rounded-md border px-3 text-sm";
const Refuse = ({ t }: { t: string | null }) => (t ? <p role="alert" className="bg-failed text-failed-foreground rounded-md px-3 py-2 text-sm">{t}</p> : null);
const State = ({ ok, yes, no }: { ok: boolean; yes: string; no: string }) => <Chip tone={ok ? "bg-done text-done-foreground" : undefined}><span aria-hidden className={`${ok ? "bg-positive" : "bg-muted-foreground"} size-2 rounded-full`} />{ok ? yes : no}</Chip>;

function Connectors() {
  const [project, setProject] = useState("");
  const projects = useQuery({ queryKey: ["con-projects"], queryFn: async () => { const { data, error } = await supabase.from("projects").select("id,name").order("name"); if (error) throw error; return data; } });
  const ov = useQuery({ queryKey: ["con-overview", project], queryFn: async () => { const { data, error } = await supabase.rpc("research_sources_overview", { _project: (project || null) as string }); if (error) throw error; return data as unknown as Overview; } });
  return (
    <>
      <PageHeader kicker="04 · Collect" title="Connectors" subtitle="Every source is a connector. A new connector cannot collect until the Curator certifies it, the collection device reports it configured, and the engagement's signed brief approves it. Public content only." />
      {ov.error ? <Refuse t={errText(ov.error)} /> : null}
      <div className="mb-4 grid gap-1 sm:max-w-sm"><Label htmlFor="con-p">Engagement (to see and approve its sources)</Label>
        <select id="con-p" className={sel} value={project} onChange={(e) => setProject(e.target.value)}><option value="">None</option>{projects.data?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
      <Section id="con-list" title="Connector registry">
        <ul className="grid gap-3">{ov.data?.connectors.map((c) => (
          <li key={c.key} className="bg-muted grid gap-2 rounded-md p-3 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-medium">{c.name} <span className="text-muted-foreground font-mono">v{c.version}</span>{c.kind === "manual" ? " · Manual (analyst browser capture)" : ""}</span>
              <State ok={c.status === "active"} yes="Collecting allowed" no="Cannot collect" />
            </div>
            <p className="text-muted-foreground">Platforms: {c.platforms.join(", ")}</p>
            <div className="flex flex-wrap gap-2">
              {c.requires_certification ? <><State ok={c.certified} yes="Certified" no="Not certified" /><State ok={c.configured} yes="Configured" no="Not configured" /></> : <Chip>Baseline connector</Chip>}
              {c.approved !== null && c.requires_certification ? <State ok={c.approved} yes="Approved in brief" no="Not approved in brief" /> : null}
            </div>
            <div className="flex flex-wrap gap-2">
              {ov.data.is_curator && c.requires_certification ? <CertifyDialog c={c} /> : null}
              {project && ov.data.can_approve && c.requires_certification ? <ApproveDialog c={c} project={project} /> : null}
            </div>
          </li>))}</ul>
      </Section>
    </>
  );
}

function useRpc(onDone: () => void) {
  const qc = useQueryClient();
  const [err, setErr] = useState<string | null>(null);
  const m = useMutation({
    mutationFn: async (f: () => PromiseLike<{ error: { message: string } | null }>) => { const r = await f(); if (r.error) throw new Error(r.error.message); },
    onMutate: () => setErr(null), onError: (e) => setErr(errText(e)),
    onSuccess: async () => { await qc.invalidateQueries({ queryKey: ["con-overview"] }); onDone(); },
  });
  return { m, err };
}

function CertifyDialog({ c }: { c: Conn }) {
  const [open, setOpen] = useState(false);
  const [checks, setChecks] = useState<Record<string, boolean>>({});
  const [passed, setPassed] = useState(true); const [notes, setNotes] = useState("");
  const { m, err } = useRpc(() => { setOpen(false); toast.success("Certification recorded"); });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button variant="outline" className="h-11">Certification</Button></DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Certify {c.name} v{c.version}</DialogTitle><DialogDescription>A pass needs every check ticked. The record is permanent and applies only to this version.</DialogDescription></DialogHeader>
        <form className="grid gap-2" onSubmit={(e) => { e.preventDefault(); m.mutate(() => supabase.rpc("research_certify_connector", { _key: c.key, _passed: passed, _checklist: checks, _notes: notes })); }}>
          {CERT_CHECKS.map((k) => <label key={k.key} className="flex min-h-11 items-center gap-3"><input type="checkbox" className="size-5 shrink-0" checked={!!checks[k.key]} onChange={(e) => setChecks({ ...checks, [k.key]: e.target.checked })} />{k.label}</label>)}
          <fieldset className="flex flex-wrap gap-4"><legend className="sr-only">Result</legend>
            <label className="flex min-h-11 items-center gap-2"><input type="radio" checked={passed} onChange={() => setPassed(true)} />Passed</label>
            <label className="flex min-h-11 items-center gap-2"><input type="radio" checked={!passed} onChange={() => setPassed(false)} />Failed</label>
          </fieldset>
          <div className="grid gap-1"><Label htmlFor="cert-notes">Notes</Label><Textarea id="cert-notes" value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
          <Refuse t={err} />
          <DialogFooter><Button type="submit" className="h-11" disabled={m.isPending}>{m.isPending ? "Saving…" : "Record"}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ApproveDialog({ c, project }: { c: Conn; project: string }) {
  const [open, setOpen] = useState(false); const [basis, setBasis] = useState("");
  const { m, err } = useRpc(() => setOpen(false));
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button variant="outline" className="h-11">{c.approved ? "Withdraw from brief" : "Approve in brief"}</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>{c.approved ? "Withdraw" : "Approve"} {c.name} for this engagement</DialogTitle><DialogDescription>Recorded against the signed brief in force. Public content only.</DialogDescription></DialogHeader>
        <form className="grid gap-3" onSubmit={(e) => { e.preventDefault(); m.mutate(() => supabase.rpc("research_approve_source", { _project: project, _key: c.key, _approve: !c.approved, _legal_basis: basis })); }}>
          {!c.approved ? <div className="grid gap-1"><Label htmlFor="ras-basis">Legal basis in the signed brief</Label><Input id="ras-basis" className="h-11" value={basis} onChange={(e) => setBasis(e.target.value)} /></div> : null}
          <Refuse t={err} />
          <DialogFooter><Button type="submit" className="h-11" disabled={m.isPending}>{c.approved ? "Withdraw" : "Approve"}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
