import { useState } from "react";

import { supabase } from "@/integrations/supabase/client";
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
import { TIERS, tierLabel, type Candidate, type Workspace } from "@/lib/projects";

const selectCls = "border-input bg-background min-h-11 rounded-md border px-3 text-sm";

function CaptureDialog({
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
  const staff = ws.members.filter((m) => m.role !== "client_viewer" && m.user_id !== ws.me.uid);
  const [bar, setBar] = useState(false);
  const [hash, setHash] = useState("");
  const [link, setLink] = useState("");
  const [at, setAt] = useState("");
  const [cust, setCust] = useState(false);
  const [second, setSecond] = useState("");
  const save = useDbAction(
    ws,
    async () => {
      const { error } = await supabase.from("project_captures").insert({
        project_id: ws.project.id,
        project_item_id: cand.id,
        url_bar_clock_visible: bar,
        screenshot_sha256: hash.trim().toLowerCase(),
        archive_link: link.trim(),
        captured_at_utc: new Date(at).toISOString(),
        custody_logged: cust,
        captured_by_name: ws.me.name || null,
        second_person_check_by: second || null,
      });
      if (error) throw error;
    },
    "Capture recorded",
    () => onOpenChange(false),
  );
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Capture record · {cand.code}</DialogTitle>
          <DialogDescription>
            FA-STD-001 V2: screenshot with the URL bar and a clock visible (full viewport, then
            crop, after the page has rendered), web archive, SHA-256 at capture in UTC, capture
            record and custody log, two-person check. Only the full chain is proof.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="size-5"
              checked={bar}
              onChange={(e) => setBar(e.target.checked)}
            />{" "}
            URL bar and clock visible in the screenshot
          </label>
          <TextIn label="SHA-256 of the screenshot" value={hash} onChange={setHash} />
          <TextIn label="Archive link" value={link} onChange={setLink} />
          <TextIn label="Captured at (UTC)" type="datetime-local" value={at} onChange={setAt} />
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="size-5"
              checked={cust}
              onChange={(e) => setCust(e.target.checked)}
            />{" "}
            Custody log written
          </label>
          <div className="grid gap-1.5">
            <label className="text-sm font-medium" htmlFor="cap-2">
              Second person who checked it (optional now)
            </label>
            <select
              id="cap-2"
              className={selectCls}
              value={second}
              onChange={(e) => setSecond(e.target.value)}
            >
              <option value="">Not yet checked</option>
              {staff.map((m) => (
                <option key={m.user_id} value={m.user_id}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Submit
            pending={save.isPending}
            disabled={hash.trim().length !== 64 || !link.trim() || !at}
            onClick={() => save.mutate()}
          >
            Record capture
          </Submit>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FlaggedRow({ ws, cand }: { ws: Workspace; cand: Candidate }) {
  const d = ws.decisions.get(cand.id)!;
  const tier = ws.tiers.get(cand.id);
  const caps = ws.captures.filter((c) => c.project_item_id === cand.id);
  const [open, setOpen] = useState(false);
  const [pick, setPick] = useState<string>(tier?.tier ?? "BROWSER_DOM_ONLY");
  const setTier = useDbAction(
    ws,
    async () => {
      const { error } = await supabase.from("project_item_tiers").insert({
        project_id: ws.project.id,
        project_item_id: cand.id,
        tier: pick,
        set_by_name: ws.me.name || null,
      });
      if (error) throw error;
    },
    "Tier set",
  );
  const blocked = d.needs_second_reader && !d.second_reader_confirmed;
  return (
    <tr className="border-border/60 border-t align-top">
      <td className="px-3 py-3">
        <span className="font-mono text-xs font-semibold">{cand.code}</span>
        <div className="text-muted-foreground text-xs">cycle {cand.cycleNo}</div>
      </td>
      <td className="px-3 py-3">
        <div className="flex flex-wrap gap-1">
          <Chip tone={SEVERITY_TONE[d.severity ?? ""]}>{d.severity}</Chip>
          <Chip>{d.category}</Chip>
        </div>
        {blocked ? (
          <div className="text-xs">
            <Chip tone="bg-warn text-warn-foreground">needs a second reader before capture</Chip>
          </div>
        ) : null}
      </td>
      <td className="px-3 py-3 text-xs">
        {caps.length
          ? caps.map((c) => (
              <div key={c.id}>
                {formatDateTime(c.captured_at_utc)}
                {c.second_person_check_by ? " · two-person check" : " · single check"}
              </div>
            ))
          : "No capture"}
      </td>
      <td className="px-3 py-3">
        <Chip
          tone={
            tier?.tier === "FA_STD_001_V2"
              ? "bg-done text-done-foreground"
              : tier
                ? undefined
                : "bg-queued text-queued-foreground"
          }
        >
          {tierLabel(tier?.tier)}
          {tier?.tier === "FA_STD_001_V2" ? " · proof" : tier ? " · not proof" : ""}
        </Chip>
      </td>
      <td className="px-3 py-3">
        <div className="flex flex-wrap justify-end gap-1.5">
          {ws.has("owner", "evidence_officer") && !blocked ? (
            <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
              Record capture
            </Button>
          ) : null}
          {ws.has(
            "owner",
            "evidence_officer",
            "data_steward",
            "collection_operator",
            "lead_analyst",
          ) ? (
            <>
              <select
                aria-label={`Tier for ${cand.code}`}
                className="border-input bg-background min-h-9 rounded-md border px-2 text-xs"
                value={pick}
                onChange={(e) => setPick(e.target.value)}
              >
                {TIERS.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </select>
              <Button size="sm" disabled={setTier.isPending} onClick={() => setTier.mutate()}>
                Set tier
              </Button>
            </>
          ) : null}
        </div>
        <CaptureDialog ws={ws} cand={cand} open={open} onOpenChange={setOpen} />
      </td>
    </tr>
  );
}

function LoadForm({ ws }: { ws: Workspace }) {
  const cycles = ws.cycles.filter((c) => ws.gateAt("G3", c.cycle_no));
  const [cycle, setCycle] = useState(String(cycles[cycles.length - 1]?.cycle_no ?? 0));
  const [before, setBefore] = useState("");
  const [after, setAfter] = useState("");
  const [exp, setExp] = useState("");
  const [tx, setTx] = useState(true);
  const [folder, setFolder] = useState("");
  const [hash, setHash] = useState("");
  const [reg, setReg] = useState("");
  const [sync, setSync] = useState("");
  const parse = (t: string) =>
    Object.fromEntries(
      t
        .split(/[\n,]/)
        .map((p) => p.trim())
        .filter(Boolean)
        .map((p) => {
          const [k, v] = p.split("=");
          return [k!.trim(), Number(v)];
        }),
    );
  const save = useDbAction(
    ws,
    async () => {
      const { error } = await supabase.from("project_load_reports").insert({
        project_id: ws.project.id,
        cycle_no: Number(cycle),
        counts_before: parse(before),
        counts_after: parse(after),
        expected_new: parse(exp),
        single_transaction: tx,
        case_folder_ref: folder.trim(),
        manifest_sha256: hash.trim().toLowerCase(),
        register_entry_ref: reg.trim(),
        sync_log: sync.trim() || null,
        recorded_by_name: ws.me.name || null,
      });
      if (error) throw error;
    },
    "Load report recorded",
  );
  if (!cycles.length)
    return <Locked>A load report follows a completed read (G3) for a cycle.</Locked>;
  if (!ws.has("owner", "data_steward"))
    return <Locked>The data steward records the load report.</Locked>;
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="grid gap-1.5">
        <label className="text-sm font-medium" htmlFor="ld-c">
          Cycle
        </label>
        <select
          id="ld-c"
          className={selectCls}
          value={cycle}
          onChange={(e) => setCycle(e.target.value)}
        >
          {cycles.map((c) => (
            <option key={c.id} value={c.cycle_no}>
              Cycle {c.cycle_no}
            </option>
          ))}
        </select>
      </div>
      <label className="flex min-h-11 items-center gap-2 text-sm">
        <input
          type="checkbox"
          className="size-5"
          checked={tx}
          onChange={(e) => setTx(e.target.checked)}
        />{" "}
        Loaded in one transaction (an error rolls everything back)
      </label>
      <AreaIn
        label="Counts before (table=number, comma or line separated)"
        value={before}
        onChange={setBefore}
        rows={3}
      />
      <AreaIn label="Counts after" value={after} onChange={setAfter} rows={3} />
      <AreaIn
        className="sm:col-span-2"
        label="New rows expected"
        value={exp}
        onChange={setExp}
        rows={2}
        hint="After minus before must equal what you expected for every table, or the load does not reconcile."
      />
      <TextIn
        label="Case folder (01_Intake/CASE_<platform>_<handle>_<window>_<date>/)"
        value={folder}
        onChange={setFolder}
      />
      <TextIn label="SHA-256 of the folder manifest" value={hash} onChange={setHash} />
      <TextIn label="Case register entry" value={reg} onChange={setReg} />
      <TextIn
        label="Sync log reference"
        value={sync}
        onChange={setSync}
        hint="The sync routine runs after every scan, reading or ruling: it merges validated decisions, loads, extracts hashtags and lists pending translations."
      />
      <div className="sm:col-span-2">
        <Submit
          pending={save.isPending}
          disabled={
            !before.trim() ||
            !after.trim() ||
            !exp.trim() ||
            !folder.trim() ||
            hash.trim().length !== 64 ||
            !reg.trim()
          }
          onClick={() => save.mutate()}
        >
          Record load report
        </Submit>
      </div>
    </div>
  );
}

export function EvidenceTab({ ws }: { ws: Workspace }) {
  const flagged = ws.candidates.filter(
    (c) => !c.voided && ws.decisions.get(c.id)?.decision === "flag",
  );
  return (
    <div className="space-y-6">
      <Section
        id="flag-h"
        title="Evidence capture and tiers (Phase 5)"
        hint="Upgrade flagged items from raw data to evidence. Capture is the slowest phase; it can run after Phase 7 and upgrade tiers in place. API-only and element-crop data are not proof. Only items with the full chain are."
      >
        <div className="relative -m-5 overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="text-muted-foreground text-left text-xs uppercase">
              <tr>
                <th className="px-3 py-3">Item</th>
                <th className="px-3 py-3">Flag</th>
                <th className="px-3 py-3">Capture</th>
                <th className="px-3 py-3">Tier</th>
                <th className="px-3 py-3">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {flagged.map((c) => (
                <FlaggedRow key={c.id} ws={ws} cand={c} />
              ))}
            </tbody>
          </table>
          {!flagged.length ? (
            <p className="text-muted-foreground px-4 py-6 text-sm">
              No flagged items yet. Flags come from Phase 4.
            </p>
          ) : null}
        </div>
      </Section>

      <Section
        id="enr-h"
        title="Enrichment (Phase 6)"
        hint="Machine-translate non-English comments into an English column and mark it as unreviewed machine translation; the verbatim original is never replaced. Extract hashtags. Link authors across cases where the same account appears more than once."
      >
        <p className="text-muted-foreground text-sm">
          Translations show beside each candidate as “machine translation, unreviewed”. Hashtag and
          author links are produced by the sync routine on the Mac Studio and listed in the load
          report’s sync log.
        </p>
      </Section>

      <Section
        id="load-h"
        title="Load and register (Phase 7)"
        hint="Load comments, profiles and findings into the engagement database in one transaction; compare counts before and after; set the tier on the loaded rows; add the case to the register."
      >
        <ul className="divide-border mb-5 divide-y">
          {ws.loadReports.map((l) => (
            <li key={l.id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
              <span>Cycle {l.cycle_no}</span>
              <Chip
                tone={
                  l.reconciled ? "bg-done text-done-foreground" : "bg-failed text-failed-foreground"
                }
              >
                {l.reconciled ? "counts reconcile" : "does not reconcile"}
              </Chip>
              <span className="text-muted-foreground text-xs">
                {formatDateTime(l.recorded_at)} · {l.register_entry_ref} · {l.case_folder_ref}
              </span>
            </li>
          ))}
          {!ws.loadReports.length ? (
            <li className="text-muted-foreground py-2 text-sm">No load report yet.</li>
          ) : null}
        </ul>
        <LoadForm ws={ws} />
      </Section>
    </div>
  );
}
