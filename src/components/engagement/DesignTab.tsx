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
import {
  CATEGORIES,
  EXCLUSION_CODES,
  SEVERITIES,
  TRACEABILITY,
  type Workspace,
} from "@/lib/projects";

const selectCls = "border-input bg-background min-h-11 rounded-md border px-3 text-sm";

function ScopeSheetForm({ ws }: { ws: Workspace }) {
  const s = ws.scopeSheet;
  const [summary, setSummary] = useState(s?.scope_summary ?? "");
  const [risks, setRisks] = useState<{ risk: string; rating: string; mitigation: string }[]>(
    (s?.risk_screen as unknown as { risk: string; rating: string; mitigation: string }[]) ?? [
      { risk: "", rating: "medium", mitigation: "" },
    ],
  );
  const [done, setDone] = useState(s?.risk_screen_done ?? false);
  const [legal, setLegal] = useState(s?.legal_note ?? "");
  const [mandate, setMandate] = useState(s?.mandate ?? "internal_read_only");
  const save = useDbAction(
    ws,
    async () => {
      const { error } = await supabase.from("project_scope_sheets").insert({
        project_id: ws.project.id,
        scope_summary: summary.trim(),
        risk_screen: risks.filter((r) => r.risk.trim()),
        risk_screen_done: done,
        legal_note: legal.trim() || null,
        mandate,
        completed_by_name: ws.me.name || null,
      });
      if (error) throw error;
    },
    "Scope sheet saved",
  );
  if (!ws.me.isCurator)
    return (
      <Locked>
        The Curator completes the scope sheet, risk screen and legal note after the brief is signed
        (G0), then signs G1.
      </Locked>
    );
  return (
    <div className="grid gap-4">
      <AreaIn
        label="Scope sheet summary (FA-CEF-T01)"
        value={summary}
        onChange={setSummary}
        rows={3}
      />
      <div className="grid gap-2">
        <span className="text-sm font-medium">Risk screen</span>
        {risks.map((r, i) => (
          <div key={i} className="grid gap-2 sm:grid-cols-[1fr_8rem_1fr_auto]">
            <Input
              aria-label={`Risk ${i + 1}`}
              placeholder="Risk"
              value={r.risk}
              onChange={(e) =>
                setRisks(risks.map((x, j) => (j === i ? { ...x, risk: e.target.value } : x)))
              }
            />
            <select
              aria-label={`Risk ${i + 1} rating`}
              className="border-input bg-background min-h-9 rounded-md border px-2 text-sm"
              value={r.rating}
              onChange={(e) =>
                setRisks(risks.map((x, j) => (j === i ? { ...x, rating: e.target.value } : x)))
              }
            >
              <option>low</option>
              <option>medium</option>
              <option>high</option>
            </select>
            <Input
              aria-label={`Risk ${i + 1} mitigation`}
              placeholder="Mitigation"
              value={r.mitigation}
              onChange={(e) =>
                setRisks(risks.map((x, j) => (j === i ? { ...x, mitigation: e.target.value } : x)))
              }
            />
            <Button
              variant="ghost"
              size="icon"
              aria-label="Remove risk"
              onClick={() => setRisks(risks.filter((_, j) => j !== i))}
            >
              <Trash2 className="size-4" />
            </Button>
          </div>
        ))}
        <div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setRisks([...risks, { risk: "", rating: "medium", mitigation: "" }])}
          >
            <Plus className="size-4" /> Add risk
          </Button>
        </div>
      </div>
      <label className="flex min-h-11 items-center gap-2 text-sm">
        <input
          type="checkbox"
          className="size-5"
          checked={done}
          onChange={(e) => setDone(e.target.checked)}
        />{" "}
        Risk screen done
      </label>
      <AreaIn label="Legal note" value={legal} onChange={setLegal} rows={2} />
      <div className="grid gap-1.5">
        <label className="text-sm font-medium" htmlFor="mandate">
          Mandate
        </label>
        <select
          id="mandate"
          className={selectCls}
          value={mandate}
          onChange={(e) => setMandate(e.target.value as typeof mandate)}
        >
          <option value="internal_read_only">
            Internal read-only: nothing leaves FridayAnalytics.org
          </option>
          <option value="external_release_allowed">Release outside FA allowed, through G5</option>
        </select>
      </div>
      <div>
        <Submit pending={save.isPending} disabled={!summary.trim()} onClick={() => save.mutate()}>
          Save scope sheet
        </Submit>
      </div>
    </div>
  );
}

