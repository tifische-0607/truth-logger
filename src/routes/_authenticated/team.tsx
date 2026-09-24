import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Loader2, ShieldCheck, UserMinus, UserPlus, Users } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/team")({
  head: () => ({
    meta: [
      { title: "Team & case assignment — SpyGlass V2" },
      {
        name: "description",
        content:
          "Grant investigator access and assign cases so only assigned investigators can verify and export them.",
      },
      { property: "og:title", content: "Team & case assignment — SpyGlass V2" },
      {
        property: "og:description",
        content: "Manage investigators and which cases each of them can work on.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TeamPage,
});

type Member = {
  id: string;
  email: string | null;
  display_name: string | null;
  is_owner: boolean;
};

function TeamPage() {
  const qc = useQueryClient();
  const [assignTo, setAssignTo] = useState<Record<string, string>>({});

  const me = useQuery({
    queryKey: ["me-roles"],
    queryFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id ?? null;
      const { data: roles } = await supabase.from("user_roles").select("user_id, role");
      return { uid, isOwner: (roles ?? []).some((r) => r.user_id === uid && r.role === "owner") };
    },
  });

  const members = useQuery({
    queryKey: ["team-members"],
    queryFn: async () => {
      const [{ data: profiles, error }, { data: roles }] = await Promise.all([
        supabase.from("profiles").select("id, email, display_name, is_owner"),
        supabase.from("user_roles").select("user_id, role"),
      ]);
      if (error) throw error;
      return (profiles ?? []).map((p) => ({
        ...(p as Member),
        roles: (roles ?? []).filter((r) => r.user_id === p.id).map((r) => r.role as string),
      }));
    },
  });

  const cases = useQuery({
    queryKey: ["team-cases"],
    queryFn: async () => {
      const [{ data: rows, error }, { data: assignments }] = await Promise.all([
        supabase.from("cases").select("id, target_of_complaint, status").order("id"),
        supabase.from("case_assignments").select("id, case_id, user_id"),
      ]);
      if (error) throw error;
      return { rows: rows ?? [], assignments: assignments ?? [] };
    },
  });

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["team-members"] });
    void qc.invalidateQueries({ queryKey: ["team-cases"] });
  };

  const grantRole = useMutation({
    mutationFn: async ({ userId, grant }: { userId: string; grant: boolean }) => {
      if (grant) {
        const { error } = await supabase
          .from("user_roles")
          .insert({ user_id: userId, role: "analyst" });
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("user_roles")
          .delete()
          .eq("user_id", userId)
          .eq("role", "analyst");
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Investigator access updated.");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const assign = useMutation({
    mutationFn: async ({ caseId, userId }: { caseId: string; userId: string }) => {
      const { error } = await supabase
        .from("case_assignments")
        .insert({ case_id: caseId, user_id: userId });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Case assigned.");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const unassign = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("case_assignments").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Assignment removed.");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const isOwner = me.data?.isOwner ?? false;
  const memberName = (id: string) => {
    const m = members.data?.find((x) => x.id === id);
    return m?.display_name || m?.email || id.slice(0, 8);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Team & case assignment"
        subtitle="Only the owner and investigators assigned to a case can open, verify or export it."
      />

      {!isOwner && (
        <div className="panel text-muted-foreground p-4 text-sm">
          Only the workspace owner can change team access. You are shown your own assignments.
        </div>
      )}

      <section className="panel p-4 md:p-6">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <Users className="size-5" /> Investigators
        </h2>
        {members.isLoading ? (
          <Loader2 className="mt-4 size-5 animate-spin" />
        ) : (
          <ul className="mt-4 divide-y divide-border/60">
            {(members.data ?? []).map((m) => {
              const isOwnerRow = m.roles.includes("owner");
              const isAnalyst = m.roles.includes("analyst");
              return (
                <li
                  key={m.id}
                  className="flex flex-wrap items-center justify-between gap-3 py-3"
                >
                  <div>
                    <p className="font-medium">{m.display_name || m.email}</p>
                    <p className="text-muted-foreground text-xs">
                      {m.email} ·{" "}
                      {isOwnerRow
                        ? "Owner"
                        : isAnalyst
                          ? "Investigator"
                          : "No access to case data"}
                    </p>
                  </div>
                  {isOwner && !isOwnerRow && (
                    <Button
                      variant={isAnalyst ? "outline" : "default"}
                      size="lg"
                      onClick={() => grantRole.mutate({ userId: m.id, grant: !isAnalyst })}
                      disabled={grantRole.isPending}
                    >
                      {isAnalyst ? (
                        <>
                          <UserMinus className="size-4" /> Remove access
                        </>
                      ) : (
                        <>
                          <UserPlus className="size-4" /> Make investigator
                        </>
                      )}
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="panel p-4 md:p-6">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <ShieldCheck className="size-5" /> Case assignments
        </h2>
        {cases.isLoading ? (
          <Loader2 className="mt-4 size-5 animate-spin" />
        ) : (
          <ul className="mt-4 space-y-4">
            {cases.data?.rows.map((c) => {
              const rows = cases.data.assignments.filter((a) => a.case_id === c.id);
              const candidates = (members.data ?? []).filter(
                (m) => !rows.some((a) => a.user_id === m.id),
              );
              return (
                <li key={c.id} className="border-border/60 rounded-xl border p-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="font-semibold">CASE-{c.id}</p>
                    <p className="text-muted-foreground text-xs">
                      {c.target_of_complaint ?? "—"} · {c.status}
                    </p>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {rows.length === 0 && (
                      <span className="text-muted-foreground text-sm">
                        Nobody assigned — only the owner can work on this case.
                      </span>
                    )}
                    {rows.map((a) => (
                      <span
                        key={a.id}
                        className="bg-muted flex items-center gap-2 rounded-full px-3 py-1 text-sm"
                      >
                        {memberName(a.user_id)}
                        {isOwner && (
                          <button
                            type="button"
                            aria-label={`Remove ${memberName(a.user_id)} from CASE-${c.id}`}
                            className="text-muted-foreground hover:text-foreground"
                            onClick={() => unassign.mutate(a.id)}
                          >
                            ×
                          </button>
                        )}
                      </span>
                    ))}
                  </div>
                  {isOwner && candidates.length > 0 && (
                    <div className="mt-4 flex flex-wrap items-end gap-3">
                      <div className="min-w-56">
                        <Label htmlFor={`assign-${c.id}`}>Assign investigator</Label>
                        <Select
                          value={assignTo[c.id] ?? ""}
                          onValueChange={(v) => setAssignTo((s) => ({ ...s, [c.id]: v }))}
                        >
                          <SelectTrigger id={`assign-${c.id}`} className="mt-1">
                            <SelectValue placeholder="Choose a person" />
                          </SelectTrigger>
                          <SelectContent>
                            {candidates.map((m) => (
                              <SelectItem key={m.id} value={m.id}>
                                {m.display_name || m.email}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <Button
                        size="lg"
                        disabled={!assignTo[c.id] || assign.isPending}
                        onClick={() =>
                          assign.mutate({ caseId: c.id, userId: assignTo[c.id] as string })
                        }
                      >
                        Assign
                      </Button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
