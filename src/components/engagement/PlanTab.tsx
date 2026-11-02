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
  useDbAction,
} from "@/components/engagement/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDay } from "@/lib/projects";
import { formatDateTime } from "@/lib/format";
import { MEASURE_LEVELS, SCENARIO_TYPES, tierLabel, TIERS, type Workspace } from "@/lib/projects";

const selectCls = "border-input bg-background min-h-11 rounded-md border px-3 text-sm";

/** After G0 a register changes only through an approved amendment. */
function useAmendmentChoice(ws: Workspace) {
  const approved = ws.briefs.filter(
    (b) =>
      b.amendment_no && ws.approvals.some((a) => a.brief_id === b.id && a.decision === "approved"),
  );
  const afterG0 = !!ws.gateAt("G0");
  const [amendment, setAmendment] = useState("");
  const picker = afterG0 ? (
    <div className="grid gap-1.5 sm:col-span-2">
      <label className="text-sm font-medium" htmlFor="amend-pick">
        Approved amendment authorising this change
      </label>
      <select
        id="amend-pick"
        className={selectCls}
        value={amendment}
        onChange={(e) => setAmendment(e.target.value)}
      >
        <option value="">Choose an approved amendment</option>
        {approved.map((b) => (
          <option key={b.id} value={b.id}>
            A{b.amendment_no} · {b.change_summary}
          </option>
        ))}
      </select>
      {!approved.length ? (
        <p className="text-muted-foreground text-xs">
          There is none yet: propose one in the Brief tab and have the Curator approve it.
        </p>
      ) : null}
    </div>
  ) : null;
  return { amendment: afterG0 ? amendment : "", afterG0, picker };
}

type Opt = { action: string; kind: "FA-INTERNAL" | "CLIENT-DECISION" };

