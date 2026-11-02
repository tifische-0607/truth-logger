import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import {
  AreaIn,
  Chip,
  Locked,
  Section,
  Submit,
  TextIn,
  csvList,
  lines,
  useDbAction,
} from "@/components/engagement/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDateTime } from "@/lib/format";
import { SEVERITIES, TRACEABILITY, formatDay, type Brief, type Workspace } from "@/lib/projects";
import { cn } from "@/lib/utils";

type Fact = { statement: string; source: string; class: "FIRST_HAND" | "REPORTED" | "ASSUMED" };
type Ask = { ask: string; need: "need" | "nice" };
type Notify = { severity: string; who: string; how_fast: string; route: string };
type Draft = {
  situation: string;
  facts: Fact[];
  unknowns: string;
  purpose_decisions: string;
  objectives: string;
  asks: Ask[];
  affected: string;
  recipients: string;
  protectee_or_target: string;
  approver: string;
  platforms: string;
  languages: string;
  window_from: string;
  window_to: string;
  sample_rule: string;
  caps: string;
  in_scope: string;
  out_of_scope: string;
  held_groups: string;
  research_content_note: string;
  who_may_act: string;
  approval_chain: string;
  red_lines: string;
  fa_must_not_say: string;
  notify: Notify[];
  legal: string;
  privacy: string;
  data_handling: string;
  retention_years: string;
  budget: string;
  timeline: string;
  known_risks: string;
  contacts: string;
  rhythm: string;
  signoff_roles: string;
  change_summary: string;
  change_reason: string;
  requested_by: string;
  scope_changed: boolean;
};
const s = (v: unknown) => (typeof v === "string" ? v : v == null ? "" : String(v));
const obj = (v: unknown) => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});

function draftFrom(b: Brief | null): Draft {
  const a = obj(b?.audiences),
    r = obj(b?.response_parameters),
    c = obj(b?.constraints_risks),
    g = obj(b?.governance);
  const facts = ((b?.facts as unknown as Fact[]) ?? []).map((f) => ({
    statement: s(f.statement),
    source: s(f.source),
    class: f.class,
  }));
  const asks = ((b?.ranked_asks as unknown as { ask: string; need: "need" | "nice" }[]) ?? []).map(
    (x) => ({ ask: s(x.ask), need: x.need }),
  );
  const notify = ((r["notify"] as Notify[]) ?? []).map((n) => ({
    severity: s(n.severity),
    who: s(n.who),
    how_fast: s(n.how_fast),
    route: s(n.route),
  }));
  return {
    situation: s(b?.situation),
    facts: facts.length ? facts : [{ statement: "", source: "", class: "REPORTED" }],
    unknowns: (b?.unknowns ?? []).join("\n"),
    purpose_decisions: s(b?.purpose_decisions),
    objectives: (b?.objectives ?? []).join("\n"),
    asks: asks.length ? asks : [{ ask: "", need: "need" }],
    affected: s(a["affected"]),
    recipients: s(a["recipients"]),
    protectee_or_target: s(a["protectee_or_target"]),
    approver: s(a["approver"]),
    platforms: (b?.platforms ?? []).join(", "),
    languages: (b?.languages ?? []).join(", "),
    window_from: s(b?.window_from),
    window_to: s(b?.window_to),
    sample_rule: s(b?.sample_rule),
    caps: s(b?.caps),
    in_scope: s(b?.in_scope),
    out_of_scope: s(b?.out_of_scope),
    held_groups: s(b?.held_groups),
    research_content_note: s(b?.research_content_note),
    who_may_act: s(r["who_may_act"]),
    approval_chain: s(r["approval_chain"]),
    red_lines: s(r["red_lines"]),
    fa_must_not_say: s(r["fa_must_not_say"]),
    notify: notify.length ? notify : [{ severity: "CRITICAL", who: "", how_fast: "", route: "" }],
    legal: s(c["legal"]),
    privacy: s(c["privacy"]),
    data_handling: s(c["data_handling"]),
    retention_years: s(c["retention_years"] ?? "5"),
    budget: s(c["budget"]),
    timeline: s(c["timeline"]),
    known_risks: s(c["known_risks"]),
    contacts: s(g["contacts"]),
    rhythm: s(g["rhythm"]),
    signoff_roles: s(g["signoff_roles"]),
    change_summary: "",
    change_reason: "",
    requested_by: "",
    scope_changed: false,
  };
}

