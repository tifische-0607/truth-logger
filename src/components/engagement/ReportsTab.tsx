import { useRef, useState } from "react";
import { Download, FileUp, Hammer, Plus } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import type { TablesInsert, TablesUpdate } from "@/integrations/supabase/types";
import { HashChip } from "@/components/HashChip";
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
import {
  BuildBlocked,
  sha256Hex,
  attachFile,
  build,
  saveBlob,
  storagePath,
  type Built,
} from "@/lib/engagement-outputs";
import { formatBytes, formatDateTime } from "@/lib/format";
import {
  ATTRIBUTION,
  OUTPUT_KINDS,
  type Measure,
  OUTPUT_STATUS_LABEL,
  OUTPUT_STATUS_STYLE,
  outputKindLabel,
  type Output,
  type OutputKind,
  useHomeVault,
  type Workspace,
} from "@/lib/projects";
import { cn } from "@/lib/utils";

const selectCls = "border-input bg-background min-h-11 rounded-md border px-3 text-sm";
const DOC_KINDS = [
  "executive_brief",
  "findings_tables",
  "network_map",
  "limits_statement",
  "release_pack",
];

function NewOutput({
  ws,
  open,
  onOpenChange,
}: {
  ws: Workspace;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [kind, setKind] = useState<OutputKind>("executive_brief");
  const [title, setTitle] = useState("");
  const [cycles, setCycles] = useState<number[]>(ws.cycles.map((c) => c.cycle_no));
  const save = useDbAction(
    ws,
    async () => {
      const { error } = await supabase.from("project_outputs").insert({
        project_id: ws.project.id,
        brief_id: ws.briefInForce!.id,
        kind,
        title: title.trim() || `${outputKindLabel(kind)} — ${ws.project.code}`,
        cycle_nos: cycles,
        created_by_name: ws.me.name || null,
      });
      if (error) throw error;
    },
    "Draft created",
    () => {
      setTitle("");
      onOpenChange(false);
    },
  );
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New output</DialogTitle>
          <DialogDescription>
            Answers the brief in force (v{ws.briefInForce?.version}). Everything starts as a draft
            and is HELD after QA until the Curator releases it.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <label className="text-sm font-medium" htmlFor="no-kind">
              Type
            </label>
            <select
              id="no-kind"
              className={selectCls}
              value={kind}
              onChange={(e) => setKind(e.target.value as OutputKind)}
            >
              {OUTPUT_KINDS.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.label}
                </option>
              ))}
            </select>
            <p className="text-muted-foreground text-xs">
              {OUTPUT_KINDS.find((k) => k.id === kind)?.blurb}
            </p>
          </div>
          <TextIn label="Title" value={title} onChange={setTitle} />
          <fieldset>
            <legend className="text-sm font-medium">Cycles it covers</legend>
            <div className="mt-1 flex flex-wrap gap-3">
              {ws.cycles.map((c) => (
                <label key={c.id} className="flex min-h-9 items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="size-4"
                    checked={cycles.includes(c.cycle_no)}
                    onChange={(e) =>
                      setCycles(
                        e.target.checked
                          ? [...cycles, c.cycle_no]
                          : cycles.filter((x) => x !== c.cycle_no),
                      )
                    }
                  />
                  Cycle {c.cycle_no}
                </label>
              ))}
            </div>
          </fieldset>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Submit pending={save.isPending} onClick={() => save.mutate()}>
            Create draft
          </Submit>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Reporting against the brief: every research question, success measure and scenario needs an entry. */
