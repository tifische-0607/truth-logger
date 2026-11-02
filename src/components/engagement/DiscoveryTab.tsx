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
  lines,
  useDbAction,
} from "@/components/engagement/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDateTime } from "@/lib/format";
import { TRACEABILITY, formatDay, type Workspace } from "@/lib/projects";

const selectCls = "border-input bg-background min-h-11 rounded-md border px-3 text-sm";
type Stmt = { text: string; class: "FIRST_HAND" | "REPORTED" | "ASSUMED" };

function InterviewForm({ ws }: { ws: Workspace }) {
  const staff = ws.members.filter((m) => m.role !== "client_viewer");
  const [who, setWho] = useState("");
  const [role, setRole] = useState("");
  const [at, setAt] = useState("");
  const [mins, setMins] = useState("");
  const [by, setBy] = useState(ws.me.uid ?? "");
  const [notes, setNotes] = useState("");
  const [stmts, setStmts] = useState<Stmt[]>([{ text: "", class: "FIRST_HAND" }]);
  const [prio, setPrio] = useState("");
  const [dis, setDis] = useState("");
  const [act, setAct] = useState("");
  const [rb, setRb] = useState(false);
  const save = useDbAction(
    ws,
    async () => {
      const { error } = await supabase.from("project_interviews").insert({
        project_id: ws.project.id,
        interviewee: who.trim(),
        interviewee_role: role.trim(),
        held_at: new Date(at).toISOString(),
        duration_min: Number(mins) || null,
        interviewer: by,
        interviewer_name: ws.names.get(by) ?? null,
        note_taker: notes,
        note_taker_name: ws.names.get(notes) ?? null,
        key_statements: stmts
          .filter((s) => s.text.trim())
          .map((s) => ({ text: s.text.trim(), class: s.class })),
        priorities: lines(prio),
        disagreements: dis.trim() || null,
        actions: act.trim() || null,
        readback_confirmed: rb,
      });
      if (error) throw error;
    },
    "Interview recorded",
    () => {
      setWho("");
      setRole("");
      setStmts([{ text: "", class: "FIRST_HAND" }]);
      setPrio("");
      setDis("");
      setAct("");
      setRb(false);
    },
  );
  return (
    <div className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <TextIn label="Interviewee" value={who} onChange={setWho} />
        <TextIn
          label="Role"
          value={role}
          onChange={setRole}
          hint="Sponsor first, then operational lead, subject experts, legal or risk, front-line communicators."
        />
        <TextIn label="Held at" type="datetime-local" value={at} onChange={setAt} />
        <TextIn label="Duration (minutes)" type="number" value={mins} onChange={setMins} />
        <div className="grid gap-1.5">
          <label className="text-sm font-medium" htmlFor="iv-by">
            Interviewer
          </label>
          <select
            id="iv-by"
            className={selectCls}
            value={by}
            onChange={(e) => setBy(e.target.value)}
          >
            <option value="">Choose</option>
            {staff.map((m) => (
              <option key={m.user_id} value={m.user_id}>
                {m.name}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1.5">
          <label className="text-sm font-medium" htmlFor="iv-nt">
            Note-taker (a different person)
          </label>
          <select
            id="iv-nt"
            className={selectCls}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          >
            <option value="">Choose</option>
            {staff
              .filter((m) => m.user_id !== by)
              .map((m) => (
                <option key={m.user_id} value={m.user_id}>
                  {m.name}
                </option>
              ))}
          </select>
        </div>
      </div>
      <div className="grid gap-2">
        <span className="text-sm font-medium">
          Key statements, verbatim, in the client's own words
        </span>
        {stmts.map((st, i) => (
          <div key={i} className="grid gap-2 sm:grid-cols-[1fr_9rem_auto]">
            <Input
              aria-label={`Statement ${i + 1}`}
              value={st.text}
              onChange={(e) =>
                setStmts(stmts.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))
              }
            />
            <select
              aria-label={`Statement ${i + 1} class`}
              className="border-input bg-background min-h-9 rounded-md border px-2 text-sm"
              value={st.class}
              onChange={(e) =>
                setStmts(
                  stmts.map((x, j) =>
                    j === i ? { ...x, class: e.target.value as Stmt["class"] } : x,
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
              aria-label="Remove"
              onClick={() => setStmts(stmts.filter((_, j) => j !== i))}
            >
              <Trash2 className="size-4" />
            </Button>
          </div>
        ))}
        <div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setStmts([...stmts, { text: "", class: "REPORTED" }])}
          >
            <Plus className="size-4" /> Add statement
          </Button>
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <AreaIn label="Priorities ranked (one per line)" value={prio} onChange={setPrio} rows={3} />
        <AreaIn
          label="Disagreements with other interviewees"
          value={dis}
          onChange={setDis}
          rows={3}
        />
        <AreaIn label="Actions and documents promised" value={act} onChange={setAct} rows={3} />
      </div>
      <label className="flex min-h-11 items-center gap-2 text-sm">
        <input
          type="checkbox"
          className="size-5"
          checked={rb}
          onChange={(e) => setRb(e.target.checked)}
        />{" "}
        Key points read back to the interviewee
      </label>
      <div>
        <Submit
          pending={save.isPending}
          disabled={!who.trim() || !role.trim() || !at || !by || !notes}
          onClick={() => save.mutate()}
        >
          Record interview
        </Submit>
      </div>
    </div>
  );
}

function IntakeForm({ ws }: { ws: Workspace }) {
  const [f, setF] = useState({
    description: "",
    produced_by: "",
    produced_for: "",
    produced_on: "",
    received_on: "",
    sha256: "",
    sensitivity: "client_confidential",
    personal: false,
    claim: "CLIENT_CLAIM",
    use: "CONTEXT",
    note: "",
    declined: false,
    reason: "",
  });
  const set = (k: keyof typeof f, v: string | boolean) => setF((x) => ({ ...x, [k]: v }));
  const save = useDbAction(
    ws,
    async () => {
      const { error } = await supabase.from("project_intake_items").insert({
        project_id: ws.project.id,
        description: f.description.trim(),
        produced_by: f.produced_by.trim() || null,
        produced_for: f.produced_for.trim() || null,
        produced_on: f.produced_on || null,
        received_on: f.received_on,
        sha256: f.sha256.trim().toLowerCase(),
        sensitivity: f.sensitivity,
        personal_data: f.personal,
        claim_status: f.claim,
        use_class: f.declined ? "NOT_USED" : f.use,
        verification_note: f.note.trim() || null,
        declined: f.declined,
        decline_reason: f.declined ? f.reason.trim() : null,
        logged_by_name: ws.me.name || null,
      });
      if (error) throw error;
    },
    "Logged in the intake register",
    () => setF({ ...f, description: "", sha256: "", note: "", declined: false, reason: "" }),
  );
  const sel = (label: string, k: keyof typeof f, opts: [string, string][]) => (
    <div className="grid gap-1.5">
      <label className="text-sm font-medium" htmlFor={`in-${k}`}>
        {label}
      </label>
      <select
        id={`in-${k}`}
        className={selectCls}
        value={String(f[k])}
        onChange={(e) => set(k, e.target.value)}
      >
        {opts.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </div>
  );
  return (
    <div className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <AreaIn
          className="sm:col-span-2"
          label="What it is"
          value={f.description}
          onChange={(v) => set("description", v)}
          rows={2}
        />
        <TextIn label="Produced by" value={f.produced_by} onChange={(v) => set("produced_by", v)} />
        <TextIn
          label="Produced for"
          value={f.produced_for}
          onChange={(v) => set("produced_for", v)}
        />
        <TextIn
          label="Date produced"
          type="date"
          value={f.produced_on}
          onChange={(v) => set("produced_on", v)}
        />
        <TextIn
          label="Date received"
          type="date"
          value={f.received_on}
          onChange={(v) => set("received_on", v)}
        />
        <TextIn
          className="sm:col-span-2"
          label="SHA-256 of the file as received"
          value={f.sha256}
          onChange={(v) => set("sha256", v)}
          hint="64 hex characters, computed when the file arrived."
        />
        {sel("Sensitivity", "sensitivity", [
          ["public", "Public"],
          ["client_confidential", "Client-confidential"],
        ])}
        {sel("Claim status", "claim", [
          ["CLIENT_CLAIM", "Client claim"],
          ["UNVERIFIED_THIRD_PARTY", "Unverified third party"],
          ["FACT_CHECKED_BY_FA", "Fact-checked by FA"],
        ])}
        {sel("Use class", "use", [
          ["SEED", "Seed (lexicon or target list)"],
          ["BASELINE", "Baseline (comparison)"],
          ["CONTEXT", "Context only"],
          ["NOT_USED", "Not used"],
        ])}
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="size-5"
            checked={f.personal}
            onChange={(e) => set("personal", e.target.checked)}
          />{" "}
          Personal data present
        </label>
        <AreaIn
          className="sm:col-span-2"
          label="Verification note (what FA did to check it, and the result)"
          value={f.note}
          onChange={(v) => set("note", v)}
          rows={2}
        />
        <label className="flex min-h-11 items-center gap-2 text-sm sm:col-span-2">
          <input
            type="checkbox"
            className="size-5"
            checked={f.declined}
            onChange={(e) => set("declined", e.target.checked)}
          />{" "}
          Declined: private groups, shared logins or leaked sources (the decline is logged)
        </label>
        {f.declined ? (
          <TextIn
            className="sm:col-span-2"
            label="Reason for declining"
            value={f.reason}
            onChange={(v) => set("reason", v)}
          />
        ) : null}
      </div>
      <p className="text-muted-foreground text-xs">
        Public content only. Account lists are identity-checked before they become targets. Client
        surveys are baselines only, labelled as client figures. Nothing here is quoted as an FA
        finding.
      </p>
      <div>
        <Submit
          pending={save.isPending}
          disabled={!f.description.trim() || !f.received_on || f.sha256.trim().length !== 64}
          onClick={() => save.mutate()}
        >
          Log item
        </Submit>
      </div>
    </div>
  );
}

function RqForm({ ws }: { ws: Workspace }) {
  const nextNo = `RQ${Math.max(0, ...ws.rqs.map((r) => Number(r.rq_no.slice(2)))) + 1}`;
  const [q, setQ] = useState("");
  const [h, setH] = useState("");
  const [sec, setSec] = useState("1");
  const save = useDbAction(
    ws,
    async () => {
      const { error } = await supabase.from("project_research_questions").insert({
        project_id: ws.project.id,
        rq_no: nextNo,
        question: q.trim(),
        hypothesis: h.trim() || null,
        brief_section: Number(sec),
        created_by_name: ws.me.name || null,
      });
      if (error) throw error;
    },
    `${nextNo} added`,
    () => {
      setQ("");
      setH("");
    },
  );
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <AreaIn label={`${nextNo} · testable research question`} value={q} onChange={setQ} rows={2} />
      <AreaIn label="Hypothesis it tests" value={h} onChange={setH} rows={2} />
      <div className="grid gap-1.5">
        <label className="text-sm font-medium" htmlFor="rq-sec">
          Comes from brief section
        </label>
        <select
          id="rq-sec"
          className={selectCls}
          value={sec}
          onChange={(e) => setSec(e.target.value)}
        >
          {TRACEABILITY.map((t) => (
            <option key={t.n} value={t.n}>
              {t.n} {t.section}
            </option>
          ))}
        </select>
      </div>
      <div className="flex items-end">
        <Submit pending={save.isPending} disabled={!q.trim()} onClick={() => save.mutate()}>
          Add research question
        </Submit>
      </div>
    </div>
  );
}

export function DiscoveryTab({ ws }: { ws: Workspace }) {
  const claimTone = (c: string) =>
    c === "FACT_CHECKED_BY_FA"
      ? "bg-done text-done-foreground"
      : c === "CLIENT_CLAIM"
        ? "bg-queued text-queued-foreground"
        : "bg-warn text-warn-foreground";
  return (
    <div className="space-y-6">
      <Section
        id="sit-h"
        title="Situation analysis and research questions"
        hint="One page: facts the client supplied (attributed), facts FA can already verify from public sources, assumptions, unknowns. Each hypothesis becomes a testable research question (RQ1, RQ2…). The facts and unknowns are written in the Brief tab."
      >
        <ul className="mb-5 space-y-2">
          {ws.rqs.map((r) => (
            <li key={r.id} className="text-sm">
              <span className="font-mono font-bold">{r.rq_no}</span> {r.question}
              <span className="text-muted-foreground">
                {" "}
                · brief section {r.brief_section}
                {r.hypothesis ? ` · tests: ${r.hypothesis}` : ""}
              </span>
            </li>
          ))}
          {!ws.rqs.length ? (
            <li className="text-muted-foreground text-sm">No research questions yet.</li>
          ) : null}
        </ul>
        {ws.has("owner", "engagement_lead", "lead_analyst") ? (
          <RqForm ws={ws} />
        ) : (
          <Locked>The engagement lead or lead analyst writes the research questions.</Locked>
        )}
      </Section>

      <Section
        id="int-h"
        title="Discovery interviews"
        hint="Two FA people at every interview: interviewer and note-taker. Start from the situation, then the wish. Ask for the decision, ask about failure, separate need from nice-to-have, test assumptions out loud, ask who may act, read every key point back."
      >
        <ul className="divide-border mb-5 divide-y">
          {ws.interviews.map((i) => (
            <li key={i.id} className="space-y-1 py-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <strong>{i.interviewee}</strong>
                <span className="text-muted-foreground">{i.interviewee_role}</span>
                <Chip
                  tone={
                    i.readback_confirmed
                      ? "bg-done text-done-foreground"
                      : "bg-warn text-warn-foreground"
                  }
                >
                  {i.readback_confirmed ? "read back" : "not read back"}
                </Chip>
              </div>
              <div className="text-muted-foreground text-xs">
                {formatDateTime(i.held_at)} · interviewer {i.interviewer_name ?? "—"} · note-taker{" "}
                {i.note_taker_name ?? "—"}
              </div>
              <ul className="list-disc pl-5">
                {((i.key_statements as unknown as { text: string; class: string }[]) ?? []).map(
                  (k, n) => (
                    <li key={n}>
                      “{k.text}”{" "}
                      <span className="text-muted-foreground text-xs">
                        {k.class.replace("_", "-")}
                      </span>
                    </li>
                  ),
                )}
              </ul>
              {i.disagreements ? (
                <p className="text-xs">
                  <strong>Disagreements:</strong> {i.disagreements}
                </p>
              ) : null}
            </li>
          ))}
          {!ws.interviews.length ? (
            <li className="text-muted-foreground py-2 text-sm">No interviews recorded.</li>
          ) : null}
        </ul>
        {ws.has("owner", "engagement_lead") ? (
          <InterviewForm ws={ws} />
        ) : (
          <Locked>The engagement lead records interviews.</Locked>
        )}
      </Section>

    </div>
  );
}

export function IntakeRegister({ ws }: { ws: Workspace }) {
  const claimTone = (c: string) =>
    c === "FACT_CHECKED_BY_FA"
      ? "bg-done text-done-foreground"
      : c === "CLIENT_CLAIM"
        ? "bg-queued text-queued-foreground"
        : "bg-warn text-warn-foreground";
  return (
    <div className="space-y-6">
      <Section
        id="intake-h"
        title="Research content intake register (FA-CEF-T03)"
        hint="Everything the client supplies is logged before use, with its hash. Client research is treated as a client claim until FA's own collection supports it. It may seed a lexicon or target list; it is never reported as an FA finding."
      >
        <div className="mb-5 overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="text-muted-foreground text-left text-xs uppercase">
              <tr>
                <th className="py-2 pr-3">Ref</th>
                <th className="py-2 pr-3">Item</th>
                <th className="py-2 pr-3">Received</th>
                <th className="py-2 pr-3">Claim status</th>
                <th className="py-2 pr-3">Use</th>
                <th className="py-2">SHA-256</th>
              </tr>
            </thead>
            <tbody>
              {ws.intake.map((i) => (
                <tr key={i.id ?? i.item_ref} className="border-t align-top">
                  <td className="py-2 pr-3 font-mono">
                    {i.item_ref}
                    {(i.rev ?? 1) > 1 ? ` r${i.rev}` : ""}
                  </td>
                  <td className="py-2 pr-3">
                    {i.description}
                    {i.declined ? (
                      <div className="text-failed-foreground text-xs">
                        Declined: {i.decline_reason}
                      </div>
                    ) : null}
                  </td>
                  <td className="py-2 pr-3">{formatDay(i.received_on)}</td>
                  <td className="py-2 pr-3">
                    <Chip tone={claimTone(i.claim_status ?? "")}>
                      {(i.claim_status ?? "").replace(/_/g, " ").toLowerCase()}
                    </Chip>
                  </td>
                  <td className="py-2 pr-3">{i.use_class}</td>
                  <td className="py-2 font-mono text-xs break-all">
                    {(i.sha256 ?? "").slice(0, 16)}…
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!ws.intake.length ? (
            <p className="text-muted-foreground py-2 text-sm">Nothing logged.</p>
          ) : null}
        </div>
        {ws.has("owner", "engagement_lead", "data_steward") ? (
          <IntakeForm ws={ws} />
        ) : (
          <Locked>The engagement lead or data steward logs intake items.</Locked>
        )}
      </Section>
    </div>
  );
}
