import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { ChevronLeft, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import type { TablesUpdate } from "@/integrations/supabase/types";
import { PageHeader } from "@/components/AppShell";
import { NewProjectDialog } from "@/components/projects/ClientProjectDialogs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useClientsAndProjects, useMe } from "@/lib/projects";
import { ProjectRow } from "@/components/projects/ProjectRow";

export const Route = createFileRoute("/_authenticated/clients/$clientId")({
  head: () => ({ meta: [{ title: "Client — Evidence Hub" }] }),
  component: ClientPage,
});

function ClientPage() {
  const { clientId } = Route.useParams();
  const qc = useQueryClient();
  const me = useMe();
  const data = useClientsAndProjects();
  const client = data.data?.clients.find((c) => c.id === clientId);
  const projects = (data.data?.projects ?? []).filter((p) => p.client_id === clientId);
  const isOwner = me.data?.isOwner ?? false;
  const [projectOpen, setProjectOpen] = useState(false);
  const [form, setForm] = useState({
    name: "",
    legal_name: "",
    sector: "",
    contact_name: "",
    contact_email: "",
    notes: "",
  });

  useEffect(() => {
    if (client)
      setForm({
        name: client.name,
        legal_name: client.legal_name ?? "",
        sector: client.sector ?? "",
        contact_name: client.contact_name ?? "",
        contact_email: client.contact_email ?? "",
        notes: client.notes ?? "",
      });
  }, [client]);

  const update = useMutation({
    mutationFn: async (patch: TablesUpdate<"clients">) => {
      const { error } = await supabase.from("clients").update(patch).eq("id", clientId);
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["clients-projects"] });
      toast.success("Client saved");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not save"),
  });

  if (!client) {
    return (
      <p className="text-muted-foreground text-sm">
        {data.isLoading ? "Loading…" : "Client not found."}
      </p>
    );
  }

  const field = (key: keyof typeof form, label: string, type = "text") => (
    <div className="grid gap-1.5">
      <Label htmlFor={`cl-${key}`}>{label}</Label>
      <Input
        id={`cl-${key}`}
        type={type}
        value={form[key]}
        disabled={!isOwner}
        onChange={(e) => setForm({ ...form, [key]: e.target.value })}
      />
    </div>
  );

  return (
    <>
      <Link
        to="/projects"
        className="text-muted-foreground mb-3 inline-flex items-center gap-1 text-sm hover:underline"
      >
        <ChevronLeft className="size-4" /> Projects
      </Link>
      <PageHeader
        title={client.name}
        subtitle={`${client.code}${client.sector ? ` · ${client.sector}` : ""}`}
        actions={
          <Button className="min-h-11" onClick={() => setProjectOpen(true)}>
            <Plus className="size-4" /> New project
          </Button>
        }
      />
      <div className="grid gap-6 lg:grid-cols-3">
        <section className="panel overflow-hidden lg:col-span-2" aria-labelledby="cp-h">
          <h2 id="cp-h" className="border-b px-5 py-4 font-semibold">
            Projects
          </h2>
          <div className="divide-border divide-y">
            {projects.length ? (
              projects.map((p) => <ProjectRow key={p.id} p={p} />)
            ) : (
              <p className="text-muted-foreground px-5 py-6 text-sm">No projects yet.</p>
            )}
          </div>
        </section>

        <div className="space-y-6">
          <section className="panel space-y-4 p-5" aria-labelledby="cd-h">
            <h2 id="cd-h" className="font-semibold">
              Details
            </h2>
            {field("name", "Name")}
            {field("legal_name", "Legal name")}
            {field("sector", "Sector")}
            {field("contact_name", "Contact")}
            {field("contact_email", "Contact email", "email")}
            <div className="grid gap-1.5">
              <Label htmlFor="cl-notes">Notes</Label>
              <Textarea
                id="cl-notes"
                rows={3}
                value={form.notes}
                disabled={!isOwner}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </div>
            {isOwner ? (
              <div className="flex flex-wrap gap-2">
                <Button
                  className="min-h-11"
                  disabled={!form.name.trim() || update.isPending}
                  onClick={() =>
                    update.mutate({
                      name: form.name.trim(),
                      legal_name: form.legal_name.trim() || null,
                      sector: form.sector.trim() || null,
                      contact_name: form.contact_name.trim() || null,
                      contact_email: form.contact_email.trim() || null,
                      notes: form.notes.trim() || null,
                    })
                  }
                >
                  {update.isPending ? <Loader2 className="size-4 animate-spin" /> : null} Save
                </Button>
                <Button
                  variant="outline"
                  className="min-h-11"
                  onClick={() =>
                    update.mutate({ status: client.status === "active" ? "archived" : "active" })
                  }
                >
                  {client.status === "active" ? "Archive client" : "Reactivate client"}
                </Button>
              </div>
            ) : (
              <p className="text-muted-foreground text-xs">Only the owner edits clients.</p>
            )}
          </section>

          <section className="panel space-y-3 p-5" aria-labelledby="portal-h">
            <div className="flex items-center justify-between gap-3">
              <h2 id="portal-h" className="font-semibold">
                Client portal
              </h2>
              <Switch
                aria-label="Client portal"
                checked={client.portal_enabled}
                disabled={!isOwner || update.isPending}
                onCheckedChange={(v) => update.mutate({ portal_enabled: v })}
              />
            </div>
            <p className="text-muted-foreground text-sm">
              Not built yet. The access rules are in place: people added to a project as{" "}
              <strong>client viewer</strong> would see the project, its brief and the outputs you
              deliver and share — never cases, evidence or the project log. Leave this off until the
              portal ships.
            </p>
          </section>
        </div>
      </div>
      <NewProjectDialog
        open={projectOpen}
        onOpenChange={setProjectOpen}
        clients={data.data?.clients ?? []}
        defaultClientId={clientId}
        existingCodes={(data.data?.projects ?? []).map((p) => p.code)}
      />
    </>
  );
}