function EntryEditor({ ws, o }: { ws: Workspace; o: Output }) {
  const have = (k: string, key: string) =>
    ws.entries.some((e) => e.output_id === o.id && e.entry_kind === k && e.ref_key === key);
  type Todo = { k: string; key: string; label: string; m?: Measure };
  const todo: Todo[] = [
    ...ws.rqs.map((r) => ({ k: "research_question", key: r.rq_no, label: r.question })),
    ...ws.measures.map((m) => ({ k: "success_measure", key: m.measure_no, label: m.measure, m })),
    ...ws.scenarios.map((s) => ({ k: "scenario_watch", key: s.scenario_no, label: s.name })),
  ];
  const [text, setText] = useState<Record<string, string>>({});
  const [extra, setExtra] = useState<Record<string, string>>({});
  const save = useDbAction(
    ws,
    async (t: Todo) => {
      const id = `${t.k}:${t.key}`;
      const row: Record<string, unknown> & {
        project_id: string;
        output_id: string;
        entry_kind: string;
        ref_key: string;
      } = {
        project_id: ws.project.id,
        output_id: o.id,
        entry_kind: t.k,
        ref_key: t.key,
        created_by_name: ws.me.name || null,
      };
      if (t.k === "success_measure" && t.m && !t.m.observable) row["out_of_reach"] = true;
      else row["finding"] = (text[id] ?? "").trim();
      if (t.k === "success_measure" && t.m?.level === "impact") row["client_figure"] = true;
      if (t.k === "scenario_watch") {
        row["met"] = (extra[id + "m"] ?? "no") === "yes";
        row["evidence_tier"] = extra[id + "t"] || "BROWSER_DOM_ONLY";
        row["counts"] = { note: (text[id] ?? "").trim() || "none" };
        row["finding"] = (text[id] ?? "").trim() || null;
      }
      const { error } = await supabase
        .from("project_report_entries")
        .insert(row as TablesInsert<"project_report_entries">);
      if (error) throw error;
    },
    "Entry recorded",
  );
  return (
    <div className="space-y-3">
      <p className="text-muted-foreground text-xs">
        Report against the brief: answer each research question, then each success measure, using
        FA's own data; then state for each scenario whether its trigger indicators were met, with
        counts and the tier of evidence. Impact comes only from client records. A measure FA cannot
        observe is listed as out of reach.
      </p>
      <ul className="divide-border divide-y">
        {todo.map((t) => {
          const id = `${t.k}:${t.key}`;
          const ok = have(t.k, t.key);
          const oor = !!t.m && !t.m.observable;
          return (
            <li key={id} className="grid gap-2 py-3 sm:grid-cols-[8rem_1fr_auto] sm:items-start">
              <div className="text-sm">
                <span className="font-mono font-bold">{t.key}</span>
                <div className="text-muted-foreground text-xs">{t.k.replace(/_/g, " ")}</div>
              </div>
              <div className="space-y-1.5">
                <p className="text-sm">{t.label}</p>
                {ok ? (
                  <p className="text-done-foreground text-xs">
                    Recorded:{" "}
                    {ws.entries.filter((e) => e.output_id === o.id && e.ref_key === t.key).pop()
                      ?.finding ?? (oor ? "out of reach" : "")}
                  </p>
                ) : oor ? (
                  <p className="text-muted-foreground text-xs">Out of reach: not estimated.</p>
                ) : (
                  <>
                    <AreaIn
                      label={`Finding for ${t.key}`}
                      value={text[id] ?? ""}
                      onChange={(v) => setText({ ...text, [id]: v })}
                      rows={2}
                    />
                    {t.k === "scenario_watch" ? (
                      <div className="flex flex-wrap gap-2">
                        <select
                          aria-label={`${t.key} triggers met`}
                          className="border-input bg-background min-h-9 rounded-md border px-2 text-sm"
                          value={extra[id + "m"] ?? "no"}
                          onChange={(e) => setExtra({ ...extra, [id + "m"]: e.target.value })}
                        >
                          <option value="no">Trigger indicators not met</option>
                          <option value="yes">Trigger indicators met</option>
                        </select>
                        <select
                          aria-label={`${t.key} tier`}
                          className="border-input bg-background min-h-9 rounded-md border px-2 text-sm"
                          value={extra[id + "t"] ?? "BROWSER_DOM_ONLY"}
                          onChange={(e) => setExtra({ ...extra, [id + "t"]: e.target.value })}
                        >
                          <option value="API_RAW_ONLY">API raw only</option>
                          <option value="BROWSER_DOM_ONLY">Browser DOM only</option>
                          <option value="ELEMENT_CROP">Element crop</option>
                          <option value="FA_STD_001_V2">FA-STD-001 V2</option>
                        </select>
                      </div>
                    ) : null}
                  </>
                )}
              </div>
              <div>
                {ok ? (
                  <Chip tone="bg-done text-done-foreground">done</Chip>
                ) : oor ? (
                  <Button size="sm" variant="outline" onClick={() => save.mutate(t)}>
                    List as out of reach
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    disabled={!(text[id] ?? "").trim() && t.k !== "scenario_watch"}
                    onClick={() => save.mutate(t)}
                  >
                    Record
                  </Button>
                )}
              </div>
            </li>
          );
        })}
        {!todo.length ? (
          <li className="text-muted-foreground py-2 text-sm">
            The brief has no research questions, measures or scenarios to report against.
          </li>
        ) : null}
      </ul>
    </div>
  );
}