const CLASS_HELP =
  "FIRST_HAND: seen directly. REPORTED: told to us. ASSUMED: believed but not checked. Unknowns go in their own list, never filled with guesses.";

function BriefForm({ ws, amend, onDone }: { ws: Workspace; amend: boolean; onDone: () => void }) {
  const [d, setD] = useState<Draft>(() => draftFrom(ws.briefInForce ?? ws.draft));
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }));
  const save = useDbAction(
    ws,
    async () => {
      const { error } = await supabase.from("project_briefs").insert({
        project_id: ws.project.id,
        version: 0,
        situation: d.situation.trim() || null,
        facts: d.facts
          .filter((f) => f.statement.trim())
          .map((f) => ({ statement: f.statement.trim(), source: f.source.trim(), class: f.class })),
        unknowns: lines(d.unknowns),
        purpose_decisions: d.purpose_decisions.trim() || null,
        objectives: lines(d.objectives),
        ranked_asks: d.asks
          .filter((a) => a.ask.trim())
          .map((a, i) => ({ rank: i + 1, ask: a.ask.trim(), need: a.need })),
        audiences: {
          affected: d.affected.trim(),
          recipients: d.recipients.trim(),
          protectee_or_target: d.protectee_or_target.trim(),
          approver: d.approver.trim(),
        },
        platforms: csvList(d.platforms),
        languages: csvList(d.languages),
        window_from: d.window_from || null,
        window_to: d.window_to || null,
        sample_rule: d.sample_rule.trim() || null,
        caps: d.caps.trim() || null,
        in_scope: d.in_scope.trim() || null,
        out_of_scope: d.out_of_scope.trim() || null,
        held_groups: d.held_groups.trim() || null,
        research_content_note: d.research_content_note.trim() || null,
        response_parameters: {
          who_may_act: d.who_may_act.trim(),
          approval_chain: d.approval_chain.trim(),
          red_lines: d.red_lines.trim(),
          fa_must_not_say: d.fa_must_not_say.trim(),
          notify: d.notify.filter((n) => n.who.trim()).map((n) => ({ ...n })),
        },
        constraints_risks: {
          legal: d.legal.trim(),
          privacy: d.privacy.trim(),
          data_handling: d.data_handling.trim(),
          retention_years: Number(d.retention_years) || 5,
          budget: d.budget.trim(),
          timeline: d.timeline.trim(),
          known_risks: d.known_risks.trim(),
        },
        governance: {
          contacts: d.contacts.trim(),
          rhythm: d.rhythm.trim(),
          signoff_roles: d.signoff_roles.trim(),
        },
        ...(amend
          ? {
              change_summary: d.change_summary.trim(),
              change_reason: d.change_reason.trim(),
              requested_by: d.requested_by.trim(),
              scope_changed: d.scope_changed,
            }
          : {}),
        authored_by_name: ws.me.name || null,
      });
      if (error) throw error;
    },
    amend ? "Amendment proposed — it takes effect when the Curator approves it" : "Draft saved",
    onDone,
  );
  const num = (n: number, t: string) => `${n} · ${t}`;
  return (
    <div className="space-y-6">
      {amend ? (
        <Section
          id="am-h"
          title="Amendment"
          hint="After G0 the brief changes only through a numbered amendment (A1, A2…): what changed, why, who asked. The Curator approves it. A change to scope or lexicon bumps the design sheet."
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <AreaIn
              label="What changed"
              value={d.change_summary}
              onChange={(v) => set("change_summary", v)}
              rows={2}
            />
            <AreaIn
              label="Why"
              value={d.change_reason}
              onChange={(v) => set("change_reason", v)}
              rows={2}
            />
            <TextIn
              label="Who asked"
              value={d.requested_by}
              onChange={(v) => set("requested_by", v)}
            />
            <label className="flex min-h-11 items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="size-5"
                checked={d.scope_changed}
                onChange={(e) => set("scope_changed", e.target.checked)}
              />
              Changes scope or lexicon (design must be approved again, G2)
            </label>
          </div>
        </Section>
      ) : null}

      <Section id="s1" title={num(1, "Situation")} hint={CLASS_HELP}>
        <div className="grid gap-4">
          <AreaIn
            label="What is happening, since when, what has happened so far"
            value={d.situation}
            onChange={(v) => set("situation", v)}
          />
          {d.facts.map((f, i) => (
            <div key={i} className="grid gap-2 sm:grid-cols-[1fr_12rem_9rem_auto]">
              <Input
                aria-label={`Fact ${i + 1}`}
                placeholder="Fact"
                value={f.statement}
                onChange={(e) =>
                  set(
                    "facts",
                    d.facts.map((x, j) => (j === i ? { ...x, statement: e.target.value } : x)),
                  )
                }
              />
              <Input
                aria-label={`Fact ${i + 1} source`}
                placeholder="Attributed to"
                value={f.source}
                onChange={(e) =>
                  set(
                    "facts",
                    d.facts.map((x, j) => (j === i ? { ...x, source: e.target.value } : x)),
                  )
                }
              />
              <select
                aria-label={`Fact ${i + 1} class`}
                className="border-input bg-background min-h-9 rounded-md border px-2 text-sm"
                value={f.class}
                onChange={(e) =>
                  set(
                    "facts",
                    d.facts.map((x, j) =>
                      j === i ? { ...x, class: e.target.value as Fact["class"] } : x,
                    ),
                  )
                }
              >
                <option value="FIRST_HAND">First-hand</option>
                <option value="REPORTED">Reported</option>
                <option value="ASSUMED">Assumed</option>
              </select>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Remove fact"
                onClick={() =>
                  set(
                    "facts",
                    d.facts.filter((_, j) => j !== i),
                  )
                }
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          ))}
          <div>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                set("facts", [...d.facts, { statement: "", source: "", class: "REPORTED" }])
              }
            >
              <Plus className="size-4" /> Add fact
            </Button>
          </div>
          <AreaIn
            label="Unknowns (one per line)"
            value={d.unknowns}
            onChange={(v) => set("unknowns", v)}
            rows={2}
          />
        </div>
      </Section>

      <Section
        id="s2"
        title={num(2, "Purpose and decisions")}
        hint="Ask: what will you do differently once you have this? If there is no answer, the work has no purpose yet."
      >
        <div className="grid gap-4">
          <AreaIn
            label="The decisions the output must support"
            value={d.purpose_decisions}
            onChange={(v) => set("purpose_decisions", v)}
          />
          <AreaIn
            label="Top objectives (at most two, one per line)"
            value={d.objectives}
            onChange={(v) => set("objectives", v)}
            rows={2}
          />
          {d.asks.map((a, i) => (
            <div key={i} className="grid gap-2 sm:grid-cols-[2rem_1fr_9rem_auto] sm:items-center">
              <span className="text-muted-foreground font-mono text-sm">{i + 1}</span>
              <Input
                aria-label={`Ranked ask ${i + 1}`}
                placeholder="Ranked ask. What is not ranked is not scoped."
                value={a.ask}
                onChange={(e) =>
                  set(
                    "asks",
                    d.asks.map((x, j) => (j === i ? { ...x, ask: e.target.value } : x)),
                  )
                }
              />
              <select
                aria-label={`Ask ${i + 1} need`}
                className="border-input bg-background min-h-9 rounded-md border px-2 text-sm"
                value={a.need}
                onChange={(e) =>
                  set(
                    "asks",
                    d.asks.map((x, j) =>
                      j === i ? { ...x, need: e.target.value as Ask["need"] } : x,
                    ),
                  )
                }
              >
                <option value="need">Need</option>
                <option value="nice">Nice to have</option>
              </select>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Remove ask"
                onClick={() =>
                  set(
                    "asks",
                    d.asks.filter((_, j) => j !== i),
                  )
                }
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          ))}
          <div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => set("asks", [...d.asks, { ask: "", need: "need" }])}
            >
              <Plus className="size-4" /> Add ask
            </Button>
          </div>
        </div>
      </Section>

      <Section id="s3" title={num(3, "Audiences and stakeholders")}>
        <div className="grid gap-4 sm:grid-cols-2">
          <AreaIn
            label="Who is affected"
            value={d.affected}
            onChange={(v) => set("affected", v)}
            rows={2}
          />
          <AreaIn
            label="Who needs the output"
            value={d.recipients}
            onChange={(v) => set("recipients", v)}
            rows={2}
          />
          <AreaIn
            label="Protectee or target of monitoring"
            value={d.protectee_or_target}
            onChange={(v) => set("protectee_or_target", v)}
            rows={2}
          />
          <AreaIn
            label="Who approves"
            value={d.approver}
            onChange={(v) => set("approver", v)}
            rows={2}
          />
        </div>
      </Section>

      <Section id="s4" title={num(4, "Scope and exclusions")}>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextIn
            label="Platforms (comma separated)"
            value={d.platforms}
            onChange={(v) => set("platforms", v)}
          />
          <TextIn
            label="Languages (comma separated)"
            value={d.languages}
            onChange={(v) => set("languages", v)}
          />
          <TextIn
            label="Window from"
            type="date"
            value={d.window_from}
            onChange={(v) => set("window_from", v)}
          />
          <TextIn
            label="Window to"
            type="date"
            value={d.window_to}
            onChange={(v) => set("window_to", v)}
          />
          <TextIn
            label="Sample rule"
            value={d.sample_rule}
            onChange={(v) => set("sample_rule", v)}
            hint="Last N posts (L5, L30), a date window, or a hashtag."
          />
          <TextIn
            label="Caps"
            value={d.caps}
            onChange={(v) => set("caps", v)}
            hint="Comment cap per post and the order comments are served. Comments beyond the cap are not seen."
          />
          <AreaIn
            label="In scope: accounts and topics"
            value={d.in_scope}
            onChange={(v) => set("in_scope", v)}
            rows={2}
          />
          <AreaIn
            label="Out of scope, and why"
            value={d.out_of_scope}
            onChange={(v) => set("out_of_scope", v)}
            rows={2}
          />
          <AreaIn
            className="sm:col-span-2"
            label="Groups held as out-of-mandate"
            value={d.held_groups}
            onChange={(v) => set("held_groups", v)}
            rows={2}
            hint="Hostility at these groups is held for the Curator, not deleted."
          />
        </div>
      </Section>

      <Section
        id="s5"
        title={num(5, "Research content supplied")}
        hint="Each item the client supplies is logged in the intake register (Discovery tab) with its hash, sensitivity and use class. Client research is a client claim until FA's own collection supports it."
      >
        <AreaIn
          label="Note on the research content"
          value={d.research_content_note}
          onChange={(v) => set("research_content_note", v)}
          rows={2}
        />
      </Section>

      <Section
        id="s6"
        title={num(6, "Response parameters")}
        hint="Decided in calm conditions, not during an incident."
      >
        <div className="grid gap-4">
          {d.notify.map((n, i) => (
            <div key={i} className="grid gap-2 sm:grid-cols-[9rem_1fr_10rem_10rem_auto]">
              <select
                aria-label={`Notify ${i + 1} severity`}
                className="border-input bg-background min-h-9 rounded-md border px-2 text-sm"
                value={n.severity}
                onChange={(e) =>
                  set(
                    "notify",
                    d.notify.map((x, j) => (j === i ? { ...x, severity: e.target.value } : x)),
                  )
                }
              >
                {SEVERITIES.map((v) => (
                  <option key={v.id}>{v.id}</option>
                ))}
              </select>
              <Input
                aria-label={`Notify ${i + 1} who`}
                placeholder="Who is notified"
                value={n.who}
                onChange={(e) =>
                  set(
                    "notify",
                    d.notify.map((x, j) => (j === i ? { ...x, who: e.target.value } : x)),
                  )
                }
              />
              <Input
                aria-label={`Notify ${i + 1} how fast`}
                placeholder="How fast"
                value={n.how_fast}
                onChange={(e) =>
                  set(
                    "notify",
                    d.notify.map((x, j) => (j === i ? { ...x, how_fast: e.target.value } : x)),
                  )
                }
              />
              <Input
                aria-label={`Notify ${i + 1} route`}
                placeholder="By what route"
                value={n.route}
                onChange={(e) =>
                  set(
                    "notify",
                    d.notify.map((x, j) => (j === i ? { ...x, route: e.target.value } : x)),
                  )
                }
              />
              <Button
                variant="ghost"
                size="icon"
                aria-label="Remove row"
                onClick={() =>
                  set(
                    "notify",
                    d.notify.filter((_, j) => j !== i),
                  )
                }
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          ))}
          <div>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                set("notify", [...d.notify, { severity: "HIGH", who: "", how_fast: "", route: "" }])
              }
            >
              <Plus className="size-4" /> Add severity row
            </Button>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <AreaIn
              label="Who may act on a finding"
              value={d.who_may_act}
              onChange={(v) => set("who_may_act", v)}
              rows={2}
            />
            <AreaIn
              label="Approval chain"
              value={d.approval_chain}
              onChange={(v) => set("approval_chain", v)}
              rows={2}
            />
            <AreaIn
              label="Red lines (off-limits)"
              value={d.red_lines}
              onChange={(v) => set("red_lines", v)}
              rows={2}
              hint="Public statement, contact with accounts, escalation to authorities…"
            />
            <AreaIn
              label="What FA must not do or say"
              value={d.fa_must_not_say}
              onChange={(v) => set("fa_must_not_say", v)}
              rows={2}
            />
          </div>
        </div>
      </Section>

      <Section
        id="s7"
        title={num(7, "Scenarios") + " and " + num(8, "Success measures")}
        hint="These live in their own registers (next tab) and are part of the brief the sponsor signs."
      >
        <p className="text-muted-foreground text-sm">
          {ws.scenarios.length} scenario(s) and {ws.measures.length} success measure(s) recorded.
        </p>
      </Section>

      <Section id="s9" title={num(9, "Constraints and risks")}>
        <div className="grid gap-4 sm:grid-cols-2">
          <AreaIn label="Legal" value={d.legal} onChange={(v) => set("legal", v)} rows={2} />
          <AreaIn label="Privacy" value={d.privacy} onChange={(v) => set("privacy", v)} rows={2} />
          <AreaIn
            label="Data handling"
            value={d.data_handling}
            onChange={(v) => set("data_handling", v)}
            rows={2}
          />
          <TextIn
            label="Retention (years)"
            type="number"
            value={d.retention_years}
            onChange={(v) => set("retention_years", v)}
            hint="Five years unless the client contract says otherwise."
          />
          <TextIn label="Budget" value={d.budget} onChange={(v) => set("budget", v)} />
          <TextIn label="Timeline" value={d.timeline} onChange={(v) => set("timeline", v)} />
          <AreaIn
            className="sm:col-span-2"
            label="Known risks to the engagement"
            value={d.known_risks}
            onChange={(v) => set("known_risks", v)}
            rows={2}
          />
        </div>
      </Section>

      <Section
        id="s10"
        title={num(10, "Governance")}
        hint="Section 11, the sign-off, is recorded at gate G0 (Gates tab)."
      >
        <div className="grid gap-4 sm:grid-cols-3">
          <AreaIn
            label="Contacts"
            value={d.contacts}
            onChange={(v) => set("contacts", v)}
            rows={2}
          />
          <AreaIn
            label="Meeting rhythm"
            value={d.rhythm}
            onChange={(v) => set("rhythm", v)}
            rows={2}
          />
          <AreaIn
            label="Sign-off roles"
            value={d.signoff_roles}
            onChange={(v) => set("signoff_roles", v)}
            rows={2}
          />
        </div>
      </Section>

      <div className="flex flex-wrap gap-2">
        <Submit
          pending={save.isPending}
          disabled={
            amend && (!d.change_summary.trim() || !d.change_reason.trim() || !d.requested_by.trim())
          }
          onClick={() => save.mutate()}
        >
          {amend ? "Propose amendment" : "Save draft"}
        </Submit>
        <Button variant="outline" className="min-h-11" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

