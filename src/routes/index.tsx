import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, FileCheck2, Fingerprint, ScanSearch } from "lucide-react";

import { Button } from "@/components/ui/button";

const capabilities = [
  {
    number: "01",
    title: "Capture the full context",
    description:
      "Preserve Facebook posts, comments, replies and source files as one connected evidence record.",
    icon: ScanSearch,
  },
  {
    number: "02",
    title: "Prove file integrity",
    description:
      "Every artefact receives its own SHA-256 fingerprint and an append-only custody history.",
    icon: Fingerprint,
  },
  {
    number: "03",
    title: "Prepare a case record",
    description:
      "Organise captures by case and incident, verify every file, then export a review-ready package.",
    icon: FileCheck2,
  },
] as const;

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "SpyGlass V2 — Facebook evidence capture" },
      {
        name: "description",
        content:
          "Private workspace for collecting Facebook posts and comments as legal evidence with a verifiable chain of custody.",
      },
      { property: "og:title", content: "SpyGlass V2 — Facebook evidence capture" },
      {
        property: "og:description",
        content:
          "Collect Facebook evidence, preserve its context and verify every file through a complete chain of custody.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://spyglassv2.lovable.app/" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: "https://spyglassv2.lovable.app/" }],
  }),
  component: LandingPage,
});

function LandingPage() {
  return (
    <div className="bg-background text-foreground flex min-h-screen flex-col">
      <header className="border-border border-b">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-5 sm:px-8">
          <Link to="/" className="flex items-center gap-3" aria-label="SpyGlass V2 home">
            <img src="/favicon.png" alt="" width={32} height={32} className="rounded-md" />
            <span className="font-bold">SPYGLASS V2</span>
          </Link>

          <Button asChild size="sm">
            <Link to="/auth">Sign in</Link>
          </Button>
        </div>
      </header>

      <main className="flex flex-1 items-center">
        <div className="mx-auto w-full max-w-6xl px-5 py-16 sm:px-8 sm:py-24 lg:py-28">
          <div className="max-w-4xl">
            <p className="text-muted-foreground mb-6 font-mono text-xs font-medium uppercase tracking-widest">
              Evidence capture &amp; chain of custody
            </p>
            <h1 className="max-w-4xl text-4xl font-bold leading-[1.08] text-balance sm:text-5xl lg:text-6xl">
              Preserve every post, comment and file before the evidence disappears.
            </h1>
            <p className="text-muted-foreground mt-6 max-w-2xl text-base leading-relaxed text-pretty sm:text-lg">
              SpyGlass captures Facebook content from a dedicated Mac mini, keeps the original
              context intact and records every transfer, access and verification in a defensible
              custody trail.
            </p>
            <div className="mt-9">
              <Button asChild size="lg" className="min-h-12 px-6 text-base">
                <Link to="/auth">
                  Enter the evidence room
                  <ArrowRight aria-hidden="true" />
                </Link>
              </Button>
            </div>
          </div>

          <div className="mt-16 grid gap-4 md:mt-24 md:grid-cols-3 md:gap-6">
            {capabilities.map((capability) => (
              <article key={capability.number} className="panel flex min-h-56 flex-col p-6">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground font-mono text-xs">
                    {capability.number}
                  </span>
                  <capability.icon className="text-primary size-5" aria-hidden="true" />
                </div>
                <div className="mt-auto pt-10">
                  <h2 className="font-semibold">{capability.title}</h2>
                  <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
                    {capability.description}
                  </p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </main>

      <footer className="border-border border-t">
        <div className="text-muted-foreground mx-auto flex w-full max-w-6xl flex-col gap-2 px-5 py-6 text-xs sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <span>Private investigator workspace</span>
          <span className="font-mono">SHA-256 · APPEND-ONLY CUSTODY</span>
        </div>
      </footer>
    </div>
  );
}