function OutputCard({
  ws,
  o,
  onProblems,
}: {
  ws: Workspace;
  o: Output;
  onProblems: (p: { code: string; filename: string | null; reason: string }[]) => void;
}) {
  const home = useHomeVault();
  const fileRef = useRef<HTMLInputElement>(null);
  const [entries, setEntries] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const kind = o.kind as OutputKind;
  const status = o.status;
  const doc = DOC_KINDS.includes(kind);
  const editable =
    status === "draft" && ws.has("owner", "engagement_lead", "lead_analyst", "data_steward");
  const released = status === "released";
  const brief = ws.briefs.find((b) => b.id === o.brief_id);
  const record = async (b: Built) => {
    let location: string | null = null;
    if (b.uploadable) {
      const p = storagePath(ws, o.id, b.fileName);
      const { error } = await supabase.storage.from("evidence").upload(p, b.blob, {
        contentType: b.blob.type || "application/octet-stream",
        upsert: false,
      });
      if (error) throw error;
      location = p;
    }
    const { error } = await supabase
      .from("project_outputs")
      .update({
        sha256: b.sha256,
        file_name: b.fileName,
        size_bytes: b.sizeBytes,
        item_count: b.itemCount,
        params: b.params as never,
        location,
      })
      .eq("id", o.id);
    if (error) throw error;
  };
  const make = useDbAction(
    ws,
    async () => {
      setProgress("Building…");
      const b = await build(kind, ws, {
        homeSources: home.online ? home.sources : [],
        handler: ws.me.name || "analyst",
        cycles: o.cycle_nos,
        progress: (d, t) => setProgress(`Verifying files ${d} of ${t}…`),
      });
      await record(b);
      if (kind !== "dashboard") saveBlob(b.blob, b.fileName);
      return b;
    },
    "Built and hashed",
  );
  const attach = useDbAction(
    ws,
    async (f: File) => {
      await record(await attachFile(ws, f));
    },
    "Attached and hashed",
  );
  const patch = useDbAction(ws, async (p: TablesUpdate<"project_outputs">) => {
    const { error } = await supabase.from("project_outputs").update(p).eq("id", o.id);
    if (error) throw error;
  });
  const dl = useDbAction(
    ws,
    async () => {
      const { data, error } = await supabase.storage.from("evidence").download(o.location!);
      if (error || !data) throw error ?? new Error("File not found");
      const got = await sha256Hex(await data.arrayBuffer());
      if (o.sha256 && got !== o.sha256)
        throw new Error("The stored file does not match its recorded hash");
      saveBlob(data, o.file_name ?? "output");
      await supabase.from("project_events").insert({
        project_id: ws.project.id,
        output_id: o.id,
        action: "output:downloaded",
        actor: ws.me.uid,
        detail: { sha256: got },
      });
    },
    "Downloaded; hash verified",
  );
  const run = () =>
    make
      .mutateAsync()
      .catch((e) => {
        if (e instanceof BuildBlocked) onProblems(e.problems);
      })
      .finally(() => setProgress(null));
  const busy = make.isPending || attach.isPending || patch.isPending;
  return (
    <article className="panel space-y-3 p-4" aria-label={o.title}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Chip>{outputKindLabel(kind)}</Chip>
            <Chip tone={OUTPUT_STATUS_STYLE[status]}>{OUTPUT_STATUS_LABEL[status]}</Chip>
            {o.shared_with_client ? (
              <Chip tone="bg-done text-done-foreground">shared with client</Chip>
            ) : null}
            <span
              className={cn(
                "text-xs",
                brief && ws.briefInForce && brief.id !== ws.briefInForce.id
                  ? "text-warn-foreground font-semibold"
                  : "text-muted-foreground",
              )}
            >
              brief v{brief?.version ?? "?"}
              {brief && ws.briefInForce && brief.id !== ws.briefInForce.id
                ? " (amended since)"
                : ""}{" "}
              · cycles {o.cycle_nos.join(", ") || "—"}
            </span>
          </div>
          <h3 className="mt-1 font-semibold">{o.title}</h3>
          <div className="text-muted-foreground text-xs">
            {o.created_by_name ?? "—"} · {formatDateTime(o.created_at)}
            {o.qa_at ? ` · QA passed ${formatDateTime(o.qa_at)}` : ""}
            {o.released_at ? ` · released ${formatDateTime(o.released_at)}` : ""}
          </div>
        </div>
        {progress ? <span className="text-muted-foreground text-xs">{progress}</span> : null}
      </div>
      {o.file_name ? (
        <div className="bg-muted/50 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg px-3 py-2 text-xs">
          <span className="font-mono">{o.file_name}</span>
          <span>{formatBytes(o.size_bytes)}</span>
          <span>{o.item_count ?? 0} items</span>
          <HashChip value={o.sha256} />
          {!o.location ? (
            <span className="text-home-foreground">
              Kept on the building device only (home-vault content)
            </span>
          ) : null}
        </div>
      ) : (
        <p className="text-muted-foreground text-xs">No file yet.</p>
      )}
      {doc ? (
        <label className="flex min-h-10 items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="size-5"
            disabled={!editable}
            checked={o.attribution_checked}
            onChange={(e) => patch.mutate({ attribution_checked: e.target.checked })}
          />{" "}
          Attribution line checked on every page: “{ATTRIBUTION}”
        </label>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        {editable ? (
          <>
            {kind !== "network_map" ? (
              <Button variant="outline" className="min-h-10" disabled={busy} onClick={run}>
                <Hammer className="size-4" />{" "}
                {o.sha256
                  ? "Rebuild"
                  : kind === "executive_brief" || kind === "limits_statement"
                    ? "Build skeleton"
                    : "Build"}
              </Button>
            ) : null}
            <input
              ref={fileRef}
              type="file"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) attach.mutate(f);
                e.target.value = "";
              }}
            />
            {[
              "executive_brief",
              "network_map",
              "limits_statement",
              "findings_tables",
              "dataset",
            ].includes(kind) ? (
              <Button
                variant="outline"
                className="min-h-10"
                disabled={busy}
                onClick={() => fileRef.current?.click()}
              >
                <FileUp className="size-4" /> Attach final file
              </Button>
            ) : null}
          </>
        ) : null}
        {kind === "executive_brief" && status === "draft" ? (
          <Button variant="outline" className="min-h-10" onClick={() => setEntries((v) => !v)}>
            {entries ? "Hide" : "Report against the brief"}
          </Button>
        ) : null}
        {o.location ? (
          <Button
            variant="ghost"
            className="min-h-10"
            disabled={dl.isPending}
            onClick={() => dl.mutate()}
          >
            <Download className="size-4" /> Download
          </Button>
        ) : null}
        <span className="flex-1" />
        {status === "draft" &&
        ws.has("owner", "engagement_lead", "lead_analyst", "data_steward") ? (
          <Button
            className="min-h-10"
            disabled={busy}
            onClick={() => patch.mutate({ status: "qa_review" })}
          >
            Submit for QA
          </Button>
        ) : null}
        {status === "qa_review" ? (
          <>
            <Button
              variant="outline"
              className="min-h-10"
              disabled={busy}
              onClick={() => patch.mutate({ status: "draft" })}
            >
              Back to draft
            </Button>
            {ws.has("owner", "engagement_lead", "lead_analyst") && o.created_by !== ws.me.uid ? (
              <Button
                className="min-h-10"
                disabled={busy}
                onClick={() => patch.mutate({ status: "held" })}
              >
                Pass QA (HELD)
              </Button>
            ) : null}
          </>
        ) : null}
        {status === "held" ? (
          <span className="text-xs">Held for the Curator's written approval (G5, Release tab).</span>
        ) : null}
        {released && ws.canManage ? (
          <Button
            variant="outline"
            className="min-h-10"
            disabled={busy}
            title={ws.client?.portal_enabled ? undefined : "The client portal is off"}
            onClick={() => patch.mutate({ shared_with_client: !o.shared_with_client })}
          >
            {o.shared_with_client ? "Stop sharing" : "Share with client"}
          </Button>
        ) : null}
        {status !== "withdrawn" && (ws.canManage || ws.me.isCurator) ? (
          <Button
            variant="ghost"
            className="text-failed-foreground min-h-10"
            disabled={busy}
            onClick={() => {
              if (window.confirm("Withdraw this output? It cannot be reinstated."))
                patch.mutate({ status: "withdrawn" });
            }}
          >
            Withdraw
          </Button>
        ) : null}
      </div>
      {entries && kind === "executive_brief" ? (
        <div className="border-t pt-3">
          <EntryEditor ws={ws} o={o} />
        </div>
      ) : null}
    </article>
  );
}

