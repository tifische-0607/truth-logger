import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Briefcase, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useProjectPool, useWorkableProjects } from "@/lib/projects";

/** Case header action: link this case (and optionally all its items) to a project. */
export function AddCaseToProject({ caseId }: { caseId: string }) {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const projects = useWorkableProjects(open);
  const [projectId, setProjectId] = useState("");
  const [withItems, setWithItems] = useState(true);
  const pool = useProjectPool([caseId], open && withItems);

  const linked = useQuery({
    queryKey: ["case-projects", caseId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("project_cases")
        .select("project_id, projects(code, name)")
        .eq("case_id", caseId);
      if (error) return [];
      return (data ?? []) as unknown as {
        project_id: string;
        projects: { code: string; name: string } | null;
      }[];
    },
  });

  useEffect(() => {
    if (open) {
      setProjectId("");
      setWithItems(true);
    }
  }, [open]);

  const already = new Set((linked.data ?? []).map((l) => l.project_id));
  const choices = (projects.data ?? []).filter((p) => !already.has(p.id));

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("project_cases")
        .insert({ project_id: projectId, case_id: caseId });
      if (error) throw error;
      let n = 0;
      if (withItems && pool.data?.length) {
        const rows = pool.data.map((i) =>
          i.kind === "cloud_item"
            ? { project_id: projectId, item_kind: "cloud_item", item_id: i.refId }
            : { project_id: projectId, item_kind: "home_ref", evidence_ref_id: i.refId },
        );
        const { error: iErr } = await supabase.from("project_items").insert(rows);
        if (iErr) throw iErr;
        n = rows.length;
      }
      return n;
    },
    onSuccess: (n) => {
      void qc.invalidateQueries({ queryKey: ["case-projects", caseId] });
      void qc.invalidateQueries({ queryKey: ["project", projectId] });
      void qc.invalidateQueries({ queryKey: ["clients-projects"] });
      toast.success(n ? `Case and ${n} items added to the project` : "Case added to the project");
      setOpen(false);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not add to the project"),
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
            <DialogTitle>CASE-{caseId} in projects</DialogTitle>
            <DialogDescription>
              Linking shares the case's evidence with a project; nothing is copied.
            </DialogDescription>
          </DialogHeader>
          {linked.data?.length ? (
            <ul className="space-y-1 text-sm">
              {linked.data.map((l) => (
                <li key={l.project_id}>
                  <Link
                    to="/projects/$projectId"
                    params={{ projectId: l.project_id }}
                    search={{ tab: "evidence" }}
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
            <p className="text-muted-foreground text-sm">Not in any project yet.</p>
          )}
          <div className="grid gap-3 border-t pt-4">
            <Label>Add to another project</Label>
            <Select value={projectId} onValueChange={setProjectId}>
              <SelectTrigger aria-label="Project">
                <SelectValue
                  placeholder={
                    projects.isLoading
                      ? "Loading…"
                      : choices.length
                        ? "Choose a project"
                        : "No open projects you can add to"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {choices.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.code} · {p.name}
                    {p.clients ? ` (${p.clients.name})` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={withItems} onCheckedChange={(v) => setWithItems(Boolean(v))} />
              Also add all {pool.data ? pool.data.length : ""} items in this case
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Close
            </Button>
            <Button
              disabled={!projectId || save.isPending || (withItems && pool.isLoading)}
              onClick={() => save.mutate()}
            >
              {save.isPending ? <Loader2 className="size-4 animate-spin" /> : null} Add
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
