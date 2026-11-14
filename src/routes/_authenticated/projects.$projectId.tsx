import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { BriefTab } from "@/components/engagement/BriefTab";
import { DesignTab } from "@/components/engagement/DesignTab";
import { DiscoveryTab, IntakeRegister } from "@/components/engagement/DiscoveryTab";
import { GatesTab } from "@/components/engagement/GatesTab";
import { ReleaseTab } from "@/components/engagement/ReleaseTab";
import { EvidenceTab } from "@/components/engagement/EvidenceTab";
import { LogTab } from "@/components/engagement/LogTab";
import { OverviewTab } from "@/components/engagement/OverviewTab";
import { ScenarioRegister, SuccessPlan } from "@/components/engagement/PlanTab";
import { CollectTab } from "@/components/engagement/CollectTab";
import { ReadingTab } from "@/components/engagement/ReadingTab";
import { ReportsTab } from "@/components/engagement/ReportsTab";
import { TeamTab } from "@/components/engagement/TeamTab";
import { ProjectStatusChip } from "@/components/projects/ProjectRow";
import { PROJECT_STATUS, currentPhase, roleLabel, useProjectWorkspace } from "@/lib/projects";
import { cn } from "@/lib/utils";
import { hubHead } from '@/lib/hub';
import { HousekeepingDelete } from '@/components/HousekeepingDelete';
import { EditProjectDetails } from '@/components/projects/EditProjectDetails';

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "brief", label: "Brief" },
  { id: "discovery", label: "Discovery" },
  { id: "intake", label: "Intake register" },
  { id: "plan", label: "Scenario register" },
  { id: "success", label: "Success plan" },
  { id: "gates", label: "Gates" },
  { id: "design", label: "Mandate & design" },
  { id: "collect", label: "Collect" },
  { id: "reading", label: "Reading" },
  { id: "evidence", label: "Evidence & load" },
  { id: "reports", label: "Reports" },
  { id: "release", label: "Release (HELD)" },
  { id: "team", label: "Team" },
  { id: "log", label: "Log" },
] as const;
type TabId = (typeof TABS)[number]["id"];

export const Route = createFileRoute("/_authenticated/projects/$projectId")({
  validateSearch: (search: Record<string, unknown>): { tab: TabId } => ({
    tab: TABS.some((t) => t.id === search["tab"]) ? (search["tab"] as TabId) : "overview",
  }),
  head: () => hubHead('Engagement','FA-CEF engagement phases, brief, registers and release controls.'),
  component: ProjectPage,
});