function BriefView({ b }: { b: Brief }) {
  const row = (label: string, value: string | null | undefined) =>
    value ? (
      <div className="space-y-1">
        <div className="text-muted-foreground text-xs font-semibold uppercase">{label}</div>
        <p className="text-sm whitespace-pre-wrap">{value}</p>
      </div>
    ) : null;
  const a = obj(b.audiences),
    r = obj(b.response_parameters),
    c = obj(b.constraints_risks),
    g = obj(b.governance);
  const facts = (b.facts as unknown as Fact[]) ?? [];
  const asks = (b.ranked_asks as unknown as { ask: string; need: string }[]) ?? [];
  return (
    <div className="space-y-5">
      {row("1 · Situation", b.situation)}
      {facts.length ? (
        <ul className="space-y-1 text-sm">
          {facts.map((f, i) => (
            <li key={i}>
              <Chip>{f.class.replace("_", "-")}</Chip> {f.statement}{" "}
              <span className="text-muted-foreground">— {f.source || "unattributed"}</span>
            </li>
          ))}
        </ul>
      ) : null}
      {b.unknowns.length ? row("Unknowns", b.unknowns.join("\n")) : null}
      {row("2 · Purpose and decisions", b.purpose_decisions)}
      {row("Objectives", b.objectives.join("\n"))}
      {asks.length
        ? row(
            "Ranked asks",
            asks
              .map((x, i) => `${i + 1}. ${x.ask} (${x.need === "need" ? "need" : "nice to have"})`)
              .join("\n"),
          )
        : null}
      {row(
        "3 · Audiences",
        [
          `Affected: ${s(a["affected"])}`,
          `Recipients: ${s(a["recipients"])}`,
          `Protectee or target: ${s(a["protectee_or_target"])}`,
          `Approver: ${s(a["approver"])}`,
        ].join("\n"),
      )}
      {row(
        "4 · Scope",
        [
          `Platforms: ${b.platforms.join(", ")}`,
          `Languages: ${b.languages.join(", ")}`,
          `Window: ${formatDay(b.window_from)} to ${formatDay(b.window_to)}`,
          `Sample rule: ${s(b.sample_rule)}`,
          `Caps: ${s(b.caps)}`,
          `In scope: ${s(b.in_scope)}`,
          `Out of scope: ${s(b.out_of_scope)}`,
          `Held out-of-mandate: ${s(b.held_groups)}`,
        ].join("\n"),
      )}
      {row(
        "6 · Response parameters",
        [
          `May act: ${s(r["who_may_act"])}`,
          `Approval chain: ${s(r["approval_chain"])}`,
          `Red lines: ${s(r["red_lines"])}`,
          `FA must not: ${s(r["fa_must_not_say"])}`,
          ...((r["notify"] as Notify[]) ?? []).map(
            (n) => `${n.severity}: ${n.who}, ${n.how_fast}, ${n.route}`,
          ),
        ].join("\n"),
      )}
      {row(
        "9 · Constraints and risks",
        [
          `Legal: ${s(c["legal"])}`,
          `Privacy: ${s(c["privacy"])}`,
          `Data handling: ${s(c["data_handling"])}`,
          `Retention: ${s(c["retention_years"])} years`,
          `Budget: ${s(c["budget"])}`,
          `Timeline: ${s(c["timeline"])}`,
          `Risks: ${s(c["known_risks"])}`,
        ].join("\n"),
      )}
      {row(
        "10 · Governance",
        [
          `Contacts: ${s(g["contacts"])}`,
          `Rhythm: ${s(g["rhythm"])}`,
          `Sign-off: ${s(g["signoff_roles"])}`,
        ].join("\n"),
      )}
    </div>
  );
}

