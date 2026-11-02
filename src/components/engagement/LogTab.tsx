import { formatDateTime } from "@/lib/format";
import type { Workspace } from "@/lib/projects";

const LABEL: Record<string, string> = {
  "gates:insert": "Gate signed",
  "briefs:insert": "Brief saved",
  "amendment_approvals:insert": "Amendment decided",
  "decisions:insert": "Decision recorded",
  "confirmations:insert": "Second reader",
  "items:insert": "Candidate added",
  "items:voided": "Candidate voided",
  "cases:insert": "Case folder linked",
  "cases:voided": "Case link voided",
  "cycles:insert": "Cycle opened",
  "item_tiers:insert": "Evidence tier set",
  "captures:insert": "Capture recorded",
  "load_reports:insert": "Load report",
  "outputs:insert": "Output created",
  "outputs:update": "Output status",
  "report_entries:insert": "Report entry",
  "scenarios:insert": "Scenario saved",
  "scenario_events:insert": "Scenario event",
  "success_measures:insert": "Measure saved",
  "research_questions:insert": "Research question",
  "interviews:insert": "Interview recorded",
  "intake_items:insert": "Intake item logged",
  "scope_sheets:insert": "Scope sheet",
  "design_sheets:insert": "Design sheet",
  "targets:insert": "Target register",
  "closeouts:insert": "Close-out",
  "members:insert": "Member added",
  "members:delete": "Member removed",
  "projects:insert": "Engagement created",
  "projects:update": "Status changed",
  "output:downloaded": "Output downloaded",
};

export function LogTab({ ws }: { ws: Workspace }) {
  const detail = (d: Record<string, unknown>) =>
    Object.entries(d)
      .filter(([k]) => k !== "id")
      .map(
        ([k, v]) =>
          `${k.replace(/_/g, " ")}: ${typeof v === "string" ? v.slice(0, 60) : String(v)}`,
      )
      .join(" · ");
  return (
    <section className="panel overflow-x-auto" aria-label="Engagement log">
      <table className="w-full min-w-[700px] text-sm">
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
              <td className="px-4 py-2.5">{LABEL[e.action] ?? e.action}</td>
              <td className="text-muted-foreground px-4 py-2.5">
                {detail((e.detail ?? {}) as Record<string, unknown>)}
              </td>
              <td className="px-4 py-2.5">
                {e.actor_name ?? (e.actor ? (ws.names.get(e.actor) ?? "Former member") : "System")}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-muted-foreground border-t px-4 py-3 text-xs">
        Written by the database as things happen; entries cannot be edited or deleted. Every release
        records recipient, time and file hash.
      </p>
    </section>
  );
}
