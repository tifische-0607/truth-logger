import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/AppShell";
import { HashChip } from "@/components/HashChip";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { verifyEvidence, type VerifyReport } from "@/lib/evidence.functions";
import { formatDateTime } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/verify")({
  head: () => ({
    meta: [
      { title: "Re-hash & verify — FB Evidence Monitor" },
      {
        name: "description",
        content:
          "Re-hash every stored artefact in a case and compare against the recorded SHA-256 values.",
      },
      { property: "og:title", content: "Re-hash & verify — FB Evidence Monitor" },
      {
        property: "og:description",
        content: "Integrity check for captured Facebook evidence artefacts.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: VerifyPage,
});

const STATUS_STYLE: Record<string, string> = {
  MATCH: "bg-done text-done-foreground",
  MISMATCH: "bg-failed text-failed-foreground",
  MISSING: "bg-failed text-failed-foreground",
  NO_BASELINE: "bg-queued text-queued-foreground",
};

export function VerifyResultTable({ report }: { report: VerifyReport }) {
  return (
    <div className="panel overflow-x-auto">
      <table className="w-full min-w-[640px] text-sm">
        <thead className="text-muted-foreground text-left text-xs uppercase">
          <tr>
            <th className="px-4 py-3">Item</th>
            <th className="px-4 py-3">File</th>
            <th className="px-4 py-3">Recorded hash</th>
            <th className="px-4 py-3">Recomputed</th>
            <th className="px-4 py-3">Result</th>
          </tr>
        </thead>
        <tbody>
          {report.results.map((r) => (
            <tr key={r.artefact_id} className="border-border/60 border-t">
              <td className="px-4 py-3 font-medium">{r.item_code}</td>
              <td className="px-4 py-3">{r.filename}</td>
              <td className="px-4 py-3">
                <HashChip value={r.expected} />
              </td>
              <td className="px-4 py-3">
                <HashChip value={r.actual} />
              </td>
              <td className="px-4 py-3">
                <span
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${
                    STATUS_STYLE[r.status] ?? "bg-muted"
                  }`}
                >
                  {r.status}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function VerifyPage() {
  const [caseId, setCaseId] = useState<string>("");
  const [handler, setHandler] = useState("");
  const [report, setReport] = useState<VerifyReport | null>(null);
  const run = useServerFn(verifyEvidence);

  useEffect(() => {
    setHandler(localStorage.getItem("fbem.handler") ?? "");
  }, []);

  const cases = useQuery({
    queryKey: ["cases-for-verify"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cases")
        .select("id, target_of_complaint, status")
        .order("id", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    if (!caseId && cases.data?.[0]) setCaseId(cases.data[0].id);
  }, [cases.data, caseId]);

  const mutation = useMutation({
    mutationFn: async () => run({ data: { scope: "case", id: caseId, handler } }),
    onSuccess: (data) => {
      setReport(data);
      if (data.ok) toast.success(`All ${data.artefactCount} artefacts match.`);
      else toast.error("Integrity problem found — see the table below.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Re-hash & verify"
        subtitle="Downloads every stored artefact, recomputes its SHA-256 and writes a re-hashed custody event."
      />

      <div className="panel grid gap-4 p-5 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <div className="space-y-2">
          <Label>Case</Label>
          <Select value={caseId} onValueChange={setCaseId}>
            <SelectTrigger className="min-h-12">
              <SelectValue placeholder="Choose a case" />
            </SelectTrigger>
            <SelectContent>
              {(cases.data ?? []).map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  CASE-{c.id} · {c.target_of_complaint ?? "untitled"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="handler">Handler</Label>
          <Input
            id="handler"
            className="min-h-12"
            value={handler}
            onChange={(e) => setHandler(e.target.value)}
            placeholder="Your name, recorded in the custody log"
          />
        </div>
        <Button
          size="lg"
          className="min-h-12"
          disabled={!caseId || mutation.isPending}
          onClick={() => mutation.mutate()}
        >
          {mutation.isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <ShieldCheck className="size-4" />
          )}
          Re-hash & verify
        </Button>
      </div>

      {report && (
        <div className="space-y-4">
          <div className="panel flex flex-wrap items-center gap-4 p-5">
            <span
              className={`rounded-full px-3 py-1 text-sm font-semibold ${
                report.ok ? "bg-done text-done-foreground" : "bg-failed text-failed-foreground"
              }`}
            >
              {report.ok ? "All artefacts verified" : "Verification failed"}
            </span>
            <span className="text-muted-foreground text-sm">
              {report.artefactCount} artefacts · checked {formatDateTime(report.checkedAt)}
            </span>
            {Object.entries(report.counts).map(([k, v]) => (
              <span key={k} className="bg-muted rounded-full px-3 py-1 text-xs font-medium">
                {k}: {v}
              </span>
            ))}
          </div>
          {report.results.length === 0 ? (
            <p className="text-muted-foreground">This case has no stored artefacts yet.</p>
          ) : (
            <VerifyResultTable report={report} />
          )}
        </div>
      )}
    </div>
  );
}