function ScenarioForm({ ws }: { ws: Workspace }) {
  const nextNo = `S${Math.max(0, ...ws.scenarios.map((s) => Number(s.scenario_no.slice(1)))) + 1}`;
  const [no, setNo] = useState("");
  const { amendment, afterG0, picker } = useAmendmentChoice(ws);
  const [f, setF] = useState({
    type: "mobilization",
    name: "",
    situation: "",
    trig: "",
    threshold: "",
    readers: "2",
    tier: "",
    owner: "",
    approver: "",
    informed: "",
    time: "",
    say: "",
    notsay: "",
    review: "",
  });
  const [opts, setOpts] = useState<Opt[]>([{ action: "", kind: "FA-INTERNAL" }]);
  const set = (k: keyof typeof f, v: string) => setF((x) => ({ ...x, [k]: v }));
  const key = no || nextNo;
  const save = useDbAction(
    ws,
    async () => {
      const { error } = await supabase.from("project_scenarios").insert({
        project_id: ws.project.id,
        scenario_no: key,
        scenario_type: f.type,
        name: f.name.trim(),
        situation: f.situation.trim(),
        trigger_indicators: f.trig.trim(),
        threshold: f.threshold.trim(),
        readers_required: Number(f.readers) || 2,
        min_evidence_tier: f.tier || null,
        response_options: opts.filter((o) => o.action.trim()),
        decision_owner: f.owner.trim(),
        approver: f.approver.trim(),
        informed: f.informed.trim() || null,
        time_frame: f.time.trim(),
        fa_will_say: f.say.trim(),
        fa_will_not_say: f.notsay.trim(),
        review_date: f.review || null,
        amendment_id: amendment || null,
        created_by_name: ws.me.name || null,
      });
      if (error) throw error;
    },
    `${key} saved`,
    () => {
      setNo("");
      setF({ ...f, name: "", situation: "", trig: "", threshold: "" });
    },
  );
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <p className="text-muted-foreground text-xs sm:col-span-2">
        Scenario planning supports client decisions; it does not predict. A scenario is defined by
        conditions FA can observe in the data and by actions the client has already agreed it may
        take. No probability unless the client supplies one.
      </p>
      <div className="grid gap-1.5">
        <label className="text-sm font-medium" htmlFor="sc-no">
          Scenario ID ({ws.scenarios.some((s) => s.scenario_no === no) ? "revises it" : "new"})
        </label>
        <select id="sc-no" className={selectCls} value={no} onChange={(e) => setNo(e.target.value)}>
          <option value="">{nextNo} (new)</option>
          {ws.scenarios.map((s) => (
            <option key={s.id} value={s.scenario_no}>
              Revise {s.scenario_no} · {s.name}
            </option>
          ))}
        </select>
      </div>
      <div className="grid gap-1.5">
        <label className="text-sm font-medium" htmlFor="sc-type">
          Type
        </label>
        <select
          id="sc-type"
          className={selectCls}
          value={f.type}
          onChange={(e) => set("type", e.target.value)}
        >
          {SCENARIO_TYPES.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </select>
      </div>
      <TextIn label="Name" value={f.name} onChange={(v) => set("name", v)} />
      <TextIn label="Review date" type="date" value={f.review} onChange={(v) => set("review", v)} />
      <AreaIn
        label="Situation if it happens (what would be observed)"
        value={f.situation}
        onChange={(v) => set("situation", v)}
        rows={2}
      />
      <AreaIn
        label="Trigger indicators (data conditions FA can measure, using the categories and severities)"
        value={f.trig}
        onChange={(v) => set("trig", v)}
        rows={2}
      />
      <TextIn
        label="Threshold (set by the client, not by FA after the fact)"
        value={f.threshold}
        onChange={(v) => set("threshold", v)}
      />
      <div className="grid grid-cols-2 gap-4">
        <TextIn
          label="Readers who must confirm"
          type="number"
          value={f.readers}
          onChange={(v) => set("readers", v)}
          hint="Default two for CRITICAL or HIGH."
        />
        <div className="grid gap-1.5">
          <label className="text-sm font-medium" htmlFor="sc-tier">
            Minimum evidence tier
          </label>
          <select
            id="sc-tier"
            className={selectCls}
            value={f.tier}
            onChange={(e) => set("tier", e.target.value)}
          >
            <option value="">None set</option>
            {TIERS.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="grid gap-2 sm:col-span-2">
        <span className="text-sm font-medium">
          Response options (each FA-INTERNAL or CLIENT-DECISION)
        </span>
        {opts.map((o, i) => (
          <div key={i} className="grid gap-2 sm:grid-cols-[1fr_12rem_auto]">
            <Input
              aria-label={`Option ${i + 1}`}
              value={o.action}
              onChange={(e) =>
                setOpts(opts.map((x, j) => (j === i ? { ...x, action: e.target.value } : x)))
              }
            />
            <select
              aria-label={`Option ${i + 1} kind`}
              className="border-input bg-background min-h-9 rounded-md border px-2 text-sm"
              value={o.kind}
              onChange={(e) =>
                setOpts(
                  opts.map((x, j) => (j === i ? { ...x, kind: e.target.value as Opt["kind"] } : x)),
                )
              }
            >
              <option>FA-INTERNAL</option>
              <option>CLIENT-DECISION</option>
            </select>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Remove option"
              onClick={() => setOpts(opts.filter((_, j) => j !== i))}
            >
              <Trash2 className="size-4" />
            </Button>
          </div>
        ))}
        <div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setOpts([...opts, { action: "", kind: "CLIENT-DECISION" }])}
          >
            <Plus className="size-4" /> Add option
          </Button>
        </div>
      </div>
      <TextIn
        label="Decision owner (named role)"
        value={f.owner}
        onChange={(v) => set("owner", v)}
      />
      <TextIn label="Who approves" value={f.approver} onChange={(v) => set("approver", v)} />
      <TextIn label="Who is informed" value={f.informed} onChange={(v) => set("informed", v)} />
      <TextIn
        label="Time frame: how fast FA informs the owner"
        value={f.time}
        onChange={(v) => set("time", v)}
      />
      <AreaIn
        label="What FA will say"
        value={f.say}
        onChange={(v) => set("say", v)}
        rows={2}
        hint="Counts, verbatim quotes, links, tiers, limits."
      />
      <AreaIn
        label="What FA will not say"
        value={f.notsay}
        onChange={(v) => set("notsay", v)}
        rows={2}
        hint="Who is behind it, what will happen next."
      />
      {picker}
      <div className="sm:col-span-2">
        <Submit
          pending={save.isPending}
          disabled={
            !ws.has("owner", "engagement_lead") ||
            !f.name.trim() ||
            !f.threshold.trim() ||
            !opts.some((o) => o.action.trim()) ||
            (afterG0 && !amendment)
          }
          onClick={() => save.mutate()}
        >
          Save scenario
        </Submit>
      </div>
    </div>
  );
}

