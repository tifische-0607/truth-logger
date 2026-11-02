import { platformLabel } from "@/lib/darknight";
import { formatMonth, projectStats, RESULT_LABEL, type Workspace } from "@/lib/projects";
import { cn } from "@/lib/utils";

const SEGMENTS = [
  ["meets", "bg-done-foreground"],
  ["does_not_meet", "bg-failed-foreground"],
  ["unclear", "bg-queued-foreground"],
  ["not_applicable", "bg-muted-foreground/50"],
  ["unassessed", "bg-border"],
] as const;

function Bars({ rows, total }: { rows: [string, number][]; total: number }) {
  const max = Math.max(1, ...rows.map((r) => r[1]));
  return (
    <ul className="space-y-2">
      {rows.map(([label, n]) => (
        <li key={label} className="grid grid-cols-[7rem_1fr_3rem] items-center gap-3 text-sm">
          <span className="truncate">{label}</span>
          <span className="bg-muted h-3 overflow-hidden rounded-full">
            <span
              className="bg-primary block h-full rounded-full"
              style={{ width: `${(n / max) * 100}%` }}
            />
          </span>
          <span className="text-right tabular-nums">
            {n}
            <span className="text-muted-foreground text-xs">
              {" "}
              {total ? Math.round((n / total) * 100) : 0}%
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Live numbers for the project, from the current brief's criteria and the linked items. */
export function ProjectDashboard({ ws }: { ws: Workspace }) {
  const s = projectStats(ws);
  const tiles: [string, number, string?][] = [
    ["Linked items", s.linkedCount],
    ["Meet the brief", s.verdicts.included, "text-done-foreground"],
    ["Excluded", s.verdicts.excluded, "text-failed-foreground"],
    ["To assess", s.verdicts.pending, "text-queued-foreground"],
    ["Cloud vault", s.cloudCount],
    ["Home vault", s.homeCount],
  ];
  return (
    <div className="space-y-6">
      <p className="text-muted-foreground text-sm">
        Live: changes as items are linked and assessed. Brief v{ws.current?.version ?? "—"}. A
        dashboard output takes a dated snapshot of these numbers.
      </p>
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6" aria-label="Totals">
        {tiles.map(([label, n, tone]) => (
          <div key={label} className="panel min-w-0 p-4">
            <div className={cn("text-2xl font-bold tabular-nums", tone)}>{n}</div>
            <div className="text-muted-foreground text-xs">{label}</div>
          </div>
        ))}
      </section>

      <section className="panel space-y-4 p-5" aria-labelledby="dc-h">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="dc-h" className="font-semibold">
            By criterion
          </h2>
          <ul className="flex flex-wrap gap-3 text-xs" aria-label="Legend">
            {SEGMENTS.map(([k, cls]) => (
              <li key={k} className="flex items-center gap-1.5">
                <span className={cn("size-2.5 rounded-sm", cls)} aria-hidden />
                {k === "unassessed" ? "Not assessed" : RESULT_LABEL[k]}
              </li>
            ))}
          </ul>
        </div>
        {s.byCriterion.length ? (
          <ul className="space-y-3">
            {s.byCriterion.map(({ criterion, counts }) => (
              <li key={criterion.id} className="space-y-1">
                <div className="flex justify-between gap-3 text-sm">
                  <span className="min-w-0 truncate">
                    <span className="text-muted-foreground font-mono">{criterion.position}.</span>{" "}
                    {criterion.label}
                  </span>
                  <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
                    {counts.meets} meet · {counts.does_not_meet} don't · {counts.unclear} unclear ·{" "}
                    {counts.unassessed} open
                  </span>
                </div>
                <div
                  className="bg-muted flex h-3 overflow-hidden rounded-full"
                  role="img"
                  aria-label={`${criterion.label}: ${counts.meets} meet, ${counts.does_not_meet} do not, ${counts.unclear} unclear, ${counts.not_applicable} not applicable, ${counts.unassessed} not assessed`}
                >
                  {SEGMENTS.map(([k, cls]) =>
                    counts[k] ? (
                      <span
                        key={k}
                        className={cls}
                        style={{ width: `${(counts[k] / Math.max(1, s.linkedCount)) * 100}%` }}
                      />
                    ) : null,
                  )}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground text-sm">No criteria in the current brief.</p>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="panel space-y-3 p-5" aria-labelledby="dp-h">
          <h2 id="dp-h" className="font-semibold">
            By platform
          </h2>
          {s.byPlatform.length ? (
            <Bars
              rows={s.byPlatform.map(([k, n]) => [platformLabel(k === "unknown" ? null : k), n])}
              total={s.linkedCount}
            />
          ) : (
            <p className="text-muted-foreground text-sm">No items yet.</p>
          )}
        </section>
        <section className="panel space-y-3 p-5" aria-labelledby="dm-h">
          <h2 id="dm-h" className="font-semibold">
            By month published
          </h2>
          {s.byMonth.length ? (
            <Bars rows={s.byMonth.map(([k, n]) => [formatMonth(k), n])} total={s.linkedCount} />
          ) : (
            <p className="text-muted-foreground text-sm">No items yet.</p>
          )}
        </section>
      </div>
    </div>
  );
}
