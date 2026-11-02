import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { CheckCircle2, Circle, Lock, PenLine } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import {
  AreaIn,
  Chip,
  Locked,
  Section,
  Submit,
  TextIn,
  useDbAction,
} from "@/components/engagement/ui";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatDateTime } from "@/lib/format";
import {
  ATTRIBUTION,
  GATES,
  PHASES,
  countsFor,
  currentPhase,
  formatDay,
  roleLabel,
  type GateId,
  type Workspace,
} from "@/lib/projects";
import { cn } from "@/lib/utils";

type TabId = "brief" | "discovery" | "plan" | "design" | "reading" | "evidence" | "reports";

export function PhaseStrip({ ws }: { ws: Workspace }) {
  const now = currentPhase(ws);
  const gateAfter: Record<number, string> = { 0: "G0 · G1", 1: "G2", 4: "G3", 7: "G4", 9: "G5" };
  return (
    <nav aria-label="Engagement phases" className="overflow-x-auto pb-1">
      <ol className="flex min-w-max items-stretch gap-1.5">
        {PHASES.map((p) => {
          const done = p.n < now;
          const here = p.n === now;
          return (
            <li key={p.n} className="flex items-stretch gap-1.5">
              <div
                aria-current={here ? "step" : undefined}
                className={cn(
                  "flex w-24 flex-col items-center justify-center rounded-lg border px-2 py-2 text-center",
                  here
                    ? "bg-primary text-primary-foreground border-primary"
                    : done
                      ? "bg-secondary text-secondary-foreground"
                      : "text-muted-foreground",
                  [4, 5].includes(p.n) && !here && !done && "border-dashed",
                )}
              >
                <span className="text-lg leading-none font-bold">{p.n}</span>
                <span className="text-xs">{p.name}</span>
                <span className="sr-only">{done ? "done" : here ? "current" : "to do"}</span>
              </div>
              {gateAfter[p.n] ? (
                <div className="text-muted-foreground flex w-12 flex-col items-center justify-center text-[11px] font-semibold">
                  <Lock className="size-3" aria-hidden />
                  {gateAfter[p.n]}
                </div>
              ) : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function SignDialog({
  ws,
  gate,
  cycle,
  open,
  onOpenChange,
}: {
  ws: Workspace;
  gate: GateId;
  cycle: number;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [sponsor, setSponsor] = useState(ws.project.sponsor_name ?? "");
  const [sponsorRole, setSponsorRole] = useState("Client sponsor");
  const [readBack, setReadBack] = useState("");
  const [docHash, setDocHash] = useState("");
  const [note, setNote] = useState("");
  const [recipient, setRecipient] = useState("");
  const [approval, setApproval] = useState("");
  const [outputId, setOutputId] = useState("");
  const held = ws.outputs.filter((o) => o.status === "held");
  const def = GATES.find((g) => g.id === gate)!;
  const sign = useDbAction(
    ws,
    async () => {
      const row = {
        project_id: ws.project.id,
        gate,
        cycle_no: gate === "G3" || gate === "G4" ? cycle : 0,
        note: note.trim() || null,
        signed_by_name: ws.me.name || null,
        ...(gate === "G0"
          ? {
              sponsor_name: sponsor.trim(),
              sponsor_role: sponsorRole.trim() || null,
              read_back_on: readBack || null,
              signed_document_sha256: docHash.trim().toLowerCase() || null,
            }
          : {}),
        ...(gate === "G5"
          ? {
              output_id: outputId,
              recipient: recipient.trim(),
              written_approval_ref: approval.trim(),
            }
          : {}),
      };
      const { error } = await supabase.from("project_gates").insert(row);
      if (error) throw error;
    },
    `${gate} signed`,
    () => onOpenChange(false),
  );
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Sign {gate} · {def.name}
            {gate === "G3" || gate === "G4" ? ` · cycle ${cycle}` : ""}
          </DialogTitle>
          <DialogDescription>{def.passes}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          {gate === "G0" ? (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <TextIn label="Client sponsor who signed" value={sponsor} onChange={setSponsor} />
                <TextIn label="Sponsor's role" value={sponsorRole} onChange={setSponsorRole} />
              </div>
              <TextIn
                label="Brief read back on"
                type="date"
                value={readBack}
                onChange={setReadBack}
              />
              <TextIn
                label="SHA-256 of the signed brief (optional)"
                value={docHash}
                onChange={setDocHash}
                hint="64 hex characters, if you hold the signed document."
              />
            </>
          ) : null}
          {gate === "G5" ? (
            <>
              <div className="grid gap-1.5">
                <label className="text-sm font-medium" htmlFor="g5-out">
                  Output (must be HELD)
                </label>
                <select
                  id="g5-out"
                  className="border-input bg-background min-h-11 rounded-md border px-3 text-sm"
                  value={outputId}
                  onChange={(e) => setOutputId(e.target.value)}
                >
                  <option value="">Choose a held output</option>
                  {held.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.title}
                    </option>
                  ))}
                </select>
              </div>
              <TextIn
                label="Recipient"
                value={recipient}
                onChange={setRecipient}
                hint="Who receives it, outside FridayAnalytics.org."
              />
              <TextIn
                label="Reference of the written approval"
                value={approval}
                onChange={setApproval}
                hint="Email subject, document number or date. The release is logged with recipient, time and file hash."
              />
            </>
          ) : null}
          <AreaIn label="Note" value={note} onChange={setNote} rows={2} />
          <p className="text-muted-foreground text-xs">
            Signing is permanent. If something is missing, the database says exactly what.
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Submit
            pending={sign.isPending}
            disabled={gate === "G5" && !outputId}
            onClick={() => sign.mutate()}
          >
            Sign {gate}
          </Submit>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function GateCard({ ws, id, cycle }: { ws: Workspace; id: GateId; cycle?: number }) {
  const [open, setOpen] = useState(false);
  const def = GATES.find((g) => g.id === id)!;
  const signed =
    id === "G5"
      ? ws.gates.filter((g) => g.gate === "G5")
      : ws.gates.filter((g) => g.gate === id && (cycle === undefined || g.cycle_no === cycle));
  const mine = ws.has(...def.roles);
  const prior: Record<GateId, GateId | null> = {
    G0: null,
    G1: "G0",
    G2: "G1",
    G3: "G2",
    G4: "G3",
    G5: "G4",
  };
  const blocked = prior[id] && !ws.gateAt(prior[id]!, cycle ?? 0) && id !== "G5";
  const g2Resign = id === "G2" && ws.project.design_stale;
  return (
    <li className="flex flex-wrap items-start justify-between gap-3 px-5 py-4">
      <div className="min-w-[14rem] flex-1">
        <div className="flex flex-wrap items-center gap-2">
          {signed.length && !g2Resign ? (
            <CheckCircle2 className="text-done-foreground size-4" aria-hidden />
          ) : (
            <Circle className="text-muted-foreground size-4" aria-hidden />
          )}
          <span className="font-mono text-sm font-bold">{id}</span>
          <span className="text-sm font-semibold">{def.name}</span>
          {cycle !== undefined ? <Chip>cycle {cycle}</Chip> : null}
          {g2Resign ? <Chip tone="bg-warn text-warn-foreground">needs signing again</Chip> : null}
          {id === "G5" && !signed.length ? (
            <Chip tone="bg-warn text-warn-foreground">HELD</Chip>
          ) : null}
        </div>
        <p className="text-muted-foreground mt-1 text-xs">{def.passes}</p>
        {signed.map((g) => (
          <p key={g.id} className="mt-1 text-xs">
            Signed {formatDateTime(g.signed_at)} by{" "}
            {g.signed_by_name || ws.names.get(g.signed_by ?? "") || "—"}
            {g.sponsor_name ? ` · sponsor ${g.sponsor_name}` : ""}
            {g.recipient ? ` · to ${g.recipient}` : ""}
            {g.design_version ? ` · design v${g.design_version}` : ""}
          </p>
        ))}
        {!signed.length ? (
          <p className="mt-1 text-xs">
            <span className="font-semibold">Signed by:</span> {def.signer}
          </p>
        ) : null}
      </div>
      {(!signed.length || g2Resign || id === "G5") && mine && !blocked ? (
        <Button
          variant={id === "G5" ? "outline" : "default"}
          className="min-h-11"
          onClick={() => setOpen(true)}
        >
          <PenLine className="size-4" /> Sign {id}
        </Button>
      ) : null}
      {!mine && !signed.length ? (
        <span className="text-muted-foreground text-xs">
          Waiting for {def.signer.toLowerCase()}
        </span>
      ) : null}
      <SignDialog ws={ws} gate={id} cycle={cycle ?? 0} open={open} onOpenChange={setOpen} />
    </li>
  );
}

function CloseoutForm({ ws }: { ws: Workspace }) {
  const [ref, setRef] = useState("");
  const [hash, setHash] = useState("");
  const [years, setYears] = useState("5");
  const [note, setNote] = useState("");
  const [lessons, setLessons] = useState("");
  const save = useDbAction(
    ws,
    async () => {
      const { error } = await supabase.from("project_closeouts").insert({
        project_id: ws.project.id,
        design_frozen_version: ws.design?.version ?? 0,
        archive_ref: ref.trim(),
        archive_manifest_sha256: hash.trim().toLowerCase(),
        retention_years: Number(years) || 5,
        retention_note: note.trim() || null,
        lessons_learned: lessons.trim(),
        closed_by_name: ws.me.name || null,
      });
      if (error) throw error;
    },
    "Close-out recorded",
  );
  if (ws.closeout) {
    return (
      <div className="space-y-1 text-sm">
        <p>
          Design frozen at v{ws.closeout.design_frozen_version}. Archive{" "}
          <span className="font-mono">{ws.closeout.archive_ref}</span>, retained{" "}
          {ws.closeout.retention_years} years.
        </p>
        <p className="text-muted-foreground whitespace-pre-wrap">{ws.closeout.lessons_learned}</p>
      </div>
    );
  }
  if (!ws.has("owner", "engagement_lead", "lead_analyst"))
    return <Locked>The engagement lead or lead analyst records the close-out.</Locked>;
  return (
    <div className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <TextIn
          label="Archive location (case folders, manifests, timestamps)"
          value={ref}
          onChange={setRef}
        />
        <TextIn label="SHA-256 of the archive manifest" value={hash} onChange={setHash} />
        <TextIn
          label="Retention (years)"
          type="number"
          value={years}
          onChange={setYears}
          hint="Five years unless the client contract says otherwise."
        />
        <TextIn label="Contract term, if under five years" value={note} onChange={setNote} />
      </div>
      <AreaIn label="Lessons learned" value={lessons} onChange={setLessons} />
      <div>
        <Submit
          pending={save.isPending}
          disabled={!ref.trim() || !hash.trim() || !lessons.trim()}
          onClick={() => save.mutate()}
        >
          Freeze design and record close-out
        </Submit>
      </div>
    </div>
  );
}

export function OverviewTab({ ws }: { ws: Workspace }) {
  const now = currentPhase(ws);
  const brief = ws.briefInForce;
  const open = ws.cycles.find((c) => !ws.gateAt("G4", c.cycle_no));
  const next: { label: string; tab: TabId; done: boolean }[] = [
    {
      label: "Open the engagement file and send the pre-brief pack",
      tab: "discovery",
      done: ws.interviews.length > 0 || !!ws.briefs.length,
    },
    {
      label: "Log client research content in the intake register",
      tab: "discovery",
      done: ws.intake.length > 0,
    },
    {
      label: "Run discovery interviews (two FA people each)",
      tab: "discovery",
      done: ws.interviews.length > 0,
    },
    {
      label: "Write the situation analysis and research questions",
      tab: "discovery",
      done: ws.rqs.length > 0,
    },
    {
      label: "Write the brief, scenario register and success plan",
      tab: "brief",
      done: !!ws.gateAt("G0") || (ws.scenarios.length > 0 && ws.measures.length > 0 && !!ws.draft),
    },
    { label: "G0: read back and sign the brief", tab: "brief", done: !!ws.gateAt("G0") },
    {
      label: "G1: Curator completes the scope sheet and risk screen",
      tab: "design",
      done: !!ws.gateAt("G1"),
    },
    {
      label: "Design sheet and target register, then G2",
      tab: "design",
      done: !!ws.gateAt("G2") && !ws.project.design_stale,
    },
    {
      label: "Collect, screen and read candidates",
      tab: "reading",
      done: !!ws.gateAt("G3", open?.cycle_no ?? 0),
    },
    {
      label: "Capture evidence, set tiers, load and reconcile (G4)",
      tab: "evidence",
      done: !!ws.gateAt("G4", open?.cycle_no ?? 0),
    },
    {
      label: "Report against the brief, QA, then G5 release",
      tab: "reports",
      done: ws.outputs.some((o) => o.status === "released"),
    },
  ];
  const cycleGates = ws.cycles.length ? ws.cycles : [];
  const c = countsFor(ws);
  return (
    <div className="space-y-6">
      <PhaseStrip ws={ws} />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <section className="panel space-y-2 p-5" aria-labelledby="q-h">
            <h2 id="q-h" className="text-muted-foreground text-xs font-semibold uppercase">
              The brief in force
              {brief
                ? ` · v${brief.version}${brief.amendment_no ? ` (amendment A${brief.amendment_no})` : ""}`
                : ""}
            </h2>
            <p className="text-lg leading-snug font-medium">
              {brief?.purpose_decisions || brief?.situation || "No brief yet."}
            </p>
            {brief?.objectives.length ? (
              <ul className="text-muted-foreground list-disc pl-5 text-sm">
                {brief.objectives.map((o) => (
                  <li key={o}>{o}</li>
                ))}
              </ul>
            ) : null}
          </section>
          <section className="grid grid-cols-2 gap-3 sm:grid-cols-4" aria-label="Numbers">
            {(
              [
                ["Candidates", c.candidates],
                ["Flagged", c.flagged],
                ["Excluded", c.excluded],
                ["Need a second reader", c.needSecondReader],
              ] as const
            ).map(([l, n]) => (
              <div key={l} className="panel min-w-0 p-4">
                <div className="text-2xl font-bold tabular-nums">{n}</div>
                <div className="text-muted-foreground text-xs">{l}</div>
              </div>
            ))}
          </section>
          <Section
            id="gates-h"
            title="Gates"
            hint="Six control gates. The database refuses a signature whose pass condition is not met."
          >
            <ul className="divide-border -m-5 divide-y">
              <GateCard ws={ws} id="G0" />
              <GateCard ws={ws} id="G1" />
              <GateCard ws={ws} id="G2" />
              {cycleGates.map((cy) => (
                <div key={cy.cycle_no} className="contents">
                  <GateCard ws={ws} id="G3" cycle={cy.cycle_no} />
                  <GateCard ws={ws} id="G4" cycle={cy.cycle_no} />
                </div>
              ))}
              {!cycleGates.length ? (
                <>
                  <GateCard ws={ws} id="G3" cycle={0} />
                  <GateCard ws={ws} id="G4" cycle={0} />
                </>
              ) : null}
              <GateCard ws={ws} id="G5" />
            </ul>
          </Section>
          <Section
            id="close-h"
            title="Close-out (Phase 10)"
            hint="Freeze the design, archive the case folders with manifests and timestamps, set retention, write the lessons-learned note."
          >
            <CloseoutForm ws={ws} />
          </Section>
        </div>
        <div className="space-y-6">
          <section className="panel space-y-3 p-5" aria-labelledby="steps-h">
            <h2 id="steps-h" className="font-semibold">
              Where you are · phase {now}
            </h2>
            <ol className="space-y-1">
              {next.map((st) => (
                <li key={st.label}>
                  <Link
                    to="/projects/$projectId"
                    params={{ projectId: ws.project.id }}
                    search={{ tab: st.tab }}
                    className="flex min-h-10 items-start gap-2 text-sm hover:underline"
                  >
                    {st.done ? (
                      <CheckCircle2 className="text-done-foreground mt-0.5 size-4 shrink-0" />
                    ) : (
                      <Circle className="text-muted-foreground mt-0.5 size-4 shrink-0" />
                    )}
                    <span className={st.done ? "text-muted-foreground line-through" : ""}>
                      {st.label}
                    </span>
                  </Link>
                </li>
              ))}
            </ol>
          </section>
          <section
            className="panel grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 p-5 text-sm"
            aria-labelledby="facts-h"
          >
            <h2 id="facts-h" className="col-span-2 font-semibold">
              Engagement
            </h2>
            <div className="text-muted-foreground">Client</div>
            <div>{ws.client?.name ?? "—"}</div>
            <div className="text-muted-foreground">Mandate</div>
            <div>
              {ws.scopeSheet
                ? ws.scopeSheet.mandate === "external_release_allowed"
                  ? "Release outside FA allowed (G5)"
                  : "Internal read-only"
                : "Not set (internal read-only)"}
            </div>
            <div className="text-muted-foreground">Opened</div>
            <div>{formatDay(ws.project.opened_on)}</div>
            <div className="text-muted-foreground">Due</div>
            <div>{formatDay(ws.project.due_on)}</div>
            <div className="text-muted-foreground">Lead</div>
            <div>
              {ws.members
                .filter((m) => m.role === "engagement_lead")
                .map((m) => m.name)
                .join(", ") || "—"}
            </div>
            <div className="text-muted-foreground">You</div>
            <div>{roleLabel(ws.role)}</div>
          </section>
          <p className="text-muted-foreground px-1 text-xs">
            Standing rules: data-only reporting; client statements are inputs, not findings; an
            analyst reads every candidate; nothing is deleted, only voided with a note. Every
            document carries: “{ATTRIBUTION}”
          </p>
        </div>
      </div>
    </div>
  );
}