function MeasureForm({ ws }: { ws: Workspace }) {
  const nextNo = `M${Math.max(0, ...ws.measures.map((m) => Number(m.measure_no.slice(1)))) + 1}`;
  const { amendment, afterG0, picker } = useAmendmentChoice(ws);
  const [no, setNo] = useState("");
  const [f, setF] = useState({
    level: "outputs",
    measure: "",
    observable: true,
    baseline: "",
    bsrc: "first_window",
    target: "",
    source: "",
    client: false,
  });
  const impact = f.level === "impact";
  const save = useDbAction(
    ws,
    async () => {
      const { error } = await supabase.from("project_success_measures").insert({
        project_id: ws.project.id,
        measure_no: no || nextNo,
        level: f.level,
        measure: f.measure.trim(),
        observable: f.observable,
        baseline: f.observable ? f.baseline.trim() : null,
        baseline_source: f.observable ? f.bsrc : null,
        target: f.observable ? f.target.trim() : null,
        data_source: f.observable ? f.source.trim() : null,
        client_figure: impact ? true : f.client,
        amendment_id: amendment || null,
        created_by_name: ws.me.name || null,
      });
      if (error) throw error;
    },
    "Measure saved",
    () => {
      setNo("");
      setF({ ...f, measure: "", baseline: "", target: "", source: "" });
    },
  );
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <p className="text-muted-foreground text-xs sm:col-span-2">
        Structure follows the AMEC Integrated Evaluation Framework. Each measure has a baseline, a
        target set by the client, and a named data source. FA reports outputs, out-takes and
        outcomes from its own data; impact only from client-supplied records, marked as such. A
        measure FA cannot observe is listed as out of reach, never estimated.
      </p>
      <div className="grid gap-1.5">
        <label className="text-sm font-medium" htmlFor="m-no">
          Measure
        </label>
        <select id="m-no" className={selectCls} value={no} onChange={(e) => setNo(e.target.value)}>
          <option value="">{nextNo} (new)</option>
          {ws.measures.map((m) => (
            <option key={m.id} value={m.measure_no}>
              Revise {m.measure_no}
            </option>
          ))}
        </select>
      </div>
      <div className="grid gap-1.5">
        <label className="text-sm font-medium" htmlFor="m-lvl">
          Level
        </label>
        <select
          id="m-lvl"
          className={selectCls}
          value={f.level}
          onChange={(e) => setF({ ...f, level: e.target.value })}
        >
          {MEASURE_LEVELS.map((l) => (
            <option key={l.id} value={l.id}>
              {l.label}
            </option>
          ))}
        </select>
      </div>
      <TextIn
        className="sm:col-span-2"
        label="Measure"
        value={f.measure}
        onChange={(v) => setF({ ...f, measure: v })}
        hint={MEASURE_LEVELS.find((l) => l.id === f.level)?.blurb ?? ""}
      />
      <label className="flex min-h-11 items-center gap-2 text-sm sm:col-span-2">
        <input
          type="checkbox"
          className="size-5"
          checked={f.observable}
          onChange={(e) => setF({ ...f, observable: e.target.checked })}
        />{" "}
        FA can observe this in its own data (untick to list it as out of reach)
      </label>
      {f.observable ? (
        <>
          <TextIn
            label="Baseline"
            value={f.baseline}
            onChange={(v) => setF({ ...f, baseline: v })}
          />
          <div className="grid gap-1.5">
            <label className="text-sm font-medium" htmlFor="m-bs">
              Baseline from
            </label>
            <select
              id="m-bs"
              className={selectCls}
              value={f.bsrc}
              onChange={(e) => setF({ ...f, bsrc: e.target.value })}
            >
              <option value="first_window">First window of FA data</option>
              <option value="client_data">Client data (labelled as such)</option>
            </select>
          </div>
          <TextIn
            label="Target (set by the client)"
            value={f.target}
            onChange={(v) => setF({ ...f, target: v })}
          />
          <TextIn
            label="Named data source"
            value={f.source}
            onChange={(v) => setF({ ...f, source: v })}
          />
          {!impact ? (
            <label className="flex min-h-11 items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="size-5"
                checked={f.client}
                onChange={(e) => setF({ ...f, client: e.target.checked })}
              />{" "}
              Client figure
            </label>
          ) : (
            <p className="text-muted-foreground text-xs">Impact is always a client figure.</p>
          )}
        </>
      ) : null}
      {picker}
      <div className="sm:col-span-2">
        <Submit
          pending={save.isPending}
          disabled={
            !ws.has("owner", "engagement_lead") ||
            !f.measure.trim() ||
            (afterG0 && !amendment) ||
            (f.observable && (!f.baseline.trim() || !f.target.trim() || !f.source.trim()))
          }
          onClick={() => save.mutate()}
        >
          Save measure
        </Submit>
      </div>
    </div>
  );
}

