import { Lock, Send } from "lucide-react";

import { GateCard } from "@/components/engagement/OverviewTab";
import { Chip, Section } from "@/components/engagement/ui";
import { formatDateTime } from "@/lib/format";
import {
  OUTPUT_STATUS_LABEL,
  OUTPUT_STATUS_STYLE,
  outputKindLabel,
  type Workspace,
} from "@/lib/projects";

/** Release control: everything that passed QA is HELD until the Curator signs G5 for it. */
export function ReleaseTab({ ws }: { ws: Workspace }) {
  const mandate = ws.scopeSheet?.mandate ?? "internal_read_only";
  const held = ws.outputs.filter((o) => o.status === "held");
  const released = ws.outputs.filter((o) => o.status === "released");
  const pending = ws.outputs.filter((o) => o.status === "draft" || o.status === "qa_review");
  const g5For = (id: string) => ws.gates.find((g) => g.gate === "G5" && g.output_id === id);

  const Row = ({ o }: { o: Workspace["outputs"][number] }) => {
    const g = g5For(o.id);
    return (
      <tr className="border-t align-top">
        <td className="py-2 pr-3">
          <div className="font-medium">{o.title}</div>
          <div className="text-muted-foreground text-xs">{outputKindLabel(o.kind)}</div>
        </td>
        <td className="py-2 pr-3">
          <Chip tone={OUTPUT_STATUS_STYLE[o.status]}>
            {o.status === "held" ? <Lock className="mr-1 inline size-3" aria-hidden /> : null}
            {OUTPUT_STATUS_LABEL[o.status] ?? o.status}
          </Chip>
        </td>
        <td className="py-2 pr-3 font-mono text-xs break-all">
          {o.sha256 ? `${o.sha256.slice(0, 16)}…` : "—"}
        </td>
        <td className="py-2 text-xs">
          {g ? (
            <>
              {g.recipient ?? "—"} · {g.written_approval_ref ?? "—"}
              <div className="text-muted-foreground">
                {g.signed_by_name ?? "—"} · {formatDateTime(g.signed_at)}
              </div>
            </>
          ) : o.status === "held" ? (
            "Awaiting written Curator approval"
          ) : (
            "—"
          )}
        </td>
      </tr>
    );
  };

  const Table = ({ rows, empty }: { rows: typeof ws.outputs; empty: string }) => (
    <div className="relative overflow-x-auto">
      <table className="w-full min-w-[680px] text-sm">
        <thead className="text-muted-foreground text-left text-xs uppercase">
          <tr>
            <th className="py-2 pr-3">Output</th>
            <th className="py-2 pr-3">Status</th>
            <th className="py-2 pr-3">SHA-256</th>
            <th className="py-2">G5 release</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((o) => (
            <Row key={o.id} o={o} />
          ))}
        </tbody>
      </table>
      {!rows.length ? <p className="text-muted-foreground py-2 text-sm">{empty}</p> : null}
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="bg-muted flex flex-wrap items-center justify-between gap-3 rounded-lg px-4 py-3 text-sm" role="note">
        <span>
          <strong>Default state is HELD.</strong> An output that passes QA is held inside
          FridayAnalytics.org. It leaves only after the Curator signs G5 with written approval,
          recorded with recipient, time and file hash.
        </span>
        <Chip tone={mandate === "internal_read_only" ? "bg-warn text-warn-foreground" : "bg-queued text-queued-foreground"}>
          {mandate === "internal_read_only" ? "Mandate: internal only — release blocked" : "Mandate: release allowed via G5"}
        </Chip>
      </div>

      <section className="grid grid-cols-3 gap-3" aria-label="Release numbers">
        {(
          [
            ["HELD", held.length],
            ["Released", released.length],
            ["Still in draft or QA", pending.length],
          ] as const
        ).map(([l, n]) => (
          <div key={l} className="panel min-w-0 p-4">
            <div className="text-2xl font-bold tabular-nums">{n}</div>
            <div className="text-muted-foreground text-xs">{l}</div>
          </div>
        ))}
      </section>

      <Section id="held-h" title={`HELD (${held.length})`} hint="Passed QA; file and hash are fixed. Not yet released.">
        <Table rows={held} empty="Nothing is held." />
      </Section>

      <Section id="g5-h" title="Release (G5)" hint="Curator only. Choose a held output and record the written approval.">
        <ul className="divide-border -m-5 divide-y">
          <GateCard ws={ws} id="G5" />
        </ul>
      </Section>

      <Section id="rel-h" title={`Released (${released.length})`} hint="Each release with its G5 approval.">
        <Table rows={released} empty="Nothing has been released." />
      </Section>

      {pending.length ? (
        <p className="text-muted-foreground flex items-center gap-2 text-sm">
          <Send className="size-4" aria-hidden />
          {pending.length === 1 ? "1 output is" : `${pending.length} outputs are`} still in draft
          or QA — finish them on the Reports tab.
        </p>
      ) : null}
    </div>
  );
}
