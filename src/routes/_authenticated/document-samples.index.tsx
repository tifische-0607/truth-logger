import { createFileRoute, Link } from "@tanstack/react-router";
import { FileText } from "lucide-react";
import { SAMPLE_KINDS } from "@/lib/document-samples";

export const Route = createFileRoute("/_authenticated/document-samples/")({
  head: () => ({
    meta: [
      { title: "Document samples — FA Portal" },
      { name: "description", content: "Sample of every generated document type in the FA Portal A4 layout." },
      { property: "og:title", content: "Document samples — FA Portal" },
      { property: "og:description", content: "Sample of every generated document type in the A4 layout." },
    ],
  }),
  component: SamplesIndex,
});

function SamplesIndex() {
  return (
    <section className="space-y-5">
      <div>
        <p className="kicker mb-2">08 · Admin · Document samples</p>
        <h1 className="font-display text-2xl font-medium">Document samples</h1>
        <p className="text-muted-foreground mt-1">Every generated document type, built from sample data so the A4 layout can be checked.</p>
      </div>
      <ul className="grid gap-3 sm:grid-cols-2">
        {SAMPLE_KINDS.map((k) => (
          <li key={k.id}>
            <Link to="/document-samples/$kind" params={{ kind: k.id }} className="panel flex min-h-14 items-center gap-3 p-4 font-medium">
              <FileText className="size-5" /> {k.label}
              <span className="text-muted-foreground ml-auto text-sm">{k.long ? "With cover" : "No cover"}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
