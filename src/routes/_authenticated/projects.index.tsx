import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Briefcase, Building2, Plus } from "lucide-react";

import { PageHeader } from "@/components/AppShell";
import { NewClientDialog, NewProjectDialog } from "@/components/projects/ClientProjectDialogs";
import { Button } from "@/components/ui/button";
import { ProjectRow } from "@/components/projects/ProjectRow";
import { useClientsAndProjects, useMe } from "@/lib/projects";

export const Route = createFileRoute("/_authenticated/projects/")({
  head: () => ({
    meta: [
      { title: "Projects — Evidence Hub" },
      { name: "description", content: "Clients, their projects, briefs and outputs." },
    ],
  }),
  component: ProjectsPage,
});

function ProjectsPage() {
  const me = useMe();
  const data = useClientsAndProjects();
  const [clientOpen, setClientOpen] = useState(false);
  const [projectOpen, setProjectOpen] = useState(false);
  const clients = data.data?.clients ?? [];
  const projects = data.data?.projects ?? [];
  const isOwner = me.data?.isOwner ?? false;

  return (
    <>
      <PageHeader
        title="Projects"
        subtitle="Every client, their projects, and what each project has to deliver."
        actions={
          <div className="flex flex-wrap gap-2">
            {isOwner ? (
              <Button variant="outline" className="min-h-11" onClick={() => setClientOpen(true)}>
                <Building2 className="size-4" /> New client
              </Button>
            ) : null}
            <Button
              className="min-h-11"
              disabled={!clients.length}
              onClick={() => setProjectOpen(true)}
            >
              <Plus className="size-4" /> New project
            </Button>
          </div>
        }
      />

      {data.error ? (
        <p className="text-failed-foreground text-sm">
          {data.error instanceof Error ? data.error.message : "Could not load projects"}
        </p>
      ) : null}

      {!data.isLoading && !clients.length ? (
        <div className="panel flex flex-col items-center gap-3 px-6 py-12 text-center">
          <Briefcase className="text-muted-foreground size-8" aria-hidden />
          <p className="font-semibold">No clients yet</p>
          <p className="text-muted-foreground max-w-md text-sm">
            {isOwner
              ? "Add a client, then create its first project with a brief and criteria."
              : "The owner adds clients. Once one exists you can create projects for it."}
          </p>
        </div>
      ) : null}

      <div className="space-y-6">
        {clients.map((c) => {
          const mine = projects.filter((p) => p.client_id === c.id);
          return (
            <section key={c.id} className="panel overflow-hidden" aria-labelledby={`cl-${c.id}`}>
              <div className="bg-muted/50 flex flex-wrap items-center justify-between gap-3 border-b px-5 py-3">
                <Link
                  to="/clients/$clientId"
                  params={{ clientId: c.id }}
                  className="min-w-0 hover:underline"
                >
                  <h2 id={`cl-${c.id}`} className="truncate font-semibold">
                    {c.name}
                  </h2>
                  <div className="text-muted-foreground font-mono text-xs">
                    {c.code}
                    {c.sector ? ` · ${c.sector}` : ""}
                    {c.status === "archived" ? " · archived" : ""}
                  </div>
                </Link>
                <span className="text-muted-foreground text-xs">
                  {mine.length} project{mine.length === 1 ? "" : "s"}
                </span>
              </div>
              <div className="divide-border divide-y">
                {mine.length ? (
                  mine.map((p) => <ProjectRow key={p.id} p={p} />)
                ) : (
                  <p className="text-muted-foreground px-5 py-4 text-sm">
                    No projects you are on for this client.
                  </p>
                )}
              </div>
            </section>
          );
        })}
      </div>

      <NewClientDialog open={clientOpen} onOpenChange={setClientOpen} />
      <NewProjectDialog
        open={projectOpen}
        onOpenChange={setProjectOpen}
        clients={clients}
        existingCodes={projects.map((p) => p.code)}
      />
    </>
  );
}
