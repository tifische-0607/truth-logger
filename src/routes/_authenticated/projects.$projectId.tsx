import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { ProjectBriefTab } from "@/components/projects/ProjectBriefTab";
import { ProjectDashboard } from "@/components/projects/ProjectDashboard";
import { ProjectEvidenceTab } from "@/components/projects/ProjectEvidenceTab";
import { ProjectLogTab, ProjectOverview } from "@/components/projects/ProjectOverview";
import { ProjectOutputsTab } from "@/components/projects/ProjectOutputsTab";
import { ProjectTeamTab } from "@/components/projects/ProjectTeamTab";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PROJECT_STATUS, ROLE_LABEL, useProjectWorkspace, type MemberRole } from "@/lib/projects";
import { cn } from "@/lib/utils";
import { ProjectStatusChip } from "@/components/projects/ProjectRow";

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "brief", label: "Brief & criteria" },
  { id: "evidence", label: "Evidence" },
  { id: "outputs", label: "Outputs" },
  { id: "dashboard", label: "Dashboard" },
  { id: "team", label: "Team" },
  { id: "log", label: "Log" },
] as const;
type TabId = (typeof TABS)[number]["id"];

export const Route = createFileRoute("/_authenticated/projects/$projectId")({
  validateSearch: (search: Record<string, unknown>): { tab: TabId } => ({
    tab: TABS.some((t) => t.id === search["tab"]) ? (search["tab"] as TabId) : "overview",
  }),
  head: () => ({ meta: [{ title: "Project — Evidence Hub" }] }),
  component: ProjectPage,
});

function ProjectPage() {
  const { projectId } = Route.useParams();
  const { tab } = Route.useSearch();
  const ws = useProjectWorkspace(projectId);
  const qc = useQueryClient();

  const setStatus = useMutation({
    mutationFn: async (status: string) => {
      const { error } = await supabase.from("projects").update({ status }).eq("id", projectId);
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["project", projectId] });
      void qc.invalidateQueries({ queryKey: ["clients-projects"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not change status"),
  });

  if (ws.error) {
    return (
      <div className="panel p-6 text-sm">
        <p className="font-semibold">Can't open this project</p>
        <p className="text-muted-foreground mt-1">
          {ws.error instanceof Error ? ws.error.message : String(ws.error)}
        </p>
        <Link to="/projects" className="mt-3 inline-block font-semibold hover:underline">
          All projects
        </Link>
      </div>
    );
  }
  if (!ws.data) return <p className="text-muted-foreground text-sm">Loading project…</p>;
  const w = ws.data;
  const p = w.project;

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
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-sm font-bold">{p.code}</span>
            <ProjectStatusChip status={p.status} />
            {w.current ? (
              <span className="text-muted-foreground text-xs">Brief v{w.current.version}</span>
            ) : (
              <span className="bg-warn text-warn-foreground rounded-full px-2 py-0.5 text-xs font-semibold">
                No brief yet
              </span>
            )}
          </div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight md:text-3xl">{p.name}</h1>
          {p.summary ? <p className="text-muted-foreground mt-1 text-sm">{p.summary}</p> : null}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-muted-foreground text-xs">
            You: {w.role === "owner" ? "Owner" : (ROLE_LABEL[w.role as MemberRole] ?? "—")}
          </span>
          {w.canManage ? (
            <Select value={p.status} onValueChange={(v) => setStatus.mutate(v)}>
              <SelectTrigger className="min-h-11 w-36" aria-label="Project status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PROJECT_STATUS.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}
        </div>
      </header>

      <nav
        aria-label="Project sections"
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
            {t.id === "outputs" && w.outputs.some((o) => o.status === "in_review") ? (
              <span className="bg-warn ml-1.5 size-2 rounded-full" aria-label="needs review" />
            ) : null}
          </Link>
        ))}
      </nav>

      {tab === "overview" ? <ProjectOverview ws={w} /> : null}
      {tab === "brief" ? <ProjectBriefTab ws={w} /> : null}
      {tab === "evidence" ? <ProjectEvidenceTab ws={w} /> : null}
      {tab === "outputs" ? <ProjectOutputsTab ws={w} /> : null}
      {tab === "dashboard" ? <ProjectDashboard ws={w} /> : null}
      {tab === "team" ? <ProjectTeamTab ws={w} /> : null}
      {tab === "log" ? <ProjectLogTab ws={w} /> : null}
    </>
  );
}
