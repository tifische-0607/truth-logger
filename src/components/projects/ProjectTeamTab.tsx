import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { X } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ROLE_LABEL, type MemberRole, type Workspace } from "@/lib/projects";

const ROLE_HELP: Record<MemberRole, string> = {
  lead: "Writes the brief, manages the team, approves and delivers outputs.",
  analyst: "Links evidence, assesses items, drafts outputs.",
  reviewer: "Reads everything; cannot change it.",
  client_viewer:
    "Someone at the client. Sees the project, brief and shared outputs once the client portal is on.",
};

export function ProjectTeamTab({ ws }: { ws: Workspace }) {
  const qc = useQueryClient();
  const [userId, setUserId] = useState("");
  const [role, setRole] = useState<MemberRole>("analyst");
  const refresh = () => void qc.invalidateQueries({ queryKey: ["project", ws.project.id] });

  const people = useQuery({
    queryKey: ["profiles-for-team"],
    enabled: ws.canManage,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, display_name, email")
        .order("email");
      if (error) throw error;
      return data ?? [];
    },
  });

  const friendly = (e: unknown) => {
    const m = e instanceof Error ? e.message : String(e);
    if (/at least one lead/.test(m)) return "A project needs at least one lead.";
    if (/staff join/.test(m)) return "FridayAnalytics staff join as lead, analyst or reviewer.";
    if (/Only investigators/.test(m))
      return "This person has no FridayAnalytics role; add them as client viewer, or ask the owner to give them a role.";
    return m;
  };

  const add = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("project_members")
        .insert({ project_id: ws.project.id, user_id: userId, role });
      if (error) throw error;
    },
    onSuccess: () => {
      setUserId("");
      refresh();
      toast.success("Added to the project");
    },
    onError: (e) => toast.error(friendly(e)),
  });
  const change = useMutation({
    mutationFn: async (v: { userId: string; role: MemberRole }) => {
      const { error } = await supabase
        .from("project_members")
        .update({ role: v.role })
        .eq("project_id", ws.project.id)
        .eq("user_id", v.userId);
      if (error) throw error;
    },
    onSuccess: refresh,
    onError: (e) => toast.error(friendly(e)),
  });
  const remove = useMutation({
    mutationFn: async (uid: string) => {
      const { error } = await supabase
        .from("project_members")
        .delete()
        .eq("project_id", ws.project.id)
        .eq("user_id", uid);
      if (error) throw error;
    },
    onSuccess: refresh,
    onError: (e) => toast.error(friendly(e)),
  });

  const memberIds = new Set(ws.members.map((m) => m.user_id));
  const candidates = (people.data ?? []).filter((p) => !memberIds.has(p.id));
  const order: MemberRole[] = ["lead", "analyst", "reviewer", "client_viewer"];
  const sorted = [...ws.members].sort(
    (a, b) => order.indexOf(a.role as MemberRole) - order.indexOf(b.role as MemberRole),
  );

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <section className="panel overflow-hidden lg:col-span-2" aria-labelledby="tm-h">
        <h2 id="tm-h" className="border-b px-5 py-4 font-semibold">
          Team
        </h2>
        <ul className="divide-border divide-y">
          {sorted.map((m) => (
            <li
              key={m.user_id}
              className="flex flex-wrap items-center justify-between gap-3 px-5 py-3"
            >
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">{m.name}</div>
                <div className="text-muted-foreground truncate text-xs">{m.email}</div>
              </div>
              <div className="flex items-center gap-2">
                {ws.canManage ? (
                  <Select
                    value={m.role}
                    onValueChange={(v) =>
                      change.mutate({ userId: m.user_id, role: v as MemberRole })
                    }
                  >
                    <SelectTrigger className="w-36" aria-label={`Role of ${m.name}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {order.map((r) => (
                        <SelectItem key={r} value={r}>
                          {ROLE_LABEL[r]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <span className="bg-secondary text-secondary-foreground rounded-full px-2.5 py-0.5 text-xs font-semibold">
                    {ROLE_LABEL[m.role as MemberRole] ?? m.role}
                  </span>
                )}
                {ws.canManage ? (
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Remove ${m.name}`}
                    onClick={() => remove.mutate(m.user_id)}
                  >
                    <X className="size-4" />
                  </Button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      </section>

      <div className="space-y-6">
        {ws.canManage ? (
          <section className="panel space-y-3 p-5" aria-labelledby="ta-h">
            <h2 id="ta-h" className="font-semibold">
              Add someone
            </h2>
            <Select value={userId} onValueChange={setUserId}>
              <SelectTrigger aria-label="Person">
                <SelectValue placeholder="Choose a person" />
              </SelectTrigger>
              <SelectContent>
                {candidates.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.display_name || p.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={role} onValueChange={(v) => setRole(v as MemberRole)}>
              <SelectTrigger aria-label="Role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {order.map((r) => (
                  <SelectItem key={r} value={r}>
                    {ROLE_LABEL[r]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-muted-foreground text-xs">{ROLE_HELP[role]}</p>
            <Button
              className="min-h-11 w-full"
              disabled={!userId || add.isPending}
              onClick={() => add.mutate()}
            >
              Add to project
            </Button>
            <p className="text-muted-foreground text-xs">
              People need an Evidence Hub account first. Being on a project lets FA staff open the
              cases linked to it.
            </p>
          </section>
        ) : null}
        <section className="panel space-y-2 p-5 text-sm" aria-labelledby="tr-h">
          <h2 id="tr-h" className="font-semibold">
            Roles
          </h2>
          {order.map((r) => (
            <p key={r}>
              <strong>{ROLE_LABEL[r]}.</strong>{" "}
              <span className="text-muted-foreground">{ROLE_HELP[r]}</span>
            </p>
          ))}
        </section>
      </div>
    </div>
  );
}
