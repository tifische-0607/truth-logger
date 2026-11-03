import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { ArrowLeft, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DocCallout, DocKicker, DocStatus, PrintDocument, type DocTone } from "@/components/print/PrintDocument";
import { SAMPLE_KINDS, sampleHash, type SampleKind } from "@/lib/document-samples";

export const Route = createFileRoute("/_authenticated/document-samples/$kind")({
  head: ({ params }) => ({
    meta: [
      { title: `Sample ${params.kind.replace(/-/g, " ")} — FA Portal` },
      { name: "description", content: "Sample document in the FA Portal A4 layout, built from sample data." },
      { property: "og:title", content: "Sample document — FA Portal" },
      { property: "og:description", content: "Sample document in the FA Portal A4 layout." },
    ],
  }),
  beforeLoad: ({ params }) => {
    if (!SAMPLE_KINDS.some((k) => k.id === params.kind)) throw notFound();
  },
  component: SamplePage,
});

const DATE = "15 Dec 2026";
const STATUSES: [string, DocTone][] = [["MATCH", "positive"], ["MATCH", "positive"], ["PENDING", "caution"], ["MATCH", "positive"], ["MISMATCH", "negative"]];

function rows(n: number, seed: string) {
  return Array.from({ length: n }, (_, i) => {
    const no = String(i + 1).padStart(4, "0");
    return {
      code: `CASE-S01_INC-01_FB_POST-${no}`,
      file: `CASE-S01_INC-01_FB_POST-${no}_screenshot.png`,
      kind: i % 3 === 0 ? "render" : i % 3 === 1 ? "screenshot" : "api_json",
      date: `${String((i % 28) + 1).padStart(2, "0")} Nov 2026`,
      hash: sampleHash(`${seed}-${i}`),
      status: STATUSES[i % STATUSES.length]!,
      handler: i % 2 ? "Sample analyst A" : "Sample analyst B",
      action: ["captured", "re-hashed", "accessed", "exported"][i % 4]!,
    };
  });
}