function WatchForm({ ws }: { ws: Workspace }) {
  const analysts = ws.members.filter((m) => ["analyst", "lead_analyst"].includes(m.role));
  const [no, setNo] = useState(ws.scenarios[0]?.scenario_no ?? "");
  const [event, setEvent] = useState("reviewed");
  const [cycle, setCycle] = useState(String(ws.cycles[ws.cycles.length - 1]?.cycle_no ?? 0));
  const [tier, setTier] = useState("");
  const [counts, setCounts] = useState("");
  const [note, setNote] = useState("");
  const [who, setWho] = useState<string[]>([]);
  const save = useDbAction(
    ws,
    async () => {
      const parsed = counts.trim()
        ? Object.fromEntries(
            counts.split(",").map((p) => {
              const [k, v] = p.split("=");
              return [k!.trim(), Number(v)];
            }),
          )
        : {};
      const { error } = await supabase.from("project_scenario_events").insert({
        project_id: ws.project.id,
        scenario_no: no,
        cycle_no: Number(cycle) || 0,
        event,
        counts: parsed,
        evidence_tier: tier || null,
        confirmed_by: who,
        note: note.trim() || null,
        created_by_name: ws.me.name || null,
      });
      if (error) throw error;
    },
    "Recorded",
    () => {
      setNote("");
      setWho([]);
    },
  );
  if (!ws.scenarios.length) return <Locked>No scenarios yet.</Locked>;
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="grid gap-1.5">
        <label className="text-sm font-medium" htmlFor="w-sc">
          Scenario
        </label>
        <select id="w-sc" className={selectCls} value={no} onChange={(e) => setNo(e.target.value)}>
          {ws.scenarios.map((s) => (
            <option key={s.id} value={s.scenario_no}>
              {s.scenario_no} · {s.name}
            </option>
          ))}
        </select>
      </div>
      <div className="grid gap-1.5">
        <label className="text-sm font-medium" htmlFor="w-ev">
          Event
        </label>
        <select
          id="w-ev"
          className={selectCls}
          value={event}
          onChange={(e) => setEvent(e.target.value)}
        >
          <option value="reviewed">Reviewed (each cycle)</option>
          <option value="declared">Declared</option>
          <option value="stood_down">Stood down</option>
        </select>
      </div>
      <TextIn label="Cycle" type="number" value={cycle} onChange={setCycle} />
      <div className="grid gap-1.5">
        <label className="text-sm font-medium" htmlFor="w-tier">
          Evidence tier
        </label>
        <select
          id="w-tier"
          className={selectCls}
          value={tier}
          onChange={(e) => setTier(e.target.value)}
        >
          <option value="">—</option>
          {TIERS.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </select>
      </div>
      <TextIn
        className="sm:col-span-2"
        label="Counts (name=number, comma separated)"
        value={counts}
        onChange={setCounts}
      />
      <fieldset className="sm:col-span-2">
        <legend className="text-sm font-medium">Readers who confirm</legend>
        <div className="mt-1 flex flex-wrap gap-3">
          {analysts.map((m) => (
            <label key={m.user_id} className="flex min-h-9 items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="size-4"
                checked={who.includes(m.user_id)}
                onChange={(e) =>
                  setWho(
                    e.target.checked ? [...who, m.user_id] : who.filter((x) => x !== m.user_id),
                  )
                }
              />
              {m.name}
            </label>
          ))}
        </div>
      </fieldset>
      <AreaIn className="sm:col-span-2" label="Note" value={note} onChange={setNote} rows={2} />
      <div className="sm:col-span-2">
        <Submit
          pending={save.isPending}
          disabled={!ws.has("owner", "engagement_lead", "lead_analyst")}
          onClick={() => save.mutate()}
        >
          Record
        </Submit>
      </div>
    </div>
  );
}

