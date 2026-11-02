import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Briefcase, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useMutation } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useLinkableProjects } from "@/lib/projects";

/**
 * Case header action: put this case folder in an engagement's scope. Only possible after the
 * engagement's mandate (G1). Items are chosen as candidates later, per cycle, after the design (G2).
 */
export function AddCaseToProject({ caseId }: { caseId: string }) {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const projects = useLinkableProjects(open);
  const [projectId, setProjectId] = useState("");
  const linked = useQuery({
    queryKey: ["case-projects", caseId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("project_cases")
        .select("project_id, voided_at, projects(code, name)")
        .eq("case_id", caseId);
      if (error) return [];
      return (
        (data ?? []) as unknown as {
          project_id: string;
          voided_at: string | null;
          projects: { code: string; name: string } | null;
        }[]
      ).filter((l) => !l.voided_at);
    },
  });
  useEffect(() => {
    if (open) setProjectId("");
  }, [open]);
  const already = new Set((linked.data ?? []).map((l) => l.project_id));
  const choices = (projects.data ?? []).filter((p) => !already.has(p.id));
  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("project_cases")
        .insert({ project_id: projectId, case_id: caseId });
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["case-projects", caseId] });
      void qc.invalidateQueries({ queryKey: ["project", projectId] });
      void qc.invalidateQueries({ queryKey: ["clients-projects"] });
      toast.success("Case folder linked to the engagement");
      setOpen(false);
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : "Could not link", { duration: 12000 }),
  });
  return (
    <>
      <Button variant="outline" className="min-h-11" onClick={() => setOpen(true)}>
        <Briefcase className="size-4" /> Projects
        {linked.data?.length ? (
          <span className="bg-secondary text-secondary-foreground rounded-full px-1.5 text-xs">
            {linked.data.length}
          </span>
        ) : null}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>CASE-{caseId} in engagements</DialogTitle>
            <DialogDescription>
              Linking puts the case folder in an engagement's scope; nothing is copied. Only
              engagements past the mandate (G1) are listed.
            </DialogDescription>
          </DialogHeader>
          {linked.data?.length ? (
            <ul className="space-y-1 text-sm">
              {linked.data.map((l) => (
                <li key={l.project_id}>
                  <Link
                    to="/projects/$projectId"
                    params={{ projectId: l.project_id }}
                    search={{ tab: "reading" }}
                    className="hover:underline"
                    onClick={() => setOpen(false)}
                  >
                    <span className="font-mono text-xs font-bold">{l.projects?.code}</span>{" "}
                    {l.projects?.name}
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted-foreground text-sm">Not in any engagement yet.</p>
          )}
          <div className="grid gap-3 border-t pt-4">
            <Label htmlFor="add-proj">Add to another engagement</Label>
            <select
              id="add-proj"
              className="border-input bg-background min-h-11 rounded-md border px-3 text-sm"
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
            >
              <option value="">
                {projects.isLoading
                  ? "Loading…"
                  : choices.length
                    ? "Choose an engagement"
                    : "None past the mandate"}
              </option>
              {choices.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.code} · {p.name}
                  {p.clients ? ` (${p.clients.name})` : ""}
                </option>
              ))}
            </select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Close
            </Button>
            <Button disabled={!projectId || save.isPending} onClick={() => save.mutate()}>
              {save.isPending ? <Loader2 className="size-4 animate-spin" /> : null} Link case
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