type Trace = { choice: string; source: string };
function DesignSheetForm({ ws }: { ws: Workspace }) {
  const d = ws.design;
  const [f, setF] = useState({
    lexver: d ? `v${d.version + 1}` : "v1",
    lexicon: d
      ? Object.entries(d.lexicon as Record<string, string[]>)
          .map(([k, v]) => `${k}: ${v.join(", ")}`)
          .join("\n")
      : "",
    tested: false,
    obf: false,
    cap: String(d?.comment_cap ?? 50),
    order: d?.comment_order ?? "",
    rule: d?.sample_rule ?? "",
  });
  const [codes, setCodes] = useState<string[]>(
    d?.exclusion_codes ?? EXCLUSION_CODES.map((c) => c.id),
  );
  const [traces, setTraces] = useState<Trace[]>(
    (d?.traces as unknown as Trace[]) ?? [{ choice: "Platforms, languages, window", source: "S4" }],
  );
  const save = useDbAction(
    ws,
    async () => {
      const lexicon = Object.fromEntries(
        lines(f.lexicon).map((l) => {
          const [k, ...rest] = l.split(":");
          return [k!.trim(), csvList(rest.join(":"))];
        }),
      );
      const { error } = await supabase.from("project_design_sheets").insert({
        project_id: ws.project.id,
        version: 0,
        lexicon_version: f.lexver.trim(),
        lexicon,
        lexicon_sample_tested: f.tested,
        obfuscated_spellings_tested: f.obf,
        exclusion_codes: codes,
        sample_rule: f.rule.trim(),
        comment_cap: Number(f.cap) || 0,
        comment_order: f.order.trim(),
        traces: traces.filter((t) => t.choice.trim()),
        authored_by_name: ws.me.name || null,
      });
      if (error) throw error;
    },
    "Design sheet saved — the Curator approves it at G2",
  );
  if (!ws.gateAt("G1")) return <Locked>No design before the mandate is confirmed (G1).</Locked>;
  if (!ws.has("owner", "lead_analyst"))
    return <Locked>The lead analyst writes the design sheet from the signed brief.</Locked>;
  return (
    <div className="grid gap-4">
      <p className="text-muted-foreground text-xs">
        Fix the measurement rules before any data is collected so results are comparable across
        scans and clients. Sentiment here is not a single polarity score: each flagged item gets a
        category and a severity (scales below). Once G2 is signed the lexicon and scale freeze; a
        change is a new version and needs G2 again.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextIn
          label="Lexicon version"
          value={f.lexver}
          onChange={(v) => setF({ ...f, lexver: v })}
        />
        <TextIn
          label="Sample rule"
          value={f.rule}
          onChange={(v) => setF({ ...f, rule: v })}
          hint="Last N posts (L5, L30), a date window, or a hashtag."
        />
        <AreaIn
          className="sm:col-span-2"
          label="Lexicon per language (one line each: ms: term, term)"
          value={f.lexicon}
          onChange={(v) => setF({ ...f, lexicon: v })}
          rows={4}
          hint="Include obfuscated spellings; plain regex misses deliberate masking."
        />
        <TextIn
          label="Comment cap per post"
          type="number"
          value={f.cap}
          onChange={(v) => setF({ ...f, cap: v })}
          hint="With a 50-comment cap, comments beyond it on a busy post are not seen. This goes in the limits statement."
        />
        <TextIn
          label="Order comments are served in"
          value={f.order}
          onChange={(v) => setF({ ...f, order: v })}
        />
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="size-5"
            checked={f.tested}
            onChange={(e) => setF({ ...f, tested: e.target.checked })}
          />{" "}
          Lexicon tested on a sample
        </label>
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="size-5"
            checked={f.obf}
            onChange={(e) => setF({ ...f, obf: e.target.checked })}
          />{" "}
          Obfuscated spellings tested
        </label>
      </div>
      <fieldset>
        <legend className="text-sm font-medium">Exclusion codes an analyst may use</legend>
        <div className="mt-1 flex flex-wrap gap-3">
          {EXCLUSION_CODES.map((c) => (
            <label key={c.id} className="flex min-h-9 items-center gap-2 text-sm" title={c.meaning}>
              <input
                type="checkbox"
                className="size-4"
                checked={codes.includes(c.id)}
                onChange={(e) =>
                  setCodes(e.target.checked ? [...codes, c.id] : codes.filter((x) => x !== c.id))
                }
              />
              {c.id}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="grid gap-2">
        <span className="text-sm font-medium">
          Where each design choice comes from (a brief section, or ASSUMPTION)
        </span>
        {traces.map((t, i) => (
          <div key={i} className="grid gap-2 sm:grid-cols-[1fr_14rem_auto]">
            <Input
              aria-label={`Design choice ${i + 1}`}
              value={t.choice}
              onChange={(e) =>
                setTraces(traces.map((x, j) => (j === i ? { ...x, choice: e.target.value } : x)))
              }
            />
            <select
              aria-label={`Source of choice ${i + 1}`}
              className="border-input bg-background min-h-9 rounded-md border px-2 text-sm"
              value={t.source}
              onChange={(e) =>
                setTraces(traces.map((x, j) => (j === i ? { ...x, source: e.target.value } : x)))
              }
            >
              {TRACEABILITY.map((b) => (
                <option key={b.n} value={`S${b.n}`}>
                  S{b.n} {b.section}
                </option>
              ))}
              <option value="ASSUMPTION">ASSUMPTION (flag for the Curator)</option>
            </select>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Remove"
              onClick={() => setTraces(traces.filter((_, j) => j !== i))}
            >
              <Trash2 className="size-4" />
            </Button>
          </div>
        ))}
        <div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setTraces([...traces, { choice: "", source: "S4" }])}
          >
            <Plus className="size-4" /> Add choice
          </Button>
        </div>
      </div>
      <div>
        <Submit
          pending={save.isPending}
          disabled={
            !f.lexver.trim() ||
            !f.lexicon.trim() ||
            !f.rule.trim() ||
            !f.order.trim() ||
            !codes.length
          }
          onClick={() => save.mutate()}
        >
          Save design sheet {d ? `(new version v${d.version + 1})` : "(v1)"}
        </Submit>
      </div>
    </div>
  );
}

function TargetForm({ ws }: { ws: Workspace }) {
  const [platform, setPlatform] = useState("facebook");
  const [handle, setHandle] = useState("");
  const [group, setGroup] = useState("");
  const [resolved, setResolved] = useState(true);
  const [note, setNote] = useState("");
  const save = useDbAction(
    ws,
    async (confirm: boolean) => {
      const { error } = await supabase.from("project_targets").insert({
        project_id: ws.project.id,
        target_key: "",
        platform: platform.trim(),
        handle: handle.trim(),
        target_group: group.trim() || null,
        identity_resolved: resolved,
        curator_confirmed: confirm,
        note: note.trim() || null,
      });
      if (error) throw error;
    },
    "Target saved",
    () => {
      setHandle("");
      setNote("");
    },
  );
  if (!ws.gateAt("G1"))
    return <Locked>No target register before the mandate is confirmed (G1).</Locked>;
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <TextIn label="Platform" value={platform} onChange={setPlatform} />
      <TextIn label="Handle" value={handle} onChange={setHandle} />
      <TextIn label="Target group (for the taxonomy)" value={group} onChange={setGroup} />
      <TextIn label="Note" value={note} onChange={setNote} />
      <label className="flex min-h-11 items-center gap-2 text-sm sm:col-span-2">
        <input
          type="checkbox"
          className="size-5"
          checked={resolved}
          onChange={(e) => setResolved(e.target.checked)}
        />{" "}
        Identity resolved: the real account is confirmed (a share link names a post, not the target)
      </label>
      <div className="flex flex-wrap gap-2 sm:col-span-2">
        {ws.has("owner", "lead_analyst") ? (
          <Submit
            pending={save.isPending}
            disabled={!handle.trim()}
            onClick={() => save.mutate(false)}
          >
            Add target
          </Submit>
        ) : null}
        {ws.me.isCurator ? (
          <Submit
            variant="outline"
            pending={save.isPending}
            disabled={!handle.trim()}
            onClick={() => save.mutate(true)}
          >
            Curator confirms this account
          </Submit>
        ) : null}
      </div>
    </div>
  );
}

export function DesignTab({ ws }: { ws: Workspace }) {
  const d = ws.design;
  return (
    <div className="space-y-6">
      <Section
        id="scope-h"
        title="Scope sheet, risk screen and legal note (G1)"
        hint="Without the Curator's signed scope sheet, no collection starts. The mandate decides whether anything may leave FridayAnalytics.org."
      >
        {ws.scopeSheet ? (
          <div className="mb-5 space-y-1 text-sm">
            <p>
              <Chip
                tone={
                  ws.scopeSheet.mandate === "external_release_allowed"
                    ? "bg-queued text-queued-foreground"
                    : "bg-secondary text-secondary-foreground"
                }
              >
                {ws.scopeSheet.mandate === "external_release_allowed"
                  ? "Release outside FA allowed (G5)"
                  : "Internal read-only"}
              </Chip>{" "}
              {ws.scopeSheet.risk_screen_done ? "Risk screen done" : "Risk screen not done"} ·{" "}
              {formatDateTime(ws.scopeSheet.completed_at)}
            </p>
            <p>{ws.scopeSheet.scope_summary}</p>
            {ws.scopeSheet.legal_note ? (
              <p className="text-muted-foreground">Legal: {ws.scopeSheet.legal_note}</p>
            ) : null}
          </div>
        ) : null}
        <ScopeSheetForm ws={ws} />
      </Section>

      <Section
        id="design-h"
        title={`Design sheet${d ? ` · v${d.version}` : ""}`}
        hint="Lexicon version, taxonomy, severity scale, sample rule, caps."
      >
        {d ? (
          <div className="mb-5 space-y-2 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <Chip>lexicon {d.lexicon_version}</Chip>
              {ws.project.design_stale ? (
                <Chip tone="bg-warn text-warn-foreground">waiting for G2</Chip>
              ) : ws.gateAt("G2") ? (
                <Chip tone="bg-done text-done-foreground">approved and frozen</Chip>
              ) : (
                <Chip tone="bg-warn text-warn-foreground">not approved yet</Chip>
              )}
            </div>
            <p>
              Sample rule: {d.sample_rule} · cap {d.comment_cap} comments, {d.comment_order} ·
              exclusion codes: {d.exclusion_codes.join(", ")}
            </p>
            <ul className="list-disc pl-5">
              {((d.traces as unknown as Trace[]) ?? []).map((t, i) => (
                <li key={i}>
                  {t.choice}{" "}
                  <Chip
                    tone={t.source === "ASSUMPTION" ? "bg-warn text-warn-foreground" : undefined}
                  >
                    {t.source}
                  </Chip>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        <DesignSheetForm ws={ws} />
      </Section>

      <Section
        id="tgt-h"
        title="Target register"
        hint="Where a handle is internal or unresolved, the Curator confirms the real account before any scan."
      >
        <ul className="divide-border mb-5 divide-y">
          {ws.targets.map((t) => (
            <li key={t.id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
              <span className="font-mono">
                {t.platform}: {t.handle}
              </span>
              {t.target_group ? (
                <span className="text-muted-foreground">· {t.target_group}</span>
              ) : null}
              {t.identity_resolved ? (
                <Chip tone="bg-done text-done-foreground">resolved</Chip>
              ) : t.curator_confirmed ? (
                <Chip>Curator confirmed</Chip>
              ) : (
                <Chip tone="bg-warn text-warn-foreground">unresolved</Chip>
              )}
            </li>
          ))}
          {!ws.targets.length ? (
            <li className="text-muted-foreground py-2 text-sm">No targets yet.</li>
          ) : null}
        </ul>
        <TargetForm ws={ws} />
      </Section>

      <Section
        id="scale-h"
        title="Classification scales (Appendix A)"
        hint="Distinguish incitement to violence from harassment in every table."
      >
        <div className="grid gap-6 lg:grid-cols-2">
          <table className="w-full text-sm">
            <thead className="text-muted-foreground text-left text-xs uppercase">
              <tr>
                <th className="py-2 pr-3">Category</th>
                <th className="py-2 pr-3">Meaning</th>
                <th className="py-2">Report as</th>
              </tr>
            </thead>
            <tbody>
              {CATEGORIES.map((c) => (
                <tr key={c.id} className="border-t align-top">
                  <td className="py-2 pr-3 font-mono text-xs">{c.id}</td>
                  <td className="py-2 pr-3">{c.meaning}</td>
                  <td className="py-2">{c.reportAs}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <table className="w-full text-sm">
            <thead className="text-muted-foreground text-left text-xs uppercase">
              <tr>
                <th className="py-2 pr-3">Severity</th>
                <th className="py-2">Use when</th>
              </tr>
            </thead>
            <tbody>
              {SEVERITIES.map((c) => (
                <tr key={c.id} className="border-t align-top">
                  <td className="py-2 pr-3 font-mono text-xs">{c.id}</td>
                  <td className="py-2">{c.use}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
    </div>
  );
}
