import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowDown, ArrowUp, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { formatDateTime } from "@/lib/format";
import {
  CRITERION_KIND_LABEL,
  OUTPUT_KINDS,
  outputKindLabel,
  useMe,
  type Brief,
  type CriterionKind,
  type OutputKind,
  type Workspace,
} from "@/lib/projects";
import { cn } from "@/lib/utils";

type DraftCriterion = {
  key: string;
  kind: CriterionKind;
  label: string;
  description: string;
  required: boolean;
};

type Draft = {
  question: string;
  background: string;
  scope: string;
  out_of_scope: string;
  period_from: string;
  period_to: string;
  platforms: string;
  audience: string;
  output_kinds: OutputKind[];
  constraints: string;
  change_note: string;
  criteria: DraftCriterion[];
};

let keySeq = 0;
const newKey = () => `c${++keySeq}`;

function draftFrom(ws: Workspace): Draft {
  const b = ws.current;
  return {
    question: b?.question ?? "",
    background: b?.background ?? "",
    scope: b?.scope ?? "",
    out_of_scope: b?.out_of_scope ?? "",
    period_from: b?.period_from ?? "",
    period_to: b?.period_to ?? "",
    platforms: (b?.platforms ?? []).join(", "),
    audience: b?.audience ?? "",
    output_kinds: (b?.output_kinds ?? []) as OutputKind[],
    constraints: b?.constraints ?? "",
    change_note: "",
    criteria: ws.criteria.length
      ? ws.criteria.map((c) => ({
          key: newKey(),
          kind: c.kind as CriterionKind,
          label: c.label,
          description: c.description ?? "",
          required: c.required,
        }))
      : [{ key: newKey(), kind: "inclusion", label: "", description: "", required: true }],
  };
}

