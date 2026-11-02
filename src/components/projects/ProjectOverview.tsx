import { Link } from "@tanstack/react-router";
import { CheckCircle2, Circle } from "lucide-react";

import { formatDateTime } from "@/lib/format";
import {
  OUTPUT_KINDS,
  OUTPUT_STATUS_LABEL,
  OUTPUT_STATUS_STYLE,
  formatDay,
  projectStats,
  type OutputStatus,
  type Workspace,
} from "@/lib/projects";
import { cn } from "@/lib/utils";

type TabId = "brief" | "evidence" | "outputs" | "team";

export function ProjectOverview({ ws }: { ws: Workspace }) {
  const s = projectStats(ws);
  const wanted = ws.current?.output_kinds ?? [];
  const steps: { done: boolean; label: string; tab: TabId }[] = [
    { done: !!ws.current, label: "Write the brief", tab: "brief" },
    { done: ws.criteria.length > 0, label: "Set the criteria", tab: "brief" },
    { done: ws.cases.length > 0, label: "Link cases from the evidence pool", tab: "evidence" },
    { done: s.linkedCount > 0, label: "Choose the items in scope", tab: "evidence" },
    {
      done: s.linkedCount > 0 && s.verdicts.pending === 0,
      label: `Assess items against the criteria${s.verdicts.pending ? ` (${s.verdicts.pending} left)` : ""}`,
      tab: "evidence",
    },
    {
      done:
        wanted.length > 0 &&
        wanted.every((k) => ws.outputs.some((o) => o.kind === k && o.status === "delivered")),
      label: "Deliver the outputs the brief asks for",
      tab: "outputs",
    },
  ];

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="space-y-6 lg:col-span-2">
        <section className="panel space-y-3 p-5" aria-labelledby="q-h">
          <h2 id="q-h" className="text-muted-foreground text-xs font-semibold uppercase">
            The question{ws.current ? ` · brief v${ws.current.version}` : ""}
          </h2>
          <p className="text-lg leading-snug font-medium">
            {ws.current?.question ?? "No brief yet."}
          </p>
          {ws.current?.scope ? (
            <p className="text-muted-foreground text-sm">{ws.current.scope}</p>
          ) : null}
        </section>

        <section className="grid grid-cols-2 gap-3 sm:grid-cols-4" aria-label="Numbers">
          {[
            ["Linked items", s.linkedCount],
            ["Meet the brief", s.verdicts.included],
            ["Excluded", s.verdicts.excluded],
            ["To assess", s.verdicts.pending],
          ].map(([label, n]) => (
            <div key={label as string} className="panel min-w-0 p-4">
              <div className="text-2xl font-bold tabular-nums">{n}</div>
              <div className="text-muted-foreground text-xs">{label}</div>
            </div>
          ))}
        </section>

        <section className="panel overflow-hidden" aria-labelledby="out-h">
          <h2 id="out-h" className="border-b px-5 py-4 font-semibold">
            Outputs the brief asks for
          </h2>
          <ul className="divide-border divide-y">
            {OUTPUT_KINDS.filter((k) => wanted.includes(k.id)).map((k) => {
              const latest = ws.outputs.find((o) => o.kind === k.id);
              return (
                <li
                  key={k.id}
                  className="flex flex-wrap items-center justify-between gap-3 px-5 py-3"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-medium">{k.label}</div>
                    <div className="text-muted-foreground truncate text-xs">
                      {latest ? latest.title : "Not started"}
                    </div>
                  </div>
                  {latest ? (
                    <span
                      className={cn(
                        "rounded-full px-2.5 py-0.5 text-xs font-semibold",
                        OUTPUT_STATUS_STYLE[latest.status as OutputStatus],
                      )}
                    >
                      {OUTPUT_STATUS_LABEL[latest.status as OutputStatus]}
                    </span>
                  ) : null}
                </li>
              );
            })}
            {!wanted.length ? (
              <li className="text-muted-foreground px-5 py-4 text-sm">
                The brief doesn't list outputs yet.
              </li>
            ) : null}
          </ul>
        </section>
      </div>

      <div className="space-y-6">
        <section className="panel space-y-3 p-5" aria-labelledby="steps-h">
          <h2 id="steps-h" className="font-semibold">
            Next steps
          </h2>
          <ol className="space-y-2">
            {steps.map((st) => (
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
            Project
          </h2>
          <div className="text-muted-foreground">Client</div>
          <div>{ws.client?.name ?? "—"}</div>
          <div className="text-muted-foreground">Opened</div>
          <div>{formatDay(ws.project.opened_on)}</div>
          <div className="text-muted-foreground">Due</div>
          <div>{formatDay(ws.project.due_on)}</div>
          <div className="text-muted-foreground">Lead</div>
          <div>
            {ws.members
              .filter((m) => m.role === "lead")
              .map((m) => m.name)
              .join(", ") || "—"}
          </div>
        </section>
      </div>
    </div>
  );
}

const ACTION_LABEL: Record<string, string> = {
  created: "Project created",
  updated: "Project updated",
  member_added: "Member added",
  member_removed: "Member removed",
  brief_versioned: "New brief version",
  case_linked: "Case linked",
  case_unlinked: "Case unlinked",
  item_linked: "Item linked",
  item_unlinked: "Item unlinked",
  assessed: "Assessed",
  output_created: "Output created",
  output_status: "Output status",
  output_shared: "Output shared with client",
  output_unshared: "Output unshared",
  output_downloaded: "Output downloaded",
};

export function ProjectLogTab({ ws }: { ws: Workspace }) {
  const names = new Map(ws.members.map((m) => [m.user_id, m.name]));
  const outputs = new Map(ws.outputs.map((o) => [o.id, o.title]));
  const detail = (d: Record<string, unknown>, outputId: string | null) => {
    const bits: string[] = [];
    if (outputId && outputs.get(outputId)) bits.push(outputs.get(outputId)!);
    if (d["version"]) bits.push(`v${String(d["version"])}`);
    if (d["note"]) bits.push(String(d["note"]));
    if (d["case_id"]) bits.push(`CASE-${String(d["case_id"])}`);
    if (d["role"]) bits.push(String(d["role"]));
    if (d["user_id"]) bits.push(names.get(String(d["user_id"])) ?? "");
    if (d["from"]) bits.push(`${String(d["from"])} → ${String(d["to"])}`);
    if (d["result"]) bits.push(String(d["result"]).replace(/_/g, " "));
    if (d["kind"] && !outputId) bits.push(String(d["kind"]));
    if (d["status"] && !d["from"]) bits.push(String(d["status"]));
    return bits.filter(Boolean).join(" · ");
  };
  return (
    <section className="panel overflow-x-auto" aria-label="Project log">
      <table className="w-full min-w-[640px] text-sm">
        <thead className="text-muted-foreground text-left text-xs uppercase">
          <tr>
            <th className="px-4 py-3">When</th>
            <th className="px-4 py-3">What</th>
            <th className="px-4 py-3">Detail</th>
            <th className="px-4 py-3">Who</th>
          </tr>
        </thead>
        <tbody>
          {ws.events.map((e) => (
            <tr key={e.id} className="border-border/60 border-t">
              <td className="px-4 py-2.5 whitespace-nowrap">{formatDateTime(e.at)}</td>
              <td className="px-4 py-2.5">{ACTION_LABEL[e.action] ?? e.action}</td>
              <td className="text-muted-foreground px-4 py-2.5">
                {detail((e.detail ?? {}) as Record<string, unknown>, e.output_id)}
              </td>
              <td className="px-4 py-2.5">
                {e.actor_name ?? (e.actor ? (names.get(e.actor) ?? "Former member") : "System")}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-muted-foreground border-t px-4 py-3 text-xs">
        Written by the database as things happen; entries cannot be edited or deleted.
      </p>
    </section>
  );
}
