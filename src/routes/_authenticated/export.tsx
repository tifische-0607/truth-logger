import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { Download, Loader2, PackageCheck } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { exportBundle, type ExportReport } from "@/lib/evidence.functions";
import { VerifyResultTable } from "@/routes/_authenticated/verify";
import { formatBytes } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/export")({
  head: () => ({
    meta: [
      { title: "Export bundle — SpyGlass V2" },
      {
        name: "description",
        content:
          "Verify every artefact, then build a ZIP evidence bundle with manifest and chain-of-custody log.",
      },
      { property: "og:title", content: "Export bundle — SpyGlass V2" },
      {
        property: "og:description",
        content: "Court-ready ZIP bundle of captured Facebook evidence with SHA-256 manifest.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ExportPage,
});

function ExportPage() {
  const [caseId, setCaseId] = useState("");
  const [recipient, setRecipient] = useState("");
  const [purpose, setPurpose] = useState("");
  const [handler, setHandler] = useState("");
  const [report, setReport] = useState<ExportReport | null>(null);
  const run = useServerFn(exportBundle);

  useEffect(() => {
    setHandler(localStorage.getItem("fbem.handler") ?? "");
  }, []);

  const cases = useQuery({
    queryKey: ["cases-for-export"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cases")
        .select("id, target_of_complaint")
        .order("id", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    if (!caseId && cases.data?.[0]) setCaseId(cases.data[0].id);
  }, [cases.data, caseId]);

  const mutation = useMutation({
    mutationFn: async () => run({ data: { caseId, recipient, purpose, handler } }),
    onSuccess: (data) => {
      setReport(data);
      if (data.ok) toast.success("Bundle ready to download.");
      else toast.error("Export blocked — an artefact failed verification.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Export bundle"
        subtitle="Every artefact is re-hashed first. If any hash fails, the export is blocked."
      />

      <div className="panel space-y-5 p-5">
        <div className="grid gap-5 sm:grid-cols-2">
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
            <Label htmlFor="recipient">Released to</Label>
            <Input
              id="recipient"
              className="min-h-12"
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              placeholder="e.g. IPD Dang Wangi — Insp. Rahim"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="handler">Handler</Label>
            <Input
              id="handler"
              className="min-h-12"
              value={handler}
              onChange={(e) => setHandler(e.target.value)}
              placeholder="Your name"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="purpose">Purpose</Label>
            <Textarea
              id="purpose"
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
              placeholder="e.g. Police report attachment, CMA s.233 complaint"
            />
          </div>
        </div>
        <Button
          size="lg"
          className="min-h-12"
          disabled={!caseId || recipient.trim().length < 2 || mutation.isPending}
          onClick={() => mutation.mutate()}
        >
          {mutation.isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <PackageCheck className="size-4" />
          )}
          Verify & export bundle
        </Button>
        <p className="text-muted-foreground text-xs">
          Bundle layout: CASE-x / INC-y_date / FB_@handle / POST-id / [comments/CMT-nnnn/] artefacts
          — plus manifest.txt, verification-report.md and custody-log.md.
        </p>
      </div>

      {report && (
        <div className="space-y-4">
          {report.ok ? (
            <div className="panel flex flex-wrap items-center gap-4 p-5">
              <span className="bg-done text-done-foreground rounded-full px-3 py-1 text-sm font-semibold">
                Verified & exported
              </span>
              <span className="text-muted-foreground text-sm">
                {report.fileCount} files · {formatBytes(report.sizeBytes)}
              </span>
              <a
                href={report.downloadUrl}
                className="bg-primary text-primary-foreground inline-flex min-h-12 items-center gap-2 rounded-lg px-5 text-sm font-medium"
              >
                <Download className="size-4" /> Download ZIP
              </a>
              <span className="text-muted-foreground text-xs">Link valid for 1 hour.</span>
            </div>
          ) : (
            <div className="panel space-y-2 p-5">
              <span className="bg-failed text-failed-foreground inline-block rounded-full px-3 py-1 text-sm font-semibold">
                Export blocked
              </span>
              <p className="text-muted-foreground text-sm">
                {report.verify.artefactCount === 0
                  ? "This case has no stored artefacts yet."
                  : "At least one artefact does not match its recorded hash, or is missing from storage. Nothing was exported."}
              </p>
            </div>
          )}
          {report.verify.results.length > 0 && <VerifyResultTable report={report.verify} />}
        </div>
      )}
    </div>
  );
}
