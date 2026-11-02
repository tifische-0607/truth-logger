import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { House, Loader2, Plus, X } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { SourceBadge } from "@/components/SourceBadge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { platformLabel } from "@/lib/darknight";
import { formatDateTime } from "@/lib/format";
import {
  RESULT_LABEL,
  RESULT_STYLE,
  itemVerdict,
  latestResults,
  useMe,
  useProjectPool,
  type AssessmentResult,
  type ItemVerdict,
  type PoolItem,
  type Workspace,
} from "@/lib/projects";
import { cn } from "@/lib/utils";

const VERDICT: Record<ItemVerdict, { label: string; style: string }> = {
  included: { label: "Meets brief", style: "bg-done text-done-foreground" },
  excluded: { label: "Excluded", style: "bg-failed text-failed-foreground" },
  pending: { label: "To assess", style: "bg-queued text-queued-foreground" },
};

function ItemLink({ item }: { item: PoolItem }) {
  return item.kind === "cloud_item" ? (
    <Link
      to="/items/$itemId"
      params={{ itemId: item.refId }}
      className="font-mono text-xs font-semibold hover:underline"
    >
      {item.code}
    </Link>
  ) : (
    <Link
      to="/vault/$sourceId/$recordId"
      params={{ sourceId: item.sourceId, recordId: item.recordId ?? "" }}
      className="font-mono text-xs font-semibold hover:underline"
    >
      {item.code}
    </Link>
  );
}