function ProjectPage() {
  const { projectId } = Route.useParams();
  const { tab } = Route.useSearch();
  const ws = useProjectWorkspace(projectId);
  const qc = useQueryClient();
  const navigate = Route.useNavigate();
  const setStatus = useMutation({
    mutationFn: async (status: string) => {
      const { error } = await supabase.from("projects").update({ status }).eq("id", projectId);
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["project", projectId] });
      void qc.invalidateQueries({ queryKey: ["clients-projects"] });
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : "Could not change status", { duration: 12000 }),
  });

  if (ws.error) {
    return (
      <div className="panel p-6 text-sm">
        <p className="font-semibold">Can't open this engagement</p>
        <p className="text-muted-foreground mt-1">
          {ws.error instanceof Error ? ws.error.message : String(ws.error)}
        </p>
        <Link to="/projects" className="mt-3 inline-block font-semibold hover:underline">
          All projects
        </Link>
      </div>
    );
  }
  if (!ws.data) return <p className="text-muted-foreground text-sm">Loading engagement…</p>;
  const w = ws.data;
  const p = w.project;
  const needsAction =
    (tab !== "reports" && w.outputs.some((o) => o.status === "qa_review")) ||
    w.briefs.some((b) => b.amendment_no && !w.approvals.some((a) => a.brief_id === b.id));

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-1 text-sm">
        <Link
          to="/projects"
          className="text-muted-foreground inline-flex items-center gap-1 hover:underline"
        >
          <ChevronLeft className="size-4" /> Projects
        </Link>
        {w.client ? (
          <>
            <span className="text-muted-foreground">/</span>
            <Link
              to="/clients/$clientId"
              params={{ clientId: w.client.id }}
              className="text-muted-foreground hover:underline"
            >
              {w.client.name}
            </Link>
          </>
        ) : null}
      </div>
      <header className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="kicker mb-2">02 · Engagement</p>
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-sm font-bold">{p.code}</span>
            <ProjectStatusChip status={p.status} />
            <span className="text-muted-foreground text-xs">Phase {currentPhase(w)}</span>
            {w.briefInForce ? (
              <span className="text-muted-foreground text-xs">
                Brief v{w.briefInForce.version}
                {w.briefInForce.amendment_no ? ` · A${w.briefInForce.amendment_no}` : ""}
              </span>
            ) : (
              <span className="bg-warn text-warn-foreground rounded-full px-2 py-0.5 text-xs font-semibold">
                No brief yet
              </span>
            )}
            {p.design_stale ? (
              <span className="bg-warn text-warn-foreground rounded-full px-2 py-0.5 text-xs font-semibold">
                Design needs G2 again
              </span>
            ) : null}
          </div>
          <h1 className="font-display mt-1 text-2xl font-medium tracking-tight md:text-3xl">{p.name}</h1>
          {p.summary ? <p className="text-muted-foreground mt-1 text-sm">{p.summary}</p> : null}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <EditProjectDetails project={p} />
          <HousekeepingDelete kind="project" id={p.id} label={`${p.code} · ${p.name}`} onDeleted={() => void navigate({ to: '/projects' })} />
          <span className="text-muted-foreground text-xs">You: {roleLabel(w.role)}</span>
          {w.canManage ? (
            <select
              aria-label="Engagement status"
              className="border-input bg-background min-h-11 rounded-md border px-3 text-sm"
              value={p.status}
              onChange={(e) => setStatus.mutate(e.target.value)}
            >
              {PROJECT_STATUS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          ) : null}
        </div>
      </header>

      <nav
        aria-label="Engagement sections"
        className="border-border -mx-1 mb-6 flex gap-1 overflow-x-auto border-b px-1"
      >
        {TABS.map((t) => (
          <Link
            key={t.id}
            to="/projects/$projectId"
            params={{ projectId }}
            search={{ tab: t.id }}
            aria-current={tab === t.id ? "page" : undefined}
            className={cn(
              "flex min-h-11 shrink-0 items-center border-b-2 px-3 text-sm font-medium whitespace-nowrap",
              tab === t.id
                ? "border-primary text-foreground"
                : "text-muted-foreground hover:text-foreground border-transparent",
            )}
          >
            {t.label}
            {(t.id === "release" && w.outputs.some((o) => o.status === "held")) ||
            (t.id === "reports" && w.outputs.some((o) => o.status === "qa_review")) ||
            (t.id === "brief" && needsAction && w.me.isCurator) ? (
              <span className="bg-warn ml-1.5 size-2 rounded-full" aria-label="needs action" />
            ) : null}
          </Link>
        ))}
        <Link to="/methodology/$projectId" params={{ projectId }} className="text-muted-foreground hover:text-foreground flex min-h-11 shrink-0 items-center border-b-2 border-transparent px-3 text-sm font-medium whitespace-nowrap">Checkpoints</Link>
      </nav>

      {tab === "overview" ? <OverviewTab ws={w} /> : null}
      {tab === "brief" ? <BriefTab ws={w} /> : null}
      {tab === "discovery" ? <DiscoveryTab ws={w} /> : null}
      {tab === "intake" ? <IntakeRegister ws={w} /> : null}
      {tab === "plan" ? <ScenarioRegister ws={w} /> : null}
      {tab === "success" ? <SuccessPlan ws={w} /> : null}
      {tab === "gates" ? <GatesTab ws={w} /> : null}
      {tab === "release" ? <ReleaseTab ws={w} /> : null}
      {tab === "design" ? <DesignTab ws={w} /> : null}
      {tab === "collect" ? <CollectTab ws={w} /> : null}
      {tab === "reading" ? <ReadingTab ws={w} /> : null}
      {tab === "evidence" ? <EvidenceTab ws={w} /> : null}
      {tab === "reports" ? <ReportsTab ws={w} /> : null}
      {tab === "team" ? <TeamTab ws={w} /> : null}
      {tab === "log" ? <LogTab ws={w} /> : null}
    </>
  );
}
