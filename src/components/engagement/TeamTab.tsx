import { useState } from "react";
import { X } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { Chip, Section, Submit, useDbAction } from "@/components/engagement/ui";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/format";
import { ROLES, roleLabel, type MemberRole, type Workspace } from "@/lib/projects";

const selectCls = "border-input bg-background min-h-11 rounded-md border px-3 text-sm";

export function TeamTab({ ws }: { ws: Workspace }) {
  const [userId, setUserId] = useState("");
  const [role, setRole] = useState<MemberRole>("analyst");
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
  const add = useDbAction(
    ws,
    async () => {
      const { error } = await supabase
        .from("project_members")
        .insert({ project_id: ws.project.id, user_id: userId, role });
      if (error) throw error;
    },
    "Added",
    () => setUserId(""),
  );
  const change = useDbAction(ws, async (v: { id: string; role: MemberRole }) => {
    const { error } = await supabase
      .from("project_members")
      .update({ role: v.role })
      .eq("project_id", ws.project.id)
      .eq("user_id", v.id);
    if (error) throw error;
  });
  const remove = useDbAction(ws, async (id: string) => {
    const { error } = await supabase
      .from("project_members")
      .delete()
      .eq("project_id", ws.project.id)
      .eq("user_id", id);
    if (error) throw error;
  });
  const have = new Set(ws.members.map((m) => m.user_id));
  const order = ROLES.map((r) => r.id as string);
  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <Section
        id="tm-h"
        title="Team"
        hint="The Curator is a global role: it reads every engagement and signs G1, G2 and G5; it is not added here."
      >
        <ul className="divide-border -m-5 divide-y">
          {[...ws.members]
            .sort((a, b) => order.indexOf(a.role) - order.indexOf(b.role))
            .map((m) => (
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
                    <>
                      <select
                        aria-label={`Role of ${m.name}`}
                        className={selectCls}
                        value={m.role}
                        onChange={(e) =>
                          change.mutate({ id: m.user_id, role: e.target.value as MemberRole })
                        }
                      >
                        {ROLES.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.label}
                          </option>
                        ))}
                      </select>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Remove ${m.name}`}
                        onClick={() => remove.mutate(m.user_id)}
                      >
                        <X className="size-4" />
                      </Button>
                    </>
                  ) : (
                    <Chip>{roleLabel(m.role)}</Chip>
                  )}
                </div>
              </li>
            ))}
        </ul>
      </Section>
      <div className="space-y-6 lg:col-span-2">
        {ws.canManage ? (
          <Section
            id="ta-h"
            title="Add someone"
            hint="People need an Evidence Hub account first. FA staff take an FA role; people at the client are client viewers (visible only when the client portal is switched on)."
          >
            <div className="flex flex-wrap items-end gap-3">
              <div className="grid gap-1.5">
                <label className="text-sm font-medium" htmlFor="tm-p">
                  Person
                </label>
                <select
                  id="tm-p"
                  className={selectCls}
                  value={userId}
                  onChange={(e) => setUserId(e.target.value)}
                >
                  <option value="">Choose a person</option>
                  {(people.data ?? [])
                    .filter((p) => !have.has(p.id))
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.display_name || p.email}
                      </option>
                    ))}
                </select>
              </div>
              <div className="grid gap-1.5">
                <label className="text-sm font-medium" htmlFor="tm-r">
                  Role
                </label>
                <select
                  id="tm-r"
                  className={selectCls}
                  value={role}
                  onChange={(e) => setRole(e.target.value as MemberRole)}
                >
                  {ROLES.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </div>
              <Submit pending={add.isPending} disabled={!userId} onClick={() => add.mutate()}>
                Add to engagement
              </Submit>
            </div>
          </Section>
        ) : null}
        <Section id="tr-h" title="Roles and gates (FA-CEF Appendix D)">
          <ul className="space-y-2 text-sm">
            <li>
              <strong>Client sponsor.</strong>{" "}
              <span className="text-muted-foreground">
                Owns the brief, answers interview questions, signs it (G0; recorded by the
                engagement lead).
              </span>
            </li>
            <li>
              <strong>Curator.</strong>{" "}
              <span className="text-muted-foreground">
                Mandate, approvals, judgement-call rulings, release (G1, G2, G5). Approves brief
                amendments.
              </span>
            </li>
            {ROLES.filter((r) => r.id !== "client_viewer").map((r) => (
              <li key={r.id}>
                <strong>{r.label}.</strong> <span className="text-muted-foreground">{r.blurb}</span>
              </li>
            ))}
            <li>
              <strong>Client viewer.</strong>{" "}
              <span className="text-muted-foreground">
                {ROLES.find((r) => r.id === "client_viewer")?.blurb}
              </span>
            </li>
          </ul>
          <p className="text-muted-foreground mt-3 text-xs">
            Added {ws.members[0] ? formatDateTime(ws.members[0].added_at) : ""}
          </p>
        </Section>
      </div>
    </div>
  );
}