export function ProjectBriefTab({ ws }: { ws: Workspace }) {
  const [editing, setEditing] = useState(false);
  const [viewId, setViewId] = useState<string | null>(null);
  const shown = ws.briefs.find((b) => b.id === viewId) ?? ws.current;
  const shownCriteria = ws.allCriteria.filter((c) => c.brief_id === shown?.id);

  if (editing || (!ws.current && ws.canManage)) {
    return <BriefEditor ws={ws} onDone={() => setEditing(false)} first={!ws.current} />;
  }
  if (!shown) {
    return (
      <p className="panel text-muted-foreground p-6 text-sm">
        No brief yet. The project lead writes it.
      </p>
    );
  }
  const superseded = shown.id !== ws.current?.id;

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="space-y-6 lg:col-span-2">
        {superseded ? (
          <div className="bg-queued/60 rounded-xl border px-4 py-3 text-sm" role="status">
            You are looking at version {shown.version}, which has been superseded.{" "}
            <button className="font-semibold underline" onClick={() => setViewId(null)}>
              Show the current version
            </button>
          </div>
        ) : null}
        <BriefView brief={shown} />
        <section className="panel overflow-hidden" aria-labelledby="crit-h">
          <h2 id="crit-h" className="border-b px-5 py-4 font-semibold">
            Criteria · v{shown.version}
          </h2>
          {shownCriteria.length ? (
            <ol className="divide-border divide-y">
              {shownCriteria.map((c) => (
                <li key={c.id} className="flex gap-3 px-5 py-3">
                  <span className="text-muted-foreground w-6 shrink-0 font-mono text-sm">
                    {c.position}
                  </span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="bg-secondary text-secondary-foreground rounded-full px-2 py-0.5 text-xs font-semibold">
                        {CRITERION_KIND_LABEL[c.kind as CriterionKind] ?? c.kind}
                      </span>
                      <span className="text-sm font-medium">{c.label}</span>
                      {c.required ? (
                        <span className="text-muted-foreground text-xs">required</span>
                      ) : null}
                    </div>
                    {c.description ? (
                      <p className="text-muted-foreground mt-1 text-sm">{c.description}</p>
                    ) : null}
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-muted-foreground px-5 py-4 text-sm">No criteria in this version.</p>
          )}
        </section>
      </div>
      <div className="space-y-6">
        {ws.canManage ? (
          <Button className="min-h-11 w-full" onClick={() => setEditing(true)}>
            New version of the brief
          </Button>
        ) : null}
        <section className="panel overflow-hidden" aria-labelledby="ver-h">
          <h2 id="ver-h" className="border-b px-5 py-4 font-semibold">
            Versions
          </h2>
          <ul className="divide-border divide-y">
            {ws.briefs.map((b) => (
              <li key={b.id}>
                <button
                  onClick={() => setViewId(b.id)}
                  className={cn(
                    "hover:bg-muted w-full px-5 py-3 text-left",
                    b.id === shown.id && "bg-muted",
                  )}
                >
                  <div className="text-sm font-medium">
                    v{b.version}
                    {b.id === ws.current?.id ? " · current" : ""}
                  </div>
                  <div className="text-muted-foreground text-xs">
                    {formatDateTime(b.authored_at)}
                    {b.authored_by_name ? ` · ${b.authored_by_name}` : ""}
                  </div>
                  {b.change_note ? <div className="mt-1 text-xs">{b.change_note}</div> : null}
                </button>
              </li>
            ))}
          </ul>
          <p className="text-muted-foreground border-t px-5 py-3 text-xs">
            Briefs are never edited. Each output records the version it answers.
          </p>
        </section>
      </div>
    </div>
  );
}

function BriefView({ brief }: { brief: Brief }) {
  const row = (label: string, value: string | null | undefined) =>
    value ? (
      <div className="space-y-1">
        <div className="text-muted-foreground text-xs font-semibold uppercase">{label}</div>
        <p className="text-sm whitespace-pre-wrap">{value}</p>
      </div>
    ) : null;
  return (
    <section className="panel space-y-4 p-5" aria-labelledby="brief-h">
      <h2 id="brief-h" className="text-lg leading-snug font-semibold">
        {brief.question}
      </h2>
      {row("Background", brief.background)}
      {row("Scope", brief.scope)}
      {row("Out of scope", brief.out_of_scope)}
      {row(
        "Period",
        brief.period_from || brief.period_to
          ? `${brief.period_from ?? "…"} to ${brief.period_to ?? "…"}`
          : null,
      )}
      {row("Platforms", brief.platforms.join(", "))}
      {row("Audience", brief.audience)}
      {row("Outputs", brief.output_kinds.map(outputKindLabel).join(", "))}
      {row("Constraints", brief.constraints)}
    </section>
  );
}

function BriefEditor({ ws, onDone, first }: { ws: Workspace; onDone: () => void; first: boolean }) {
  const qc = useQueryClient();
  const me = useMe();
  const [d, setD] = useState<Draft>(() => draftFrom(ws));
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }));
  const setCrit = (key: string, patch: Partial<DraftCriterion>) =>
    set(
      "criteria",
      d.criteria.map((c) => (c.key === key ? { ...c, ...patch } : c)),
    );
  const move = (i: number, by: number) => {
    const next = [...d.criteria];
    const [c] = next.splice(i, 1);
    next.splice(i + by, 0, c!);
    set("criteria", next);
  };

  const save = useMutation({
    mutationFn: async () => {
      const { data: brief, error } = await supabase
        .from("project_briefs")
        .insert({
          project_id: ws.project.id,
          version: 0, // assigned by the database
          question: d.question.trim(),
          background: d.background.trim() || null,
          scope: d.scope.trim() || null,
          out_of_scope: d.out_of_scope.trim() || null,
          period_from: d.period_from || null,
          period_to: d.period_to || null,
          platforms: d.platforms
            .split(",")
            .map((p) => p.trim())
            .filter(Boolean),
          audience: d.audience.trim() || null,
          output_kinds: d.output_kinds,
          constraints: d.constraints.trim() || null,
          change_note: d.change_note.trim() || (first ? "First version" : null),
          authored_by_name: me.data?.name || null,
        })
        .select("id, version")
        .single();
      if (error) throw error;
      const rows = d.criteria
        .filter((c) => c.label.trim())
        .map((c, i) => ({
          brief_id: brief.id,
          project_id: ws.project.id,
          position: i + 1,
          kind: c.kind,
          label: c.label.trim(),
          description: c.description.trim() || null,
          required: c.required,
        }));
      if (rows.length) {
        const { error: cErr } = await supabase.from("project_criteria").insert(rows);
        if (cErr) throw cErr;
      }
      return brief.version;
    },
    onSuccess: (v) => {
      void qc.invalidateQueries({ queryKey: ["project", ws.project.id] });
      toast.success(`Brief version ${v} saved`);
      onDone();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not save the brief"),
  });

  const periodBad = d.period_from && d.period_to && d.period_to < d.period_from;
  const ok =
    d.question.trim() &&
    !periodBad &&
    (first || d.change_note.trim()) &&
    d.criteria.some((c) => c.label.trim());

  const text = (k: keyof Draft, label: string, rows = 2, hint?: string) => (
    <div className="grid gap-1.5">
      <Label htmlFor={`b-${k}`}>{label}</Label>
      <Textarea
        id={`b-${k}`}
        rows={rows}
        value={d[k] as string}
        onChange={(e) => set(k, e.target.value as never)}
      />
      {hint ? <p className="text-muted-foreground text-xs">{hint}</p> : null}
    </div>
  );

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <section className="panel space-y-4 p-5 lg:col-span-2" aria-labelledby="ed-h">
        <h2 id="ed-h" className="font-semibold">
          {first ? "Write the brief" : `New version (v${(ws.current?.version ?? 0) + 1})`}
        </h2>
        {text("question", "The question the client needs answered", 2)}
        {text("background", "Background", 3)}
        {text("scope", "Scope", 2, "What is in: accounts, places, themes.")}
        {text("out_of_scope", "Out of scope", 2)}
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="grid gap-1.5">
            <Label htmlFor="b-from">Period from</Label>
            <Input
              id="b-from"
              type="date"
              value={d.period_from}
              onChange={(e) => set("period_from", e.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="b-to">Period to</Label>
            <Input
              id="b-to"
              type="date"
              value={d.period_to}
              aria-invalid={!!periodBad}
              onChange={(e) => set("period_to", e.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="b-plat">Platforms</Label>
            <Input
              id="b-plat"
              placeholder="facebook, tiktok, x"
              value={d.platforms}
              onChange={(e) => set("platforms", e.target.value)}
            />
          </div>
        </div>
        {text("audience", "Who will read the output", 1)}
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Outputs to deliver</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {OUTPUT_KINDS.map((k) => (
              <label
                key={k.id}
                className="hover:bg-muted flex min-h-11 cursor-pointer items-start gap-2 rounded-lg border p-3"
              >
                <Checkbox
                  checked={d.output_kinds.includes(k.id)}
                  onCheckedChange={(v) =>
                    set(
                      "output_kinds",
                      v ? [...d.output_kinds, k.id] : d.output_kinds.filter((x) => x !== k.id),
                    )
                  }
                  className="mt-0.5"
                />
                <span>
                  <span className="block text-sm font-medium">{k.label}</span>
                  <span className="text-muted-foreground block text-xs">{k.blurb}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        {text("constraints", "Constraints", 2, "Deadlines, sensitivities, what may not be shared.")}

        <fieldset className="space-y-3 border-t pt-4">
          <legend className="font-semibold">Criteria</legend>
          <p className="text-muted-foreground text-xs">
            Each linked item is assessed against these. An item meets the brief when every required
            and inclusion criterion is met and no exclusion criterion is.
          </p>
          {d.criteria.map((c, i) => (
            <div key={c.key} className="space-y-2 rounded-lg border p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-muted-foreground w-5 font-mono text-sm">{i + 1}</span>
                <Select
                  value={c.kind}
                  onValueChange={(v) => setCrit(c.key, { kind: v as CriterionKind })}
                >
                  <SelectTrigger className="w-36" aria-label={`Criterion ${i + 1} type`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(CRITERION_KIND_LABEL) as CriterionKind[]).map((k) => (
                      <SelectItem key={k} value={k}>
                        {CRITERION_KIND_LABEL[k]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  className="min-w-48 flex-1"
                  aria-label={`Criterion ${i + 1}`}
                  placeholder="e.g. Calls for people to gather in person"
                  value={c.label}
                  onChange={(e) => setCrit(c.key, { label: e.target.value })}
                />
                <label className="flex items-center gap-1.5 text-sm">
                  <Checkbox
                    checked={c.required}
                    onCheckedChange={(v) => setCrit(c.key, { required: Boolean(v) })}
                  />
                  Required
                </label>
                <div className="flex">
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Move up"
                    disabled={i === 0}
                    onClick={() => move(i, -1)}
                  >
                    <ArrowUp className="size-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Move down"
                    disabled={i === d.criteria.length - 1}
                    onClick={() => move(i, 1)}
                  >
                    <ArrowDown className="size-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Remove criterion"
                    onClick={() =>
                      set(
                        "criteria",
                        d.criteria.filter((x) => x.key !== c.key),
                      )
                    }
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </div>
              <Textarea
                rows={1}
                aria-label={`Criterion ${i + 1} guidance`}
                placeholder="Guidance for the analyst (optional)"
                value={c.description}
                onChange={(e) => setCrit(c.key, { description: e.target.value })}
              />
            </div>
          ))}
          <Button
            variant="outline"
            onClick={() =>
              set("criteria", [
                ...d.criteria,
                { key: newKey(), kind: "assessment", label: "", description: "", required: false },
              ])
            }
          >
            <Plus className="size-4" /> Add criterion
          </Button>
        </fieldset>
      </section>

      <div className="space-y-4">
        {!first ? (
          <div className="panel space-y-2 p-5">
            {text("change_note", "What changed and why", 3, "Required. Shown in the version list.")}
          </div>
        ) : null}
        <div className="panel space-y-3 p-5 text-sm">
          <p className="text-muted-foreground">
            Saving creates version {(ws.current?.version ?? 0) + 1}. Earlier versions stay as they
            were; outputs already made keep pointing at the version they answered.
          </p>
          <Button
            className="min-h-11 w-full"
            disabled={!ok || save.isPending}
            onClick={() => save.mutate()}
          >
            {save.isPending ? <Loader2 className="size-4 animate-spin" /> : null} Save version
          </Button>
          {!first ? (
            <Button variant="outline" className="min-h-11 w-full" onClick={onDone}>
              Cancel
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
