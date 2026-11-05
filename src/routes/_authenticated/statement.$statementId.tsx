import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Printer } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { DocCallout, DocStatus, PrintDocument } from "@/components/print/PrintDocument";
import { hubHead } from "@/lib/hub";
import { formatDateTime } from "@/lib/format";
import { RETENTION_PLACEHOLDER } from "@/lib/u6";

export const Route = createFileRoute("/_authenticated/statement/$statementId")({
  head: () => hubHead("Methodology statement", "Printable methodology statement for an FA Portal report."),
  component: Statement,
});

function Statement() {
  const { statementId } = Route.useParams();
  const q = useQuery({
    queryKey: ["statement", statementId],
    queryFn: async () => {
      const { data: s, error } = await supabase.from("report_statements").select("*").eq("id", statementId).single();
      if (error) throw error;
      const [o, a, std] = await Promise.all([
        supabase.from("project_outputs").select("title").eq("id", s.output_id).maybeSingle(),
        supabase.from("report_statement_approvals").select("*").eq("statement_id", s.id).maybeSingle(),
        supabase.from("framework_versions").select("version").eq("id", s.standard_version).maybeSingle(),
      ]);
      const { data: active } = await supabase.rpc("u6_standard");
      return { s, title: o.data?.title ?? "Report", approval: a.data, stdVersion: std.data?.version, sample: !!(active as { version_id?: string; sample?: boolean } | null)?.sample && (active as { version_id?: string }).version_id === s.standard_version };
    },
  });
  if (q.error) return <p role="alert" className="text-sm">{String((q.error as { message?: string }).message ?? q.error)}</p>;
  if (!q.data) return <p className="text-muted-foreground text-sm">Loading…</p>;
  const { s, title, approval, stdVersion, sample } = q.data;
  return (
    <div>
      <div className="flex gap-2 p-4 print:hidden"><Button className="min-h-11" onClick={() => window.print()}><Printer className="size-4" />Download PDF</Button></div>
      <PrintDocument label="Methodology statement" kicker={`METHODOLOGY · VERSION ${s.version}`} title={title} subtitle={`Universal standard version ${stdVersion ?? "?"}${sample ? " · Sample standard" : ""}`}>
        <h2>Statement</h2>
        <p>{s.statement}</p>
        <table>
          <thead><tr><th>Item</th><th>Detail</th></tr></thead>
          <tbody>
            <tr><td>Time window</td><td>{s.time_window}</td></tr>
            <tr><td>Platforms</td><td>{s.platforms.join(", ")}</td></tr>
            <tr><td>Limits</td><td>{s.limits}</td></tr>
            <tr><td>Confidence for each finding</td><td>{s.confidence_summary}</td></tr>
            <tr><td>Retention</td><td>{RETENTION_PLACEHOLDER}</td></tr>
          </tbody>
        </table>
        <DocCallout>
          {approval ? <DocStatus tone="positive">Curator release approval recorded {formatDateTime(approval.approved_at)}</DocStatus> : <DocStatus tone="caution">Waiting for Curator approval — not for release</DocStatus>}
        </DocCallout>
      </PrintDocument>
    </div>
  );
}