export function ReportsTab({ ws }: { ws: Workspace }) {
  const [newOpen, setNewOpen] = useState(false);
  const [problems, setProblems] = useState<
    { code: string; filename: string | null; reason: string }[] | null
  >(null);
  const mandate = ws.scopeSheet?.mandate ?? "internal_read_only";
  const ready = !!ws.gateAt("G2") && !ws.project.design_stale;
  return (
    <div className="space-y-4">
      <div
        className="bg-muted flex flex-wrap items-center justify-between gap-3 rounded-lg px-4 py-3 text-sm"
        role="note"
      >
        <span>
          <strong>Release control (G5).</strong> Everything finished is HELD. Delivery outside
          FridayAnalytics.org needs written Curator approval, logged with recipient, time and file
          hash.{" "}
          {mandate === "internal_read_only"
            ? "The mandate is internal read-only, so release is blocked."
            : "The mandate allows release through G5."}
        </span>
        <Chip
          tone={
            mandate === "internal_read_only"
              ? "bg-warn text-warn-foreground"
              : "bg-queued text-queued-foreground"
          }
        >
          {mandate === "internal_read_only" ? "Internal only" : "Release allowed via G5"}
        </Chip>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-muted-foreground max-w-3xl text-sm">
          An executive brief reports against the brief: it must answer every research question,
          every success measure and every scenario before it can pass QA. Once an output has passed
          QA its file and hash are fixed. Bundles containing home-vault files stay on the device
          that built them; the hub keeps only the hash.
        </p>
        {ws.has("owner", "engagement_lead", "lead_analyst", "data_steward") ? (
          <Button
            className="min-h-11"
            disabled={!ready || !ws.briefInForce}
            onClick={() => setNewOpen(true)}
          >
            <Plus className="size-4" /> New output
          </Button>
        ) : null}
      </div>
      {!ready ? <Locked>Outputs begin once the design is approved and current (G2).</Locked> : null}
      <div className="space-y-3">
        {ws.outputs.map((o) => (
          <OutputCard key={o.id} ws={ws} o={o} onProblems={setProblems} />
        ))}
        {ready && !ws.outputs.length ? (
          <p className="panel text-muted-foreground p-6 text-sm">No outputs yet.</p>
        ) : null}
      </div>
      {ws.briefInForce ? <NewOutput ws={ws} open={newOpen} onOpenChange={setNewOpen} /> : null}
      <Dialog open={!!problems} onOpenChange={(v) => !v && setProblems(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Not built</DialogTitle>
            <DialogDescription>
              These could not be verified, so nothing was packed. Fix them, then build again.
            </DialogDescription>
          </DialogHeader>
          <ul className="max-h-80 space-y-2 overflow-y-auto text-sm">
            {(problems ?? []).map((p, i) => (
              <li key={i} className="rounded-lg border px-3 py-2">
                <span className="font-mono text-xs font-semibold">{p.code}</span>{" "}
                <span className="text-muted-foreground">{p.filename ?? ""}</span>
                <div>{p.reason}</div>
              </li>
            ))}
          </ul>
          <DialogFooter>
            <Button onClick={() => setProblems(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
