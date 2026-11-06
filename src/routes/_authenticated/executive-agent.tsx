import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/AppShell";
import { Chip, Section } from "@/components/engagement/ui";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { hubHead } from "@/lib/hub";
import { formatDateTime } from "@/lib/format";
import { errText } from "@/lib/home-gateway";

export const Route = createFileRoute("/_authenticated/executive-agent")({
  head: () => hubHead("Executive agent access", "Who may question the read-only executive agent, and the log of every question and answer, in FA Portal."),
  component: ExecAgent,
});

const NO_EXECUTIVES = "No executives have access";
type Access = { user_id: string; name: string; status: "granted" | "revoked"; projects: string[]; scope: string[]; reason: string; at: string };
type Overview = { access: Access[]; log: { user: string | null; confidence: string; citations: number; ref: string; at: string }[]; candidates: { id: string; name: string }[] };
const sel = "border-input bg-background min-h-11 w-full rounded-md border px-3 text-sm";
const Refuse = ({ t }: { t: string | null }) => (t ? <p role="alert" className="bg-failed text-failed-foreground rounded-md px-3 py-2 text-sm">{t}</p> : null);

function ExecAgent() {
  const ov = useQuery({ queryKey: ["exec-overview"], retry: false, queryFn: async () => { const { data, error } = await supabase.rpc("exec_overview"); if (error) throw error; return data as unknown as Overview; } });
  const projects = useQuery({ queryKey: ["exec-projects"], queryFn: async () => { const { data, error } = await supabase.from("projects").select("id,name").order("name"); if (error) throw error; return data; } });
  const pname = (id: string) => projects.data?.find((p) => p.id === id)?.name ?? id.slice(0, 8);
  const granted = ov.data?.access.filter((a) => a.status === "granted") ?? [];
  return (
    <>
      <PageHeader kicker="08 · Govern" title="Executive agent access" subtitle="The executive agent runs at home on the Mac Studio and answers through Telegram. It is read-only: it analyses and summarises, cites evidence with confidence, and never starts research, changes evidence or releases anything. There is no chat view in the portal." />
      {ov.error ? <Refuse t={errText(ov.error)} /> : null}
      {ov.data ? <>
        <Section id="exec-access" title="Access list" hint="The agent sees only the engagements listed here that the executive can already see.">
          {granted.length === 0 ? <p className="text-sm"><Chip><span aria-hidden className="bg-muted-foreground size-2 rounded-full" />{NO_EXECUTIVES}</Chip></p> : (
            <ul className="grid gap-2">{granted.map((a) => (
              <li key={a.user_id} className="bg-muted grid gap-1 rounded-md p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2"><span className="font-medium">{a.name}</span><Chip tone="bg-done text-done-foreground"><span aria-hidden className="bg-positive size-2 rounded-full" />Has access</Chip></div>
                <p>Engagements: {a.scope.map(pname).join(", ") || "none currently visible"}</p>
                <p className="text-muted-foreground">Granted {formatDateTime(a.at)} · {a.reason}</p>
                <RevokeDialog a={a} />
              </li>))}</ul>
          )}
          <GrantDialog candidates={ov.data.candidates} projects={projects.data ?? []} />
        </Section>
        <Section id="exec-log" title="Question and answer log" hint="Written only by the home agent gateway. Question and answer text stay on DarkNight; the portal keeps hashes, citations, confidence and the standard version.">
          {ov.data.log.length === 0 ? <p className="text-muted-foreground text-sm">No questions asked yet.</p> : (
            <ul className="grid gap-1 text-sm">{ov.data.log.map((l, i) => <li key={i} className="flex flex-wrap gap-2"><span>{formatDateTime(l.at)}</span><span>{l.user}</span><span>{l.citations} citation(s)</span><span>confidence {l.confidence}</span><span className="font-mono">{l.ref}</span></li>)}</ul>
          )}
        </Section>
      </> : null}
    </>
  );
}

function useRpc(onDone: () => void) {
  const qc = useQueryClient();
  const [err, setErr] = useState<string | null>(null);
  const m = useMutation({
    mutationFn: async (f: () => PromiseLike<{ error: { message: string } | null }>) => { const r = await f(); if (r.error) throw new Error(r.error.message); },
    onMutate: () => setErr(null), onError: (e) => setErr(errText(e)),
    onSuccess: async () => { await qc.invalidateQueries({ queryKey: ["exec-overview"] }); onDone(); },
  });
  return { m, err };
}

function GrantDialog({ candidates, projects }: { candidates: Overview["candidates"]; projects: { id: string; name: string }[] }) {
  const [open, setOpen] = useState(false);
  const [user, setUser] = useState(""); const [ps, setPs] = useState<string[]>([]); const [reason, setReason] = useState("");
  const { m, err } = useRpc(() => { setOpen(false); toast.success("Access recorded"); });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button variant="outline" className="mt-3 h-11">Give an executive access</Button></DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Give executive agent access</DialogTitle><DialogDescription>Read-only. The agent will see only the engagements you tick that this person can already see. The change is logged permanently.</DialogDescription></DialogHeader>
        <form className="grid gap-3" onSubmit={(e) => { e.preventDefault(); m.mutate(() => supabase.rpc("exec_set_access", { _user: user, _grant: true, _projects: ps, _reason: reason })); }}>
          <div className="grid gap-1"><Label htmlFor="exec-user">Executive</Label><select id="exec-user" className={sel} value={user} onChange={(e) => setUser(e.target.value)}><option value="">Choose…</option>{candidates.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
          <fieldset className="grid gap-1"><legend className="text-sm font-medium">Engagements</legend>
            {projects.length === 0 ? <p className="text-muted-foreground text-sm">No engagements.</p> : projects.map((p) => <label key={p.id} className="flex min-h-11 items-center gap-3"><input type="checkbox" className="size-5" checked={ps.includes(p.id)} onChange={(e) => setPs(e.target.checked ? [...ps, p.id] : ps.filter((x) => x !== p.id))} />{p.name}</label>)}
          </fieldset>
          <div className="grid gap-1"><Label htmlFor="exec-reason">Reason</Label><Textarea id="exec-reason" value={reason} onChange={(e) => setReason(e.target.value)} /></div>
          <Refuse t={err} />
          <DialogFooter><Button type="submit" className="h-11" disabled={m.isPending}>{m.isPending ? "Saving…" : "Give access"}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RevokeDialog({ a }: { a: Access }) {
  const [open, setOpen] = useState(false); const [reason, setReason] = useState("");
  const { m, err } = useRpc(() => setOpen(false));
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button variant="outline" className="h-11 justify-self-start">Remove access</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Remove {a.name}'s access?</DialogTitle><DialogDescription>The agent stops answering for this person at once. Logged permanently.</DialogDescription></DialogHeader>
        <form className="grid gap-3" onSubmit={(e) => { e.preventDefault(); m.mutate(() => supabase.rpc("exec_set_access", { _user: a.user_id, _grant: false, _projects: [], _reason: reason })); }}>
          <div className="grid gap-1"><Label htmlFor="exec-rreason">Reason</Label><Textarea id="exec-rreason" value={reason} onChange={(e) => setReason(e.target.value)} /></div>
          <Refuse t={err} />
          <DialogFooter><Button type="submit" className="h-11" disabled={m.isPending}>Remove access</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