function ArtefactTable({ n, seed }: { n: number; seed: string }) {
  return (
    <table>
      <thead>
        <tr><th>Item</th><th>Kind</th><th>Captured</th><th>SHA-256</th><th>Check</th></tr>
      </thead>
      <tbody>
        {rows(n, seed).map((r) => (
          <tr key={r.file}>
            <td className="font-mono">{r.code}</td>
            <td>{r.kind === "render" ? "RENDER – from API data, not a platform screenshot" : r.kind}</td>
            <td>{r.date}</td>
            <td className="hash">{r.hash}</td>
            <td><DocStatus tone={r.status[1]}>{r.status[0]}</DocStatus></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function CustodyTable({ n, seed }: { n: number; seed: string }) {
  return (
    <table>
      <thead>
        <tr><th>Date</th><th>Action</th><th>File</th><th>SHA-256</th><th>Handler</th></tr>
      </thead>
      <tbody>
        {rows(n, seed).map((r) => (
          <tr key={r.file}>
            <td>{r.date}</td>
            <td>{r.action}</td>
            <td className="font-mono">{r.file}</td>
            <td className="hash">{r.hash}</td>
            <td>{r.handler}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const details = (ref: string): [string, string][] => [
  ["Client", "Sample client Sdn. Bhd."],
  ["Reference", ref],
  ["Date", DATE],
  ["Prepared by", "Sample analyst A"],
  ["Version", "v1.0 · Sample"],
];

function Body({ kind }: { kind: SampleKind }) {
  switch (kind) {
    case "case-report":
      return (
        <PrintDocument sample label="Case report" kicker="01 · Case report" title="CASE-S01" subtitle="Sample case for layout checks" cover={{ details: details("CASE-S01") }}>
          <DocKicker>Section 1</DocKicker>
          <h2>Case summary</h2>
          <DocCallout>
            <p>Status: <DocStatus tone="info">OPEN</DocStatus> · Offence alleged: sample s.233 CMA complaint · Lead handler: Sample analyst A.</p>
          </DocCallout>
          <p>This sample shows the report layout. Every value on these pages is sample data.</p>
          <h2 className="print-break">Artefact register</h2>
          <p className="fa-doc-caption">Every stored file with its SHA-256 hash at capture time.</p>
          <ArtefactTable n={60} seed="case" />
          <h2 className="print-break">Chain-of-custody log</h2>
          <CustodyTable n={24} seed="case-custody" />
          <DocCallout card>
            <p>Images built from platform API data are labelled “RENDER – from API data, not a platform screenshot”. Translations are separate from the original text and carry a translator statement.</p>
          </DocCallout>
        </PrintDocument>
      );
    case "dossier":
      return (
        <PrintDocument sample label="Dossier" kicker="02 · Evidence dossier" title="CASE-S01" subtitle="Sample dossier" cover={{ tagline: true, details: details("CASE-S01") }}>
          <h2>1. Case summary</h2>
          <DocCallout card><p>Sample: 12 posts, 3 reels, 40 comments, 6 replies, published between 01 Nov 2026 and 28 Nov 2026.</p></DocCallout>
          <h2 className="print-break">2. Timeline of published content</h2>
          <ArtefactTable n={45} seed="dossier" />
          <h2 className="print-break">3. Transcripts</h2>
          <DocCallout>
            <p className="fa-doc-caption">Original (Malay) — sample</p>
            <p>“Contoh transkrip untuk semakan susun atur.”</p>
            <p className="fa-doc-caption">English translation — machine translation, needs human verification</p>
            <p>“Sample transcript for layout review.”</p>
          </DocCallout>
          <h2>4. Declaration</h2>
          <p>The material above was captured by FA Portal and preserved in append-only storage. Each file is identified by the SHA-256 fingerprint shown; any alteration would change the fingerprint.</p>
          <div className="mt-12 grid grid-cols-2 gap-10">
            <div className="border-t pt-1">Prepared by (name, signature)</div>
            <div className="border-t pt-1">Date</div>
          </div>
        </PrintDocument>
      );
    case "custody-report":
      return (
        <PrintDocument sample label="Custody report" kicker="03 · Custody report" title="CASE-S01" subtitle="Chain-of-custody log" cover={{ details: details("CASE-S01") }}>
          <h2>Custody entries</h2>
          <p className="fa-doc-caption">Every recorded action, oldest first. Entries are append-only.</p>
          <CustodyTable n={70} seed="custody" />
        </PrintDocument>
      );
    case "export-manifest":
      return (
        <PrintDocument sample label="Export manifest" kicker="EXP-S01 · Manifest" title="Evidence bundle manifest" subtitle={`Built ${DATE} · 18 files`}>
          <ArtefactTable n={18} seed="manifest" />
        </PrintDocument>
      );
    case "verification-report":
      return (
        <PrintDocument sample label="Verification report" kicker="VER-S01 · Verification" title="Re-hash before export" subtitle={`Checked ${DATE}`}>
          <DocCallout><p>Result: <DocStatus tone="negative">BLOCKED</DocStatus> — 1 of 12 files did not match its recorded hash. Export stays blocked until it is resolved.</p></DocCallout>
          <ArtefactTable n={12} seed="verify" />
        </PrintDocument>
      );
    case "executive-brief":
      return (
        <PrintDocument sample label="Executive brief" kicker="ENG-S01 · Executive brief" title="Executive brief — Sample engagement" subtitle={`Sample client · brief v1 · ${DATE} · DRAFT`}>
          <h2>Volumes</h2>
          <DocCallout card><p>Candidates read: 120 of 140 (Sample). Flagged: 18. Excluded with a reason: 102.</p></DocCallout>
          <h2>Flagged items by severity</h2>
          <table>
            <thead><tr><th>Category</th><th>CRITICAL</th><th>HIGH</th><th>MEDIUM</th><th>LOW</th></tr></thead>
            <tbody>
              {["Harassment", "Threat", "Misinformation", "Hate speech"].map((c, i) => (
                <tr key={c}><td>{c}</td><td>{i}</td><td>{i + 2}</td><td>{i + 1}</td><td>{3 - i}</td></tr>
              ))}
            </tbody>
          </table>
          <p className="fa-doc-caption">All figures are Sample and editable.</p>
        </PrintDocument>
      );
    case "limits-statement":
      return (
        <PrintDocument sample label="Limits statement" kicker="ENG-S01 · Limits" title="Limits statement — Sample engagement">
          <h2>Sampling</h2>
          <p>Sample rule: top 50 posts by reach. Comment cap: 200 per post, newest first. Comments beyond the cap on a busy post were not seen.</p>
          <h2>Evidence</h2>
          <DocCallout><p>Flagged items: 18. At FA-STD-001 V2 (proof): 12. Still at API raw only: 4; element crop: 2. These are not proof.</p></DocCallout>
          <h2>Translation</h2>
          <p>5 comments carry a machine translation that no person has reviewed. The verbatim original is the record.</p>
        </PrintDocument>
      );
    case "release-log":
      return (
        <PrintDocument sample label="Release log" kicker="ENG-S01 · G5 release" title="Release pack log" subtitle={`Released ${DATE}`}>
          <table>
            <thead><tr><th>File</th><th>SHA-256</th><th>Status</th></tr></thead>
            <tbody>
              {["executive_brief.md", "findings_tables.csv", "limits_statement.md", "dataset.csv", "evidence_bundle.zip"].map((f, i) => (
                <tr key={f}><td className="font-mono">ENG-S01_{f}</td><td className="hash">{sampleHash(`rel-${i}`)}</td><td><DocStatus tone="positive">RELEASED</DocStatus></td></tr>
              ))}
            </tbody>
          </table>
        </PrintDocument>
      );
    case "home-vault-bundle":
      return (
        <PrintDocument sample label="Bundle manifest" kicker="HV-S01 · Home-vault bundle" title="Home-vault bundle manifest" subtitle="Manifest and hash only — the files stay on the device">
          <DocCallout><p>Bundle SHA-256</p><p className="hash">{sampleHash("bundle")}</p></DocCallout>
          <table>
            <thead><tr><th>File</th><th>SHA-256</th></tr></thead>
            <tbody>
              {rows(8, "hv").map((r) => (<tr key={r.file}><td className="font-mono">{r.file}</td><td className="hash">{r.hash}</td></tr>))}
            </tbody>
          </table>
        </PrintDocument>
      );
  }
}

function SamplePage() {
  const { kind } = Route.useParams();
  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <Link to="/document-samples" className="border-input hover:bg-accent inline-flex min-h-12 items-center gap-2 rounded-lg border px-4 text-sm font-medium">
          <ArrowLeft className="size-4" /> All samples
        </Link>
        <Button className="h-12" onClick={() => window.print()}>
          <Printer className="size-4" /> Print / save as PDF
        </Button>
      </div>
      <Body kind={kind as SampleKind} />
    </div>
  );
}