export function ProjectEvidenceTab({ ws }: { ws: Workspace }) {
  const qc = useQueryClient();
  const me = useMe();
  const [view, setView] = useState<"in" | "pool">("in");
  const [filter, setFilter] = useState<"all" | ItemVerdict>("all");
  const [caseToLink, setCaseToLink] = useState("");
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["project", ws.project.id] });
    void qc.invalidateQueries({ queryKey: ["project-pool"] });
  };

  const accessibleCases = useQuery({
    queryKey: ["cases-for-project-link"],
    enabled: ws.canWork,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cases")
        .select("id, target_of_complaint, status")
        .order("id", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const caseIds = ws.cases.map((c) => c.case_id);
  const pool = useProjectPool(caseIds, view === "pool");
  const linkedRefs = new Set(ws.items.map((i) => i.refId));
  const available = (pool.data ?? []).filter((i) => !linkedRefs.has(i.refId));

  const linkCase = useMutation({
    mutationFn: async (caseId: string) => {
      const { error } = await supabase
        .from("project_cases")
        .insert({ project_id: ws.project.id, case_id: caseId });
      if (error) throw error;
    },
    onSuccess: () => {
      setCaseToLink("");
      refresh();
      toast.success("Case linked — its items are now available to add");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not link the case"),
  });
  const unlinkCase = useMutation({
    mutationFn: async (caseId: string) => {
      const { error } = await supabase
        .from("project_cases")
        .delete()
        .eq("project_id", ws.project.id)
        .eq("case_id", caseId);
      if (error) throw error;
    },
    onSuccess: refresh,
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not unlink"),
  });

  const addItems = useMutation({
    mutationFn: async (items: PoolItem[]) => {
      const rows = items.map((i) =>
        i.kind === "cloud_item"
          ? { project_id: ws.project.id, item_kind: "cloud_item", item_id: i.refId }
          : { project_id: ws.project.id, item_kind: "home_ref", evidence_ref_id: i.refId },
      );
      const { error } = await supabase.from("project_items").insert(rows);
      if (error) throw error;
      return rows.length;
    },
    onSuccess: (n) => {
      refresh();
      toast.success(`${n} item${n === 1 ? "" : "s"} added to the project`);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not add"),
  });
  const removeItem = useMutation({
    mutationFn: async (linkId: string) => {
      const { error } = await supabase.from("project_items").delete().eq("id", linkId);
      if (error) throw error;
    },
    onSuccess: refresh,
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not remove"),
  });

  const assess = useMutation({
    mutationFn: async (a: { linkId: string; criterionId: string; result: AssessmentResult }) => {
      const { error } = await supabase.from("project_assessments").insert({
        project_id: ws.project.id,
        project_item_id: a.linkId,
        criterion_id: a.criterionId,
        result: a.result,
        assessed_by: me.data?.uid ?? null,
        assessed_by_name: me.data?.name || null,
      });
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["project", ws.project.id] }),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not save the assessment"),
  });

  const latest = useMemo(() => latestResults(ws.assessments), [ws.assessments]);
  const linked = ws.items.filter((i) => i.linkId);
  const rows = linked
    .map((i) => ({ item: i, verdict: itemVerdict(i.linkId!, ws.criteria, latest) }))
    .filter((r) => filter === "all" || r.verdict === filter);
  const counts = {
    all: linked.length,
    included: 0,
    excluded: 0,
    pending: 0,
  };
  for (const i of linked) counts[itemVerdict(i.linkId!, ws.criteria, latest)]++;

  const linkable = (accessibleCases.data ?? []).filter((c) => !caseIds.includes(c.id));

  return (
    <div className="grid gap-6 2xl:grid-cols-4">
      <aside className="space-y-4 2xl:col-span-1">
        <section className="panel overflow-hidden" aria-labelledby="pc-h">
          <h2 id="pc-h" className="border-b px-4 py-3 font-semibold">
            Linked cases
          </h2>
          <ul className="divide-border divide-y">
            {ws.cases.map((c) => (
              <li key={c.case_id} className="flex items-center justify-between gap-2 px-4 py-2.5">
                <Link
                  to="/cases/$caseId"
                  params={{ caseId: c.case_id }}
                  className="min-w-0 hover:underline"
                >
                  <div className="font-mono text-xs font-bold">CASE-{c.case_id}</div>
                  <div className="text-muted-foreground truncate text-xs">
                    {c.target ?? "No target"}
                  </div>
                </Link>
                {ws.canManage ? (
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Unlink CASE-${c.case_id}`}
                    onClick={() => unlinkCase.mutate(c.case_id)}
                  >
                    <X className="size-4" />
                  </Button>
                ) : null}
              </li>
            ))}
            {!ws.cases.length ? (
              <li className="text-muted-foreground px-4 py-3 text-sm">
                No cases yet. Link the cases that hold this project's evidence.
              </li>
            ) : null}
          </ul>
          {ws.canWork ? (
            <div className="flex gap-2 border-t p-3">
              <Select value={caseToLink} onValueChange={setCaseToLink}>
                <SelectTrigger className="min-w-0 flex-1" aria-label="Case to link">
                  <SelectValue placeholder="Link a case…" />
                </SelectTrigger>
                <SelectContent>
                  {linkable.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      CASE-{c.id}
                      {c.target_of_complaint ? ` · ${c.target_of_complaint}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                disabled={!caseToLink || linkCase.isPending}
                onClick={() => linkCase.mutate(caseToLink)}
              >
                Link
              </Button>
            </div>
          ) : null}
        </section>
        <p className="text-muted-foreground px-1 text-xs">
          Evidence is shared: linking a case or item puts it in this project without copying it. The
          same item can serve several projects.
        </p>
      </aside>

      <section className="panel min-w-0 overflow-hidden 2xl:col-span-3" aria-label="Items">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
          <div className="flex gap-1" role="tablist">
            {(
              [
                ["in", `In project (${linked.length})`],
                ["pool", "Add from linked cases"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                role="tab"
                aria-selected={view === id}
                onClick={() => setView(id)}
                className={cn(
                  "min-h-10 rounded-lg px-3 text-sm font-medium",
                  view === id ? "bg-primary text-primary-foreground" : "hover:bg-muted",
                )}
              >
                {label}
              </button>
            ))}
          </div>
          {view === "in" ? (
            <div className="flex flex-wrap gap-1">
              {(["all", "pending", "included", "excluded"] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  aria-pressed={filter === f}
                  className={cn(
                    "min-h-9 rounded-full border px-3 text-xs font-medium",
                    filter === f ? "bg-foreground text-background" : "hover:bg-muted",
                  )}
                >
                  {f === "all" ? "All" : VERDICT[f].label} · {counts[f]}
                </button>
              ))}
            </div>
          ) : available.length && ws.canWork ? (
            <Button
              variant="outline"
              disabled={addItems.isPending}
              onClick={() => addItems.mutate(available)}
            >
              <Plus className="size-4" /> Add all {available.length}
            </Button>
          ) : null}
        </div>

        {view === "pool" ? (
          <div className="divide-border divide-y">
            {pool.isLoading ? (
              <p className="text-muted-foreground flex items-center gap-2 px-4 py-6 text-sm">
                <Loader2 className="size-4 animate-spin" /> Loading items from linked cases…
              </p>
            ) : !caseIds.length ? (
              <p className="text-muted-foreground px-4 py-6 text-sm">Link a case first.</p>
            ) : !available.length ? (
              <p className="text-muted-foreground px-4 py-6 text-sm">
                Every item in the linked cases is already in the project.
              </p>
            ) : (
              available.map((i) => (
                <div
                  key={i.refId}
                  className="flex flex-wrap items-start justify-between gap-3 px-4 py-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <ItemLink item={i} />
                      <SourceBadge vault={i.kind === "home_ref" ? "home" : "cloud"} />
                      <span className="text-muted-foreground text-xs">
                        {i.itemType ?? "record"} · {platformLabel(i.platform)} · CASE-{i.caseId} ·{" "}
                        {formatDateTime(i.publishedAt)}
                      </span>
                    </div>
                    {i.snippet ? <p className="mt-1 line-clamp-2 text-sm">{i.snippet}</p> : null}
                  </div>
                  {ws.canWork ? (
                    <Button
                      variant="outline"
                      size="sm"
                      className="min-h-10"
                      disabled={addItems.isPending}
                      onClick={() => addItems.mutate([i])}
                    >
                      Add
                    </Button>
                  ) : null}
                </div>
              ))
            )}
          </div>
        ) : (
          <div className="relative overflow-x-auto">
            <table className="w-full text-sm" style={{ minWidth: 420 + ws.criteria.length * 150 }}>
              <thead className="text-muted-foreground text-left text-xs">
                <tr>
                  <th className="px-4 py-3 font-semibold uppercase">Item</th>
                  {ws.criteria.map((c) => (
                    <th
                      key={c.id}
                      className="w-36 px-2 py-3 align-bottom font-medium"
                      title={c.description ?? undefined}
                    >
                      <span className="text-muted-foreground font-mono">{c.position}.</span>{" "}
                      {c.label}
                      {c.required ? " *" : ""}
                    </th>
                  ))}
                  <th className="px-4 py-3 font-semibold uppercase">Verdict</th>
                  {ws.canManage ? (
                    <th className="px-2 py-3">
                      <span className="sr-only">Remove</span>
                    </th>
                  ) : null}
                </tr>
              </thead>
              <tbody>
                {rows.map(({ item, verdict }) => (
                  <tr key={item.linkId} className="border-border/60 border-t align-top">
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <ItemLink item={item} />
                        {item.kind === "home_ref" ? (
                          <House
                            className="text-home-foreground size-3.5"
                            aria-label="Home vault"
                          />
                        ) : null}
                      </div>
                      <div className="text-muted-foreground text-xs">
                        {platformLabel(item.platform)} · {formatDateTime(item.publishedAt)}
                      </div>
                      {item.snippet ? (
                        <p className="mt-1 line-clamp-2 max-w-xs text-xs">{item.snippet}</p>
                      ) : null}
                    </td>
                    {ws.criteria.map((c) => {
                      const r = latest.get(`${item.linkId}:${c.id}`);
                      const value = (r?.result as AssessmentResult | undefined) ?? "";
                      return (
                        <td key={c.id} className="px-2 py-3">
                          {ws.canWork ? (
                            <Select
                              value={value}
                              onValueChange={(v) =>
                                assess.mutate({
                                  linkId: item.linkId!,
                                  criterionId: c.id,
                                  result: v as AssessmentResult,
                                })
                              }
                            >
                              <SelectTrigger
                                aria-label={`${item.code}: ${c.label}`}
                                className={cn(
                                  "h-9 text-xs",
                                  value ? RESULT_STYLE[value] : "text-muted-foreground",
                                )}
                                title={
                                  r
                                    ? `${r.assessed_by_name ?? ""} ${formatDateTime(r.assessed_at)}`
                                    : undefined
                                }
                              >
                                <SelectValue placeholder="—" />
                              </SelectTrigger>
                              <SelectContent>
                                {(Object.keys(RESULT_LABEL) as AssessmentResult[]).map((k) => (
                                  <SelectItem key={k} value={k}>
                                    {RESULT_LABEL[k]}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : value ? (
                            <span
                              className={cn(
                                "rounded-full px-2 py-0.5 text-xs",
                                RESULT_STYLE[value],
                              )}
                            >
                              {RESULT_LABEL[value]}
                            </span>
                          ) : (
                            <span className="text-muted-foreground text-xs">—</span>
                          )}
                        </td>
                      );
                    })}
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          "rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap",
                          VERDICT[verdict].style,
                        )}
                      >
                        {VERDICT[verdict].label}
                      </span>
                    </td>
                    {ws.canManage ? (
                      <td className="px-2 py-3">
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Remove ${item.code} from the project`}
                          onClick={() => removeItem.mutate(item.linkId!)}
                        >
                          <X className="size-4" />
                        </Button>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
            {!rows.length ? (
              <p className="text-muted-foreground px-4 py-6 text-sm">
                {linked.length
                  ? "Nothing matches this filter."
                  : "No items yet. Use “Add from linked cases”."}
              </p>
            ) : null}
            {!ws.criteria.length && linked.length ? (
              <p className="text-muted-foreground border-t px-4 py-3 text-xs">
                Add criteria in the brief to assess items.
              </p>
            ) : null}
            <p className="text-muted-foreground border-t px-4 py-3 text-xs">
              Each change is a new assessment with your name and the time; earlier ones stay in the
              project log. * required.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
