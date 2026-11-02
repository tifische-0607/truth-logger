import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { House, Plus } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import type { TablesInsert } from "@/integrations/supabase/types";
import {
  AreaIn,
  Chip,
  Locked,
  SEVERITY_TONE,
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
  CATEGORIES,
  EXCLUSION_CODES,
  SEVERITIES,
  countsFor,
  platformLabel,
  plural,
  tierLabel,
  useCasePool,
  type Candidate,
  type Workspace,
} from "@/lib/projects";
import { cn } from "@/lib/utils";

const selectCls = "border-input bg-background min-h-11 rounded-md border px-3 text-sm";

function DecideDialog({
  ws,
  cand,
  open,
  onOpenChange,
}: {
  ws: Workspace;
  cand: Candidate;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const prior = ws.decisions.get(cand.id);
  const allowed = (ws.design?.exclusion_codes ?? EXCLUSION_CODES.map((c) => c.id)) as string[];
  const [mode, setMode] = useState<"flag" | "exclude">(
    prior?.decision === "exclude" ? "exclude" : "flag",
  );
  const [cat, setCat] = useState(prior?.category ?? "INCITEMENT");
  const [sev, setSev] = useState(prior?.severity ?? "MEDIUM");
  const [group, setGroup] = useState(prior?.target_group ?? "");
  const [note, setNote] = useState(prior?.note ?? "");
  const [code, setCode] = useState(prior?.exclusion_code ?? allowed[0]!);
  const [reason, setReason] = useState(prior?.reason ?? "");
  const [jc, setJc] = useState(false);
  const [jn, setJn] = useState("");
  const save = useDbAction(
    ws,
    async () => {
      const base = {
        project_id: ws.project.id,
        project_item_id: cand.id,
        read_by_name: ws.me.name || null,
        judgement_call: jc,
        judgement_note: jc ? jn.trim() : null,
      };
      const row =
        mode === "flag"
          ? {
              ...base,
              decision: "flag",
              category: cat,
              severity: sev,
              target_group: group.trim(),
              note: note.trim(),
            }
          : { ...base, decision: "exclude", exclusion_code: code, reason: reason.trim() };
      const { error } = await supabase
        .from("project_decisions")
        .insert(row as TablesInsert<"project_decisions">);
      if (error) throw error;
    },
    "Decision recorded",
    () => onOpenChange(false),
  );
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Decide · {cand.code}</DialogTitle>
          <DialogDescription>
            Every candidate gets a flag (category, severity, target group, one-line note) or an
            exclusion code with a reason. Rejected candidates are filed with their reasons, never
            discarded.
          </DialogDescription>
        </DialogHeader>
        <div className="bg-muted space-y-1 rounded-lg p-3 text-sm">
          <p className="whitespace-pre-wrap">{cand.text ?? "No text on this reference."}</p>
          {cand.translation ? (
            <p className="text-muted-foreground whitespace-pre-wrap text-xs">
              English (machine translation, unreviewed): {cand.translation}
            </p>
          ) : null}
          {cand.sourceLine ? (
            <p className="text-muted-foreground text-xs">Source line: {cand.sourceLine}</p>
          ) : null}
          {cand.matchedTerms.length ? (
            <p className="text-xs">
              Matched: {cand.matchedTerms.join(", ")} · score {cand.score ?? "—"}
            </p>
          ) : null}
        </div>
        <div className="grid gap-4">
          <div className="flex gap-2" role="tablist">
            {(["flag", "exclude"] as const).map((m) => (
              <button
                key={m}
                role="tab"
                aria-selected={mode === m}
                onClick={() => setMode(m)}
                className={cn(
                  "min-h-10 rounded-lg px-4 text-sm font-medium",
                  mode === m ? "bg-primary text-primary-foreground" : "hover:bg-muted border",
                )}
              >
                {m === "flag" ? "Flag" : "Exclude"}
              </button>
            ))}
          </div>
          {mode === "flag" ? (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-1.5">
                  <label className="text-sm font-medium" htmlFor="d-cat">
                    Category
                  </label>
                  <select
                    id="d-cat"
                    className={selectCls}
                    value={cat}
                    onChange={(e) => setCat(e.target.value as typeof cat)}
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.id}
                      </option>
                    ))}
                  </select>
                  <p className="text-muted-foreground text-xs">
                    {CATEGORIES.find((c) => c.id === cat)?.meaning} · reported as{" "}
                    {CATEGORIES.find((c) => c.id === cat)?.reportAs}
                  </p>
                </div>
                <div className="grid gap-1.5">
                  <label className="text-sm font-medium" htmlFor="d-sev">
                    Severity
                  </label>
                  <select
                    id="d-sev"
                    className={selectCls}
                    value={sev}
                    onChange={(e) => setSev(e.target.value as typeof sev)}
                  >
                    {SEVERITIES.map((c) => (
                      <option key={c.id}>{c.id}</option>
                    ))}
                  </select>
                  <p className="text-muted-foreground text-xs">
                    {SEVERITIES.find((c) => c.id === sev)?.use}
                    {sev === "CRITICAL" || sev === "HIGH" ? " · a second reader must confirm" : ""}
                  </p>
                </div>
              </div>
              <TextIn label="Target group" value={group} onChange={setGroup} />
              <TextIn label="One-line note" value={note} onChange={setNote} />
            </>
          ) : (
            <>
              <div className="grid gap-1.5">
                <label className="text-sm font-medium" htmlFor="d-code">
                  Exclusion code
                </label>
                <select
                  id="d-code"
                  className={selectCls}
                  value={code}
                  onChange={(e) => setCode(e.target.value as typeof code)}
                >
                  {allowed.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
                <p className="text-muted-foreground text-xs">
                  {EXCLUSION_CODES.find((c) => c.id === code)?.meaning}
                </p>
              </div>
              <AreaIn label="Reason" value={reason} onChange={setReason} rows={2} />
            </>
          )}
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="size-5"
              checked={jc}
              onChange={(e) => setJc(e.target.checked)}
            />{" "}
            Judgement call, list it for the Curator (for example, the referent comes from the post
            thread, or violent wording with no group named)
          </label>
          {jc ? <TextIn label="Why it is a judgement call" value={jn} onChange={setJn} /> : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Submit
            pending={save.isPending}
            disabled={mode === "flag" ? !group.trim() || !note.trim() : !reason.trim()}
            onClick={() => save.mutate()}
          >
            Record decision
          </Submit>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CandidateRow({ ws, cand }: { ws: Workspace; cand: Candidate }) {
  const [open, setOpen] = useState(false);
  const d = ws.decisions.get(cand.id);
  const g3 = ws.gateAt("G3", cand.cycleNo);
  const canRead = ws.has("owner", "lead_analyst", "analyst");
  const confirm = useDbAction(
    ws,
    async (result: "confirm" | "disagree") => {
      const note = result === "disagree" ? window.prompt("Why do you disagree?") : null;
      if (result === "disagree" && !note) throw new Error("A disagreement needs a reason");
      const { error } = await supabase.from("project_confirmations").insert({
        project_id: ws.project.id,
        decision_id: d!.id!,
        result,
        note,
        confirmed_by_name: ws.me.name || null,
      });
      if (error) throw error;
    },
    "Recorded",
  );
  const voidIt = useDbAction(
    ws,
    async () => {
      const note = window.prompt(
        "Why is this candidate void? (duplicates and withdrawn items are voided, never removed)",
      );
      if (!note) throw new Error("A void needs a note");
      const { error } = await supabase
        .from("project_items")
        .update({ voided_at: new Date().toISOString(), void_note: note })
        .eq("id", cand.id);
      if (error) throw error;
    },
    "Voided with a note",
  );
  const tier = ws.tiers.get(cand.id);
  const mine = d?.read_by === ws.me.uid;
  return (
    <tr className={cn("border-border/60 border-t align-top", cand.voided && "opacity-50")}>
      <td className="px-3 py-3">
        {cand.kind === "home_ref" ? (
          <Link
            to="/vault/$sourceId/$recordId"
            params={{ sourceId: cand.sourceId, recordId: cand.recordId ?? "" }}
            className="font-mono text-xs font-semibold hover:underline"
          >
            {cand.code}
          </Link>
        ) : (
          <Link
            to="/items/$itemId"
            params={{ itemId: cand.refId }}
            className="font-mono text-xs font-semibold hover:underline"
          >
            {cand.code}
          </Link>
        )}
        {cand.kind === "home_ref" ? (
          <House className="text-home-foreground ml-1 inline size-3.5" aria-label="Home vault" />
        ) : null}
        <div className="text-muted-foreground text-xs">
          {platformLabel(cand.platform)} · {formatDateTime(cand.publishedAt)}
        </div>
        <div className="text-muted-foreground text-xs">
          cycle {cand.cycleNo}
          {cand.score != null ? ` · score ${cand.score}` : ""}
          {cand.chunkNo != null ? ` · chunk ${cand.chunkNo}` : ""}
        </div>
      </td>
      <td className="max-w-md px-3 py-3">
        <p className="line-clamp-3 text-sm">{cand.text ?? "—"}</p>
        {cand.voided ? (
          <p className="text-failed-foreground text-xs">Void: {cand.voidNote}</p>
        ) : null}
      </td>
      <td className="px-3 py-3">
        {d ? (
          <div className="space-y-1 text-xs">
            {d.decision === "flag" ? (
              <div className="flex flex-wrap items-center gap-1">
                <Chip tone={SEVERITY_TONE[d.severity ?? ""]}>{d.severity}</Chip>
                <Chip>{d.category}</Chip>
              </div>
            ) : (
              <Chip tone="bg-muted text-foreground">{d.exclusion_code}</Chip>
            )}
            <div>{d.decision === "flag" ? `${d.target_group} · ${d.note}` : d.reason}</div>
            <div className="text-muted-foreground">
              {d.read_by_name ?? ws.names.get(d.read_by ?? "") ?? "—"}
              {d.ruling ? " · Curator ruling" : ""}
              {d.judgement_call ? " · judgement call" : ""}
            </div>
            {d.needs_second_reader ? (
              <div>
                {d.second_reader_confirmed ? (
                  <Chip tone="bg-done text-done-foreground">second reader confirmed</Chip>
                ) : d.disputed ? (
                  <Chip tone="bg-failed text-failed-foreground">disputed</Chip>
                ) : (
                  <Chip tone="bg-warn text-warn-foreground">needs a second reader</Chip>
                )}
              </div>
            ) : null}
          </div>
        ) : (
          <Chip tone="bg-queued text-queued-foreground">undecided</Chip>
        )}
      </td>
      <td className="px-3 py-3 text-xs">{d?.decision === "flag" ? tierLabel(tier?.tier) : "—"}</td>
      <td className="px-3 py-3">
        <div className="flex flex-wrap justify-end gap-1.5">
          {!cand.voided && canRead && (!g3 || ws.me.isCurator) ? (
            <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
              {d ? (g3 ? "Rule" : "Re-decide") : "Decide"}
            </Button>
          ) : null}
          {d?.needs_second_reader && !d.second_reader_confirmed && !mine && canRead ? (
            <>
              <Button size="sm" onClick={() => confirm.mutate("confirm")}>
                Confirm
              </Button>
              <Button size="sm" variant="outline" onClick={() => confirm.mutate("disagree")}>
                Disagree
              </Button>
            </>
          ) : null}
          {!cand.voided &&
          !d &&
          ws.has(
            "owner",
            "engagement_lead",
            "lead_analyst",
            "analyst",
            "collection_operator",
            "data_steward",
          ) ? (
            <Button size="sm" variant="ghost" onClick={() => voidIt.mutate()}>
              Void
            </Button>
          ) : null}
        </div>
        <DecideDialog ws={ws} cand={cand} open={open} onOpenChange={setOpen} />
      </td>
    </tr>
  );
}

export function ReadingTab({ ws }: { ws: Workspace }) {
  const [cycle, setCycle] = useState<number | "all">("all");
  const [caseToLink, setCaseToLink] = useState("");
  const [showPool, setShowPool] = useState(false);
  const [tag, setTag] = useState("");
  const g1 = !!ws.gateAt("G1");
  const ready = !!ws.gateAt("G2") && !ws.project.design_stale;
  const liveCases = ws.cases.filter((c) => !c.voided_at);
  const open = [...ws.cycles].reverse().find((c) => !ws.gateAt("G3", c.cycle_no));
  const pool = useCasePool(
    liveCases.map((c) => c.case_id),
    showPool,
  );
  const linkedRefs = new Set(
    ws.candidates.filter((c) => !c.voided && c.cycleNo === open?.cycle_no).map((c) => c.refId),
  );
  const available = (pool.data ?? []).filter((c) => !linkedRefs.has(c.refId));
  const allCases = useCaseOptions(ws, g1);
  const linkCase = useDbAction(
    ws,
    async () => {
      const { error } = await supabase
        .from("project_cases")
        .insert({ project_id: ws.project.id, case_id: caseToLink });
      if (error) throw error;
    },
    "Case folder linked",
    () => setCaseToLink(""),
  );
  const voidCase = useDbAction(
    ws,
    async (id: string) => {
      const note = window.prompt("Why is this case link void?");
      if (!note) throw new Error("A void needs a note");
      const { error } = await supabase
        .from("project_cases")
        .update({ voided_at: new Date().toISOString(), void_note: note })
        .eq("project_id", ws.project.id)
        .eq("case_id", id);
      if (error) throw error;
    },
    "Voided with a note",
  );
  const openCycle = useDbAction(
    ws,
    async () => {
      const { error } = await supabase.from("project_cycles").insert({
        project_id: ws.project.id,
        cycle_no: 0,
        kind: "baseline",
        tag: tag.trim() || null,
      });
      if (error) throw error;
    },
    "Cycle opened",
    () => setTag(""),
  );
  const addItems = useDbAction(
    ws,
    async (items: Candidate[]) => {
      const rows = items.map((i) =>
        i.kind === "cloud_item"
          ? {
              project_id: ws.project.id,
              cycle_no: open!.cycle_no,
              item_kind: "cloud_item",
              item_id: i.refId,
            }
          : {
              project_id: ws.project.id,
              cycle_no: open!.cycle_no,
              item_kind: "home_ref",
              evidence_ref_id: i.refId,
            },
      );
      const { error } = await supabase.from("project_items").insert(rows);
      if (error) throw error;
      return rows.length;
    },
    "Candidates added to the cycle",
  );
  const rows = ws.candidates.filter((c) => cycle === "all" || c.cycleNo === cycle);
  const c = countsFor(ws, cycle === "all" ? undefined : cycle);
  return (
    <div className="space-y-6">
      <Section
        id="cyc-h"
        title="Cycles"
        hint="Cycle 0 is the baseline. Each delta cycle repeats Phases 3 to 7 on the new items only and logs itself. A re-run on the same day gets a time tag instead of overwriting the earlier run. A delta cycle can open only after the previous one passes G4."
      >
        <div className="flex flex-wrap items-center gap-2">
          {ws.cycles.map((cy) => (
            <Chip
              key={cy.id}
              tone={ws.gateAt("G4", cy.cycle_no) ? "bg-done text-done-foreground" : undefined}
            >
              cycle {cy.cycle_no} · {cy.kind}
              {cy.tag ? ` · ${cy.tag}` : ""}
            </Chip>
          ))}
          {!ws.cycles.length ? (
            <span className="text-muted-foreground text-sm">No cycle yet.</span>
          ) : null}
        </div>
        {ready && ws.has("owner", "engagement_lead", "lead_analyst", "collection_operator") ? (
          <div className="mt-4 flex flex-wrap items-end gap-3">
            <TextIn
              label="Time tag (optional)"
              value={tag}
              onChange={setTag}
              placeholder="re-run 14:00"
            />
            <Submit pending={openCycle.isPending} onClick={() => openCycle.mutate()}>
              {ws.cycles.length ? "Open the next delta cycle" : "Open the baseline cycle"}
            </Submit>
          </div>
        ) : (
          <div className="mt-4">
            <Locked>
              {!g1
                ? "No collection until the mandate (G1) is signed."
                : !ready
                  ? "No collection until the design is approved and current (G2)."
                  : "The engagement lead, lead analyst or collection operator opens cycles."}
            </Locked>
          </div>
        )}
      </Section>

      <Section
        id="case-h"
        title="Case folders in scope"
        hint="Scope control: each engagement has its own case folders. Only items from linked cases can become candidates. Nothing from another project is touched."
      >
        <ul className="divide-border divide-y">
          {ws.cases.map((cs) => (
            <li
              key={cs.case_id}
              className={cn(
                "flex items-center justify-between gap-3 py-2",
                cs.voided_at && "opacity-50",
              )}
            >
              <Link
                to="/cases/$caseId"
                params={{ caseId: cs.case_id }}
                className="min-w-0 hover:underline"
              >
                <span className="font-mono text-xs font-bold">CASE-{cs.case_id}</span>{" "}
                <span className="text-muted-foreground text-xs">
                  {cs.target ?? ""}
                  {cs.voided_at ? " · void" : ""}
                </span>
              </Link>
              {!cs.voided_at && ws.has("owner", "engagement_lead", "lead_analyst") ? (
                <Button variant="ghost" size="sm" onClick={() => voidCase.mutate(cs.case_id)}>
                  Void link
                </Button>
              ) : null}
            </li>
          ))}
          {!ws.cases.length ? (
            <li className="text-muted-foreground py-2 text-sm">None linked.</li>
          ) : null}
        </ul>
        {g1 && ws.has("owner", "engagement_lead", "lead_analyst", "collection_operator") ? (
          <div className="mt-4 flex flex-wrap gap-2">
            <select
              aria-label="Case to link"
              className={cn(selectCls, "min-w-64")}
              value={caseToLink}
              onChange={(e) => setCaseToLink(e.target.value)}
            >
              <option value="">Link a case folder…</option>
              {allCases
                .filter((x) => !liveCases.some((l) => l.case_id === x.id))
                .map((x) => (
                  <option key={x.id} value={x.id}>
                    CASE-{x.id}
                    {x.target_of_complaint ? ` · ${x.target_of_complaint}` : ""}
                  </option>
                ))}
            </select>
            <Submit
              pending={linkCase.isPending}
              disabled={!caseToLink}
              onClick={() => linkCase.mutate()}
            >
              Link
            </Submit>
          </div>
        ) : null}
      </Section>

      <Section
        id="cand-h"
        title="Candidates and analyst decisions"
        hint="Machine screening only proposes candidates. An analyst reads every one and records a flag or an exclusion with a reason. A CRITICAL or HIGH flag is confirmed by a second reader before it leaves the case folder. After G3 only a Curator ruling can change a decision."
        actions={
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span>
              {plural(c.candidates, "candidate")} · {c.decided} decided · {c.flagged} flagged ·{" "}
              {c.excluded} excluded
            </span>
            {c.needSecondReader ? (
              <Chip tone="bg-warn text-warn-foreground">
                {c.needSecondReader} need a second reader
              </Chip>
            ) : null}
            {c.judgementCalls ? <Chip>{c.judgementCalls} judgement calls</Chip> : null}
          </div>
        }
      >
        <div className="-m-5">
          <div className="flex flex-wrap gap-1 border-b px-4 py-3">
            {(["all", ...ws.cycles.map((x) => x.cycle_no)] as (number | "all")[]).map((x) => (
              <button
                key={String(x)}
                aria-pressed={cycle === x}
                onClick={() => setCycle(x)}
                className={cn(
                  "min-h-9 rounded-full border px-3 text-xs font-medium",
                  cycle === x ? "bg-foreground text-background" : "hover:bg-muted",
                )}
              >
                {x === "all" ? "All cycles" : `Cycle ${x}`}
              </button>
            ))}
            {open &&
            ready &&
            ws.has(
              "owner",
              "engagement_lead",
              "lead_analyst",
              "analyst",
              "collection_operator",
              "data_steward",
            ) ? (
              <Button
                size="sm"
                variant="outline"
                className="ml-auto"
                onClick={() => setShowPool((v) => !v)}
              >
                <Plus className="size-4" /> {showPool ? "Hide" : "Add"} items from linked cases to
                cycle {open.cycle_no}
              </Button>
            ) : null}
          </div>
          {showPool ? (
            <div className="bg-muted/40 space-y-2 border-b px-4 py-3">
              {pool.isLoading ? (
                <p className="text-muted-foreground text-sm">Loading…</p>
              ) : !available.length ? (
                <p className="text-muted-foreground text-sm">
                  Everything in the linked cases is already in this cycle.
                </p>
              ) : (
                <>
                  <Button
                    size="sm"
                    disabled={addItems.isPending}
                    onClick={() => addItems.mutate(available)}
                  >
                    Add all {available.length}
                  </Button>
                  <ul className="max-h-56 space-y-1 overflow-y-auto">
                    {available.slice(0, 100).map((i) => (
                      <li key={i.refId} className="flex items-center justify-between gap-2 text-sm">
                        <span className="min-w-0 truncate">
                          <span className="font-mono text-xs font-semibold">{i.code}</span>{" "}
                          {i.text?.slice(0, 90)}
                        </span>
                        <Button size="sm" variant="ghost" onClick={() => addItems.mutate([i])}>
                          Add
                        </Button>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          ) : null}
          <div className="relative overflow-x-auto">
            <table className="w-full min-w-[860px] text-sm">
              <thead className="text-muted-foreground text-left text-xs uppercase">
                <tr>
                  <th className="px-3 py-3">Candidate</th>
                  <th className="px-3 py-3">Text</th>
                  <th className="px-3 py-3">Decision</th>
                  <th className="px-3 py-3">Tier</th>
                  <th className="px-3 py-3">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((cand) => (
                  <CandidateRow key={cand.id} ws={ws} cand={cand} />
                ))}
              </tbody>
            </table>
            {!rows.length ? (
              <p className="text-muted-foreground px-4 py-6 text-sm">
                {ready
                  ? "No candidates yet. Add items from the linked cases."
                  : "Candidates appear after the design is approved (G2)."}
              </p>
            ) : null}
          </div>
        </div>
      </Section>
    </div>
  );
}

import { useQuery } from "@tanstack/react-query";
function useCaseOptions(ws: Workspace, enabled: boolean) {
  const q = useQuery({
    queryKey: ["cases-for-engagement"],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cases")
        .select("id, target_of_complaint")
        .order("id", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
  void ws;
  return q.data ?? [];
}
