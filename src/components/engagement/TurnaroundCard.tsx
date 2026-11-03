import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Chip, Section } from "@/components/engagement/ui";
import { roleLabel, type Workspace } from "@/lib/projects";
import { CLOCK_STATUS, PAUSE_REASONS, clockBarPct, type ClockStatus } from "@/lib/sla";
import { cn } from "@/lib/utils";

type ClockInfo = { status: ClockStatus; used: number; paused: number; target: number; warn_pct: number; pct: number };

const errText = (e: unknown) =>
  e && typeof e === "object" && "message" in e ? String((e as { message: unknown }).message) : String(e);

export function TurnaroundCard({ ws }: { ws: Workspace }) {
  const projectId = ws.project.id;
  const q = useQuery({
    queryKey: ["turnaround", projectId],
    queryFn: async () => {
      await supabase.rpc("sla_refresh", { _project: projectId });
      const { data: clock, error } = await supabase
        .from("phase_clocks")
        .select("*, sop_definitions(*)")
        .eq("project_id", projectId)
        .is("completed_at", null)
        .maybeSingle();
      if (error) throw error;
      if (!clock) return null;
      const [{ data: st, error: e2 }, { data: pause }] = await Promise.all([
        supabase.rpc("sla_clock_status", { _clock: clock.id }),
        supabase.from("clock_pauses").select("*").eq("clock_id", clock.id).is("resumed_at", null).maybeSingle(),
      ]);
      if (e2) throw e2;
      return { clock, status: st as unknown as ClockInfo, pause };
    },
  });
  const isLead = ws.role === "management" || ws.has("engagement_lead");

  if (q.error) return <Section id="turnaround" title="Turnaround"><p className="p-5 text-sm">{errText(q.error)}</p></Section>;
  if (!q.data) return <Section id="turnaround" title="Turnaround"><p className="text-muted-foreground p-5 text-sm">{q.isLoading ? "Loading clock…" : "No clock is running."}</p></Section>;

  const { clock, status: s, pause } = q.data;
  const sop = clock.sop_definitions;
  const meta = CLOCK_STATUS[s.status];
  const steps = Array.isArray(sop?.steps) ? (sop.steps as string[]) : [];

  return (
    <Section
      id="turnaround"
      title="Turnaround"
      hint={sop?.is_sample ? "SOP targets are Sample until Management edits them." : undefined}
      actions={
        isLead ? (
          pause ? <ResumeButton clockId={clock.id} projectId={projectId} /> : <PauseDialog clockId={clock.id} projectId={projectId} />
        ) : null
      }
    >
      <div className="space-y-4 p-5">
        <div className="flex flex-wrap items-center gap-3">
          <span className="font-semibold">Phase {clock.phase}{clock.cycle_no != null ? ` · cycle ${clock.cycle_no}` : ""}</span>
          <Chip tone={meta.tone}>
            <span className={cn("size-2 rounded-full", meta.dot)} aria-hidden /> {meta.label}
          </Chip>
          {sop?.is_sample ? <Chip>Sample</Chip> : null}
        </div>
        <div>
          <div className="bg-muted h-3 w-full overflow-hidden rounded-full" role="progressbar" aria-valuemin={0} aria-valuemax={s.target} aria-valuenow={s.used} aria-label="Working days used">
            <div className={cn("h-full", meta.bar)} style={{ width: `${clockBarPct(s.used, s.target)}%` }} />
          </div>
          <p className="text-muted-foreground mt-1 text-sm">
            {s.used} of {s.target} working days used · warns at {s.warn_pct}%{s.paused ? ` · ${s.paused} paused` : ""}
          </p>
        </div>
        {pause ? (
          <p className="bg-muted rounded-md p-3 text-sm">
            Waiting on client: {PAUSE_REASONS.find((r) => r.id === pause.reason)?.label}
            {pause.note ? ` — ${pause.note}` : ""}
          </p>
        ) : null}
        <dl className="grid gap-3 text-sm sm:grid-cols-3">
          <div><dt className="text-muted-foreground">SOP target</dt><dd>{s.target} working days (v{sop?.version})</dd></div>
          <div><dt className="text-muted-foreground">Owner</dt><dd>{roleLabel(sop?.owner_role ?? "")}</dd></div>
          <div><dt className="text-muted-foreground">Escalation</dt><dd>{(sop?.escalation_chain ?? []).map(roleLabel).join(" → ") || "—"}</dd></div>
        </dl>
        {steps.length ? (
          <ol className="list-decimal space-y-1 pl-5 text-sm">{steps.map((st) => <li key={st}>{st}</li>)}</ol>
        ) : null}
      </div>
    </Section>
  );
}

function PauseDialog({ clockId, projectId }: { clockId: string; projectId: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const m = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("sla_pause", { _clock: clockId, _reason: reason, _note: note });
      if (error) throw error;
    },
    onSuccess: async () => { setOpen(false); setReason(""); setNote(""); await qc.invalidateQueries({ queryKey: ["turnaround", projectId] }); },
    onError: (e) => setErr(errText(e)),
  });
  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setErr(null); }}>
      <DialogTrigger asChild><Button ref={trigger} variant="outline" className="min-h-11">Waiting on client: pause clock</Button></DialogTrigger>
      <DialogContent onCloseAutoFocus={(e) => { e.preventDefault(); trigger.current?.focus(); }}>
        <DialogHeader>
          <DialogTitle>Pause the clock</DialogTitle>
          <DialogDescription>Only time waiting on the client pauses the clock. Time waiting on FridayAnalytics staff never does.</DialogDescription>
        </DialogHeader>
        <label className="block space-y-2">
          <span className="text-sm font-semibold">Reason</span>
          <select className="border-input bg-background min-h-11 w-full rounded-md border px-3 text-sm" value={reason} onChange={(e) => setReason(e.target.value)}>
            <option value="">Choose a reason</option>
            {PAUSE_REASONS.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
          </select>
        </label>
        <label className="block space-y-2">
          <span className="text-sm font-semibold">Note</span>
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="What we are waiting for" />
        </label>
        {err ? <p role="alert" className="text-destructive text-sm font-semibold">{err}</p> : null}
        <DialogFooter>
          <Button variant="outline" className="min-h-11" onClick={() => setOpen(false)}>Cancel</Button>
          <Button className="min-h-11" disabled={m.isPending} onClick={() => m.mutate()}>{m.isPending ? "Pausing…" : "Pause clock"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ResumeButton({ clockId, projectId }: { clockId: string; projectId: string }) {
  const qc = useQueryClient();
  const [err, setErr] = useState<string | null>(null);
  const m = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("sla_resume", { _clock: clockId });
      if (error) throw error;
    },
    onSuccess: () => { setErr(null); void qc.invalidateQueries({ queryKey: ["turnaround", projectId] }); },
    onError: (e) => setErr(errText(e)),
  });
  return (
    <div className="flex flex-col items-end gap-1">
      <Button className="min-h-11" disabled={m.isPending} onClick={() => m.mutate()}>{m.isPending ? "Resuming…" : "Resume"}</Button>
      {err ? <p role="alert" className="text-destructive text-sm">{err}</p> : null}
    </div>
  );
}