export function ScenarioRegister({ ws }: { ws: Workspace }) {
  const canWrite = ws.has("owner", "engagement_lead");
  return (
    <div className="space-y-6">
      <Section
        id="scn-h"
        title="Scenario register (FA-CEF-T04, brief section 7)"
        hint="Consider in every brief: baseline, escalation, mobilization, narrative spike, protectee under attack, data loss, false alarm, external shock. Triggers become watch conditions in Phase 8 and 10."
      >
        <ul className="divide-border mb-5 divide-y">
          {ws.scenarios.map((s) => (
            <li key={s.id} className="space-y-1 py-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono font-bold">{s.scenario_no}</span>
                <strong>{s.name}</strong>
                <Chip>
                  {SCENARIO_TYPES.find((t) => t.id === s.scenario_type)?.label ?? s.scenario_type}
                </Chip>
                <span className="text-muted-foreground text-xs">
                  rev {s.rev} · review {formatDay(s.review_date)}
                </span>
              </div>
              <p>
                <strong>Triggers:</strong> {s.trigger_indicators} <strong>Threshold:</strong>{" "}
                {s.threshold}
              </p>
              <p>
                <strong>Confidence rule:</strong> {s.readers_required} readers
                {s.min_evidence_tier
                  ? `, tier at least ${tierLabel(s.min_evidence_tier)}`
                  : ""}. <strong>Owner:</strong> {s.decision_owner} · approves {s.approver} ·{" "}
                {s.time_frame}
              </p>
              <ul className="list-disc pl-5">
                {((s.response_options as unknown as Opt[]) ?? []).map((o, i) => (
                  <li key={i}>
                    <Chip
                      tone={
                        o.kind === "FA-INTERNAL"
                          ? "bg-secondary text-secondary-foreground"
                          : "bg-queued text-queued-foreground"
                      }
                    >
                      {o.kind}
                    </Chip>{" "}
                    {o.action}
                  </li>
                ))}
              </ul>
              <p className="text-muted-foreground text-xs">
                FA will say: {s.fa_will_say} · FA will not say: {s.fa_will_not_say}
              </p>
            </li>
          ))}
          {!ws.scenarios.length ? (
            <li className="text-muted-foreground py-2 text-sm">No scenarios yet.</li>
          ) : null}
        </ul>
        {canWrite ? (
          <ScenarioForm ws={ws} />
        ) : (
          <Locked>The engagement lead runs the scenario session and keeps the register.</Locked>
        )}
      </Section>

      <Section
        id="watch-h"
        title="Scenario watch (Phase 8 and 10)"
        hint="Review the register every cycle. A scenario is declared only when the confidence rule is met, with the evidence tier, then stood down or amended through the brief."
      >
        <ul className="divide-border mb-5 divide-y">
          {ws.scenarioEvents.map((e) => (
            <li key={e.id} className="py-2 text-sm">
              <span className="font-mono font-bold">{e.scenario_no}</span>{" "}
              {e.event.replace("_", " ")} · cycle {e.cycle_no} · {formatDateTime(e.created_at)}
              {e.evidence_tier ? ` · ${tierLabel(e.evidence_tier)}` : ""}
              {e.confirmed_by.length ? ` · ${e.confirmed_by.length} reader(s)` : ""}
              {e.note ? ` — ${e.note}` : ""}
            </li>
          ))}
          {!ws.scenarioEvents.length ? (
            <li className="text-muted-foreground py-2 text-sm">Nothing recorded.</li>
          ) : null}
        </ul>
        <WatchForm ws={ws} />
      </Section>
    </div>
  );
}

export function SuccessPlan({ ws }: { ws: Workspace }) {
  const canWrite = ws.has("owner", "engagement_lead");
  return (
    <div className="space-y-6">
      <Section
        id="suc-h"
        title="Success plan (FA-CEF-T05, brief section 8)"
        hint="Agreed up front and reported against in Phase 8."
      >
        <div className="mb-5 overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="text-muted-foreground text-left text-xs uppercase">
              <tr>
                <th className="py-2 pr-3">#</th>
                <th className="py-2 pr-3">Level</th>
                <th className="py-2 pr-3">Measure</th>
                <th className="py-2 pr-3">Baseline</th>
                <th className="py-2 pr-3">Target (client)</th>
                <th className="py-2">Data source</th>
              </tr>
            </thead>
            <tbody>
              {ws.measures.map((m) => (
                <tr key={m.id} className="border-t align-top">
                  <td className="py-2 pr-3 font-mono">{m.measure_no}</td>
                  <td className="py-2 pr-3">
                    {MEASURE_LEVELS.find((l) => l.id === m.level)?.label}
                  </td>
                  <td className="py-2 pr-3">
                    {m.measure}
                    {m.client_figure ? (
                      <>
                        {" "}
                        <Chip>client figure</Chip>
                      </>
                    ) : null}
                  </td>
                  {m.observable ? (
                    <>
                      <td className="py-2 pr-3">
                        {m.baseline}{" "}
                        <span className="text-muted-foreground text-xs">
                          ({m.baseline_source === "client_data" ? "client data" : "first window"})
                        </span>
                      </td>
                      <td className="py-2 pr-3">{m.target}</td>
                      <td className="py-2">{m.data_source}</td>
                    </>
                  ) : (
                    <td colSpan={3} className="py-2 italic">
                      Out of reach: listed, not estimated
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          {!ws.measures.length ? (
            <p className="text-muted-foreground py-2 text-sm">No measures yet.</p>
          ) : null}
        </div>
        {canWrite ? (
          <MeasureForm ws={ws} />
        ) : (
          <Locked>The engagement lead keeps the success plan.</Locked>
        )}
      </Section>

    </div>
  );
}