export function BriefTab({ ws }: { ws: Workspace }) {
  const [editing, setEditing] = useState(false);
  const [viewId, setViewId] = useState<string | null>(null);
  const g0 = ws.gateAt("G0");
  const shown = ws.briefs.find((b) => b.id === viewId) ?? ws.briefInForce ?? ws.briefs[0] ?? null;
  const approvalFor = (b: Brief) => ws.approvals.find((a) => a.brief_id === b.id);
  const decide = useDbAction(
    ws,
    async (v: { id: string; decision: "approved" | "rejected" }) => {
      const { error } = await supabase.from("project_amendment_approvals").insert({
        project_id: ws.project.id,
        brief_id: v.id,
        decision: v.decision,
        decided_by_name: ws.me.name || null,
      });
      if (error) throw error;
    },
    "Decision recorded",
  );

  if (editing) return <BriefForm ws={ws} amend={!!g0} onDone={() => setEditing(false)} />;
  const canWrite = ws.has("owner", "engagement_lead");
  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="space-y-6 lg:col-span-2">
        {shown ? (
          <Section
            id="brief-h"
            title={`Brief · v${shown.version}${shown.amendment_no ? ` · amendment A${shown.amendment_no}` : shown.kind === "draft" ? " · draft" : ""}`}
            hint={shown.id === ws.briefInForce?.id ? "In force." : "Not the version in force."}
            actions={
              shown.id === ws.briefInForce?.id ? (
                <Chip tone="bg-done text-done-foreground">In force</Chip>
              ) : (
                <Button size="sm" variant="outline" onClick={() => setViewId(null)}>
                  Show the one in force
                </Button>
              )
            }
          >
            {shown.amendment_no ? (
              <div className="bg-muted mb-4 space-y-1 rounded-lg p-3 text-sm">
                <p>
                  <strong>What changed:</strong> {shown.change_summary}
                </p>
                <p>
                  <strong>Why:</strong> {shown.change_reason}
                </p>
                <p>
                  <strong>Asked by:</strong> {shown.requested_by}
                  {shown.scope_changed ? " · changes scope or lexicon" : ""}
                </p>
                {(() => {
                  const ap = approvalFor(shown);
                  return ap ? (
                    <p>
                      <strong>{ap.decision === "approved" ? "Approved" : "Rejected"}</strong> by the
                      Curator {formatDateTime(ap.decided_at)}
                      {ap.note ? ` — ${ap.note}` : ""}
                    </p>
                  ) : (
                    <p className="font-semibold">Waiting for the Curator</p>
                  );
                })()}
                {ws.me.isCurator && !approvalFor(shown) ? (
                  <div className="flex gap-2 pt-2">
                    <Button
                      size="sm"
                      onClick={() => decide.mutate({ id: shown.id, decision: "approved" })}
                    >
                      Approve amendment
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => decide.mutate({ id: shown.id, decision: "rejected" })}
                    >
                      Reject
                    </Button>
                  </div>
                ) : null}
              </div>
            ) : null}
            <BriefView b={shown} />
          </Section>
        ) : (
          <Locked>
            No brief yet. The engagement lead writes it after the discovery interviews; if the
            client cannot supply one, FA drafts it and the client still signs.
          </Locked>
        )}
        <Section
          id="trace-h"
          title="Brief-to-phase traceability"
          hint="Every field of the signed brief has a destination. A field with no destination is removed; a phase decision with no source field is flagged as an assumption."
        >
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead className="text-muted-foreground text-left text-xs uppercase">
                <tr>
                  <th className="py-2 pr-3">Brief section</th>
                  <th className="py-2 pr-3">Used in</th>
                  <th className="py-2">How</th>
                </tr>
              </thead>
              <tbody>
                {TRACEABILITY.map((t) => (
                  <tr key={t.n} className="border-t">
                    <td className="py-2 pr-3">
                      {t.n} {t.section}
                    </td>
                    <td className="py-2 pr-3">{t.used}</td>
                    <td className="py-2">{t.how}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      </div>
      <div className="space-y-6">
        {canWrite ? (
          <Button className="min-h-11 w-full" onClick={() => setEditing(true)}>
            {g0
              ? "Propose an amendment"
              : ws.draft
                ? "Edit as a new draft version"
                : "Write the brief"}
          </Button>
        ) : (
          <Locked>The engagement lead writes the brief.</Locked>
        )}
        <section className="panel overflow-hidden" aria-labelledby="ver-h">
          <h2 id="ver-h" className="border-b px-5 py-4 font-semibold">
            Versions and amendments
          </h2>
          <ul className="divide-border divide-y">
            {ws.briefs.map((b) => {
              const ap = approvalFor(b);
              return (
                <li key={b.id}>
                  <button
                    onClick={() => setViewId(b.id)}
                    className={cn(
                      "hover:bg-muted w-full px-5 py-3 text-left",
                      b.id === shown?.id && "bg-muted",
                    )}
                  >
                    <div className="flex flex-wrap items-center gap-2 text-sm font-medium">
                      v{b.version}
                      {b.amendment_no ? ` · A${b.amendment_no}` : ""}
                      {b.id === ws.briefInForce?.id ? (
                        <Chip tone="bg-done text-done-foreground">in force</Chip>
                      ) : null}
                      {b.amendment_no && !ap ? (
                        <Chip tone="bg-warn text-warn-foreground">awaiting Curator</Chip>
                      ) : null}
                      {ap?.decision === "rejected" ? (
                        <Chip tone="bg-failed text-failed-foreground">rejected</Chip>
                      ) : null}
                    </div>
                    <div className="text-muted-foreground text-xs">
                      {formatDateTime(b.authored_at)}
                      {b.authored_by_name ? ` · ${b.authored_by_name}` : ""}
                    </div>
                    {b.change_summary ? (
                      <div className="mt-1 text-xs">{b.change_summary}</div>
                    ) : null}
                  </button>
                </li>
              );
            })}
            {!ws.briefs.length ? (
              <li className="text-muted-foreground px-5 py-3 text-sm">None yet.</li>
            ) : null}
          </ul>
          <p className="text-muted-foreground border-t px-5 py-3 text-xs">
            Briefs are never edited. Before G0 each save is a draft version; after G0 only numbered
            amendments, approved by the Curator, take effect.
          </p>
        </section>
      </div>
    </div>
  );
}
