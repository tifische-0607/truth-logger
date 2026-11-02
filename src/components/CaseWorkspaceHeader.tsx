import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { PackageCheck, ShieldCheck, Tablet, Search } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { StatusBadge } from "@/components/StatusBadge";
import { SourceBadge } from "@/components/SourceBadge";
import { useDarkNight } from "@/lib/darknight";
import { formatDateTime } from "@/lib/format";
import { getCachedCase } from "@/lib/offline";
import { cn } from "@/lib/utils";
import { AddCaseToProject } from "@/components/projects/AddToProjectDialog";

/** Per-case routes that live as tabs in one case workspace. */
export const CASE_TABS = [
  { prefix: "/summary/", to: "/summary/$caseId", label: "Overview" },
  { prefix: "/cases/", to: "/cases/$caseId", label: "Evidence" },
  { prefix: "/timeline/", to: "/timeline/$caseId", label: "Timeline" },
  { prefix: "/profiles/", to: "/profiles/$caseId", label: "People" },
  { prefix: "/comments/", to: "/comments/$caseId", label: "Comments" },
  { prefix: "/transcripts/", to: "/transcripts/$caseId", label: "Transcripts" },
  { prefix: "/trail/", to: "/trail/$caseId", label: "Custody" },
  { prefix: "/report/", to: "/report/$caseId", label: "Report" },
  { prefix: "/dossier/", to: "/dossier/$caseId", label: "Dossier" },
] as const;

/** Returns the case id when the path is one of the case workspace tabs. */
export function caseIdFromPath(pathname: string): string | null {
  for (const tab of CASE_TABS) {
    if (pathname.startsWith(tab.prefix)) {
      const id = decodeURIComponent(pathname.slice(tab.prefix.length).split("/")[0] ?? "");
      return id || null;
    }
  }
  return null;
}

export function CaseWorkspaceHeader({ caseId, pathname }: { caseId: string; pathname: string }) {
  const dn = useDarkNight();

  const caseQuery = useQuery({
    queryKey: ["case-header", caseId],
    queryFn: async () => {
      try {
        const { data, error } = await supabase
          .from("cases")
          .select(
            "id, status, opened_on, target_of_complaint, offence_alleged, jurisdiction_agency, lead_handler",
          )
          .eq("id", caseId)
          .maybeSingle();
        if (error) throw error;
        return data;
      } catch (e) {
        const cached = await getCachedCase(caseId);
        if (cached?.case)
          return cached.case as {
            id: string;
            status: string;
            opened_on: string;
            target_of_complaint: string | null;
            offence_alleged: string | null;
            jurisdiction_agency: string | null;
            lead_handler: string | null;
          };
        throw e;
      }
    },
  });

  const refs = useQuery({
    queryKey: ["evidence-refs-count", caseId],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("evidence_refs")
        .select("id", { count: "exact", head: true })
        .eq("case_id", caseId);
      if (error) return 0;
      return count ?? 0;
    },
  });

  const c = caseQuery.data;
  const meta = [
    c?.offence_alleged,
    c?.jurisdiction_agency,
    c?.lead_handler ? `Lead ${c.lead_handler}` : null,
    c?.opened_on ? `Opened ${formatDateTime(c.opened_on)}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="no-print bg-card border-border -mx-4 -mt-6 mb-6 border-b px-4 pt-5 md:-mx-8 md:-mt-8 md:px-8">
      <nav aria-label="Breadcrumb" className="text-muted-foreground text-sm">
        <Link to="/cases" className="hover:text-foreground underline-offset-2 hover:underline">
          Cases
        </Link>{" "}
        / <span className="font-mono">CASE-{caseId}</span>
      </nav>
      <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-xl font-bold tracking-tight md:text-2xl">
              <span className="font-mono">CASE-{caseId}</span>
              {c?.target_of_complaint ? ` · ${c.target_of_complaint}` : ""}
            </h1>
            {c?.status ? <StatusBadge status={c.status} /> : null}
          </div>
          {meta ? <p className="text-muted-foreground text-sm">{meta}</p> : null}
          {refs.data ? (
            <div className="flex flex-wrap gap-2">
              <SourceBadge
                vault="home"
                state={dn.state === "online" ? undefined : dn.state}
                label={`${refs.data} home-vault item${refs.data === 1 ? "" : "s"}`}
              />
            </div>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <HeaderAction to="/search" icon={Search} label="Add evidence" />
          <AddCaseToProject caseId={caseId} />
          <HeaderAction to="/verify" icon={ShieldCheck} label="Verify" />
          <HeaderAction to="/export" icon={PackageCheck} label="Export" />
          <Link
            to="/review/$caseId"
            params={{ caseId }}
            className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex min-h-11 items-center gap-2 rounded-lg px-4 text-sm font-semibold"
          >
            <Tablet className="size-4" /> Present
          </Link>
        </div>
      </div>
      <nav aria-label="Case views" className="-mb-px mt-4 flex gap-6 overflow-x-auto">
        {CASE_TABS.map((tab) => {
          const active = pathname.startsWith(tab.prefix);
          return (
            <Link
              key={tab.to}
              to={tab.to}
              params={{ caseId }}
              aria-current={active ? "page" : undefined}
              className={cn(
                "inline-flex min-h-12 shrink-0 items-center border-b-[3px] text-sm whitespace-nowrap transition-colors",
                active
                  ? "border-primary text-foreground font-semibold"
                  : "text-muted-foreground hover:text-foreground border-transparent font-medium",
              )}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

function HeaderAction({
  to,
  icon: Icon,
  label,
}: {
  to: "/search" | "/verify" | "/export";
  icon: typeof Search;
  label: string;
}) {
  return (
    <Link
      to={to}
      className="border-input hover:bg-accent inline-flex min-h-11 items-center gap-2 rounded-lg border px-4 text-sm font-medium"
    >
      <Icon className="size-4" /> {label}
    </Link>
  );
}
