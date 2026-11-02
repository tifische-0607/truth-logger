import { CheckCircle2, Circle } from "lucide-react";

import { GateCard, PhaseStrip } from "@/components/engagement/OverviewTab";
import { Section } from "@/components/engagement/ui";
import { formatDateTime } from "@/lib/format";
import { GATES, type Workspace } from "@/lib/projects";

/** Engagement gates G0–G5: board to sign each gate, plus the signed-gate register. */
export function GatesTab({ ws }: { ws: Workspace }) {
  const cycles = ws.cycles.length ? ws.cycles.map((c) => c.cycle_no) : [0];
  const once = (["G0", "G1", "G2"] as const).map((id) => ({ id, done: !!ws.gateAt(id) }));
  return (
    <div className="space-y-6">
      <PhaseStrip ws={ws} />
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6" aria-label="Gate summary">
        {GATES.map((g) => {
          const done =
            g.id === "G3" || g.id === "G4"
              ? cycles.every((c) => !!ws.gateAt(g.id, c))
              : g.id === "G5"
                ? ws.gates.some((x) => x.gate === "G5")
                : once.find((o) => o.id === g.id)?.done;
          const stale = g.id === "G2" && ws.project.design_stale;
          return (
            <div key={g.id} className="panel min-w-0 p-4">
              <div className="flex items-center gap-2">
                {done && !stale ? (
                  <CheckCircle2 className="text-done-foreground size-5" aria-hidden />
                ) : (
                  <Circle className="text-muted-foreground size-5" aria-hidden />
                )}
                <span className="font-mono font-bold">{g.id}</span>
              </div>
              <div className="mt-1 text-sm font-medium">{g.name}</div>
              <div className="text-muted-foreground text-xs">
                {stale ? "Needs signing again" : done ? "Signed" : "Not signed"}
              </div>
            </div>
          );
        })}
      </section>

      <Section
        id="gates-board-h"
        title="Engagement gates (G0–G5)"
        hint="Each gate has a named signer. The database refuses a signature whose pass condition is not met, and signatures can never be edited or removed."
      >
        <ul className="divide-border -m-5 divide-y">
          <GateCard ws={ws} id="G0" />
          <GateCard ws={ws} id="G1" />
          <GateCard ws={ws} id="G2" />
          {cycles.map((c) => (
            <div key={c} className="contents">
              <GateCard ws={ws} id="G3" cycle={c} />
              <GateCard ws={ws} id="G4" cycle={c} />
            </div>
          ))}
          <GateCard ws={ws} id="G5" />
        </ul>
      </Section>

      <Section
        id="gates-reg-h"
        title="Gate register"
        hint="Every signature in the order it was given. Append-only."
      >
        <div className="relative overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="text-muted-foreground text-left text-xs uppercase">
              <tr>
                <th className="py-2 pr-3">Gate</th>
                <th className="py-2 pr-3">Cycle</th>
                <th className="py-2 pr-3">Signed by</th>
                <th className="py-2 pr-3">When</th>
                <th className="py-2">Detail</th>
              </tr>
            </thead>
            <tbody>
              {ws.gates.map((g) => (
                <tr key={g.id} className="border-t align-top">
                  <td className="py-2 pr-3 font-mono font-bold">{g.gate}</td>
                  <td className="py-2 pr-3">{g.gate === "G3" || g.gate === "G4" ? g.cycle_no : "—"}</td>
                  <td className="py-2 pr-3">{g.signed_by_name ?? "—"}</td>
                  <td className="py-2 pr-3">{formatDateTime(g.signed_at)}</td>
                  <td className="py-2 text-xs">
                    {[
                      g.sponsor_name ? `Sponsor ${g.sponsor_name}${g.sponsor_role ? ` (${g.sponsor_role})` : ""}` : null,
                      g.design_version ? `Design v${g.design_version}` : null,
                      g.recipient ? `Recipient ${g.recipient}` : null,
                      g.written_approval_ref ? `Approval ${g.written_approval_ref}` : null,
                      g.note,
                    ]
                      .filter(Boolean)
                      .join(" · ") || "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!ws.gates.length ? (
            <p className="text-muted-foreground py-2 text-sm">No gate has been signed yet.</p>
          ) : null}
        </div>
      </Section>
    </div>
  );
}
