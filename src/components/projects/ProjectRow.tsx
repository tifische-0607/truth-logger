import { Link } from "@tanstack/react-router";

import { formatDay, plural, projectStatusLabel, type ProjectListRow } from "@/lib/projects";
import { cn } from "@/lib/utils";

const STATUS_STYLE: Record<string, string> = {
  scoping: "bg-queued text-queued-foreground",
  active: "bg-secondary text-secondary-foreground",
  paused: "bg-muted text-muted-foreground",
  delivered: "bg-done text-done-foreground",
  closed: "bg-muted text-muted-foreground",
};

export function ProjectStatusChip({ status }: { status: string }) {
  return (
    <span
      className={cn(
        "rounded-full px-2.5 py-0.5 text-xs font-semibold",
        STATUS_STYLE[status] ?? "bg-muted",
      )}
    >
      {projectStatusLabel(status)}
    </span>
  );
}

export function ProjectRow({ p }: { p: ProjectListRow }) {
  const outputs = p.project_outputs ?? [];
  const signed = [...new Set((p.project_gates ?? []).map((g) => g.gate))].sort();
  const gatesText = signed.length ? signed.join(" ") : "none";
  const delivered = outputs.filter((o) => o.status === "released").length;
  const review = outputs.filter((o) => o.status === "qa_review").length;
  return (
    <Link
      to="/projects/$projectId"
      params={{ projectId: p.id }}
      search={{ tab: "overview" }}
      className="hover:bg-muted flex min-h-16 flex-wrap items-center justify-between gap-3 px-5 py-3 transition-colors"
    >
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-xs font-bold">{p.code}</span>
          <ProjectStatusChip status={p.status} />
          {review ? (
            <span className="bg-warn text-warn-foreground rounded-full px-2 py-0.5 text-xs font-semibold">
              {review} in QA
            </span>
          ) : null}
        </div>
        <div className="truncate text-sm font-medium">{p.name}</div>
        <div className="text-muted-foreground text-xs">
          {plural((p.project_cases ?? []).length, "case")} · gates signed: {gatesText} · {delivered}
          /{outputs.length} released
          {p.due_on ? ` · due ${formatDay(p.due_on)}` : ""}
        </div>
      </div>
    </Link>
  );
}
