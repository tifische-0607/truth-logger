import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Loader2, Plus, Star, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/_authenticated/templates")({
  head: () => ({
    meta: [
      { title: "Case templates — FB Evidence Monitor" },
      {
        name: "description",
        content:
          "Define the fields and required artefacts for each kind of investigation so every new case follows the same shape.",
      },
      { property: "og:title", content: "Case templates — FB Evidence Monitor" },
      {
        property: "og:description",
        content: "Reusable field and artefact checklists for new investigations.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TemplatesPage,
});

const EMPTY = {
  name: "",
  description: "",
  offence_alleged: "",
  jurisdiction_agency: "",
  fields: "",
  required_artefacts: "",
};

function TemplatesPage() {
  const qc = useQueryClient();
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);

  const templates = useQuery({
    queryKey: ["case-templates"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("case_templates")
        .select("*")
        .order("is_default", { ascending: false })
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  const create = async () => {
    if (!form.name.trim()) {
      toast.error("Give the template a name first.");
      return;
    }
    setSaving(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const { error } = await supabase.from("case_templates").insert({
        name: form.name.trim(),
        description: form.description || null,
        offence_alleged: form.offence_alleged || null,
        jurisdiction_agency: form.jurisdiction_agency || null,
        fields: form.fields
          .split("\n")
          .map((f) => f.trim())
          .filter(Boolean),
        required_artefacts: form.required_artefacts
          .split("\n")
          .map((f) => f.trim())
          .filter(Boolean),
        created_by: userData.user?.id ?? null,
      });
      if (error) throw error;
      setForm(EMPTY);
      await qc.invalidateQueries({ queryKey: ["case-templates"] });
      toast.success("Template saved.");
    } catch {
      toast.error("Could not save. Only the workspace owner can manage templates.");
    } finally {
      setSaving(false);
    }
  };

  const makeDefault = async (id: string) => {
    await supabase.from("case_templates").update({ is_default: false }).neq("id", id);
    const { error } = await supabase.from("case_templates").update({ is_default: true }).eq("id", id);
    if (error) {
      toast.error("Could not set the default template.");
      return;
    }
    await qc.invalidateQueries({ queryKey: ["case-templates"] });
    toast.success("Default template updated.");
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from("case_templates").delete().eq("id", id);
    if (error) {
      toast.error("Could not remove this template.");
      return;
    }
    await qc.invalidateQueries({ queryKey: ["case-templates"] });
    toast.success("Template removed.");
  };

  const list = templates.data ?? [];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Case templates"
        subtitle="Set the fields and artefacts each kind of investigation must have."
      />

      <section className="panel space-y-4 p-5">
        <h2 className="font-semibold">New template</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="name">Template name</Label>
            <Input
              id="name"
              className="h-12"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g. Online harassment — CMA s.233"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="agency">Agency / jurisdiction</Label>
            <Input
              id="agency"
              className="h-12"
              value={form.jurisdiction_agency}
              onChange={(e) => setForm({ ...form, jurisdiction_agency: e.target.value })}
              placeholder="e.g. MCMC"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="offence">Offence alleged</Label>
            <Input
              id="offence"
              className="h-12"
              value={form.offence_alleged}
              onChange={(e) => setForm({ ...form, offence_alleged: e.target.value })}
              placeholder="e.g. Improper use of network facilities"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Input
              id="description"
              className="h-12"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="When to use this template"
            />
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="fields">Fields to record (one per line)</Label>
            <Textarea
              id="fields"
              rows={5}
              value={form.fields}
              onChange={(e) => setForm({ ...form, fields: e.target.value })}
              placeholder={"Complainant name\nPolice report number\nDate of first post"}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="artefacts">Required artefacts (one per line)</Label>
            <Textarea
              id="artefacts"
              rows={5}
              value={form.required_artefacts}
              onChange={(e) => setForm({ ...form, required_artefacts: e.target.value })}
              placeholder={"Full-page screenshot\nPDF copy\nRaw page source\nPost text file"}
            />
          </div>
        </div>
        <Button className="h-12" disabled={saving} onClick={() => void create()}>
          {saving ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
          Save template
        </Button>
      </section>

      <section className="space-y-4">
        {list.length === 0 && (
          <p className="text-muted-foreground panel px-5 py-6 text-sm">
            No templates yet — create one above and new cases can follow it.
          </p>
        )}
        {list.map((t) => (
          <div key={t.id} className="panel space-y-3 p-5">
            <div className="flex flex-wrap items-center gap-3">
              <h3 className="font-semibold">{t.name}</h3>
              {t.is_default && (
                <span className="bg-done text-done-foreground rounded-full px-2 py-0.5 text-xs">
                  Default
                </span>
              )}
              <div className="ml-auto flex gap-2">
                {!t.is_default && (
                  <Button
                    variant="ghost"
                    className="h-11"
                    onClick={() => void makeDefault(t.id)}
                  >
                    <Star className="size-4" /> Make default
                  </Button>
                )}
                <Button variant="ghost" className="h-11" onClick={() => void remove(t.id)}>
                  <Trash2 className="size-4" /> Remove
                </Button>
              </div>
            </div>
            {t.description && <p className="text-muted-foreground text-sm">{t.description}</p>}
            <div className="text-muted-foreground grid gap-4 text-sm sm:grid-cols-2">
              <div>
                <p className="text-foreground mb-1 text-xs uppercase">Fields</p>
                <ul className="list-inside list-disc">
                  {((t.fields as string[]) ?? []).map((f) => (
                    <li key={f}>{f}</li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="text-foreground mb-1 text-xs uppercase">Required artefacts</p>
                <ul className="list-inside list-disc">
                  {(t.required_artefacts ?? []).map((f) => (
                    <li key={f}>{f}</li>
                  ))}
                </ul>
              </div>
            </div>
            <p className="text-muted-foreground text-xs">
              {t.offence_alleged ? `${t.offence_alleged} · ` : ""}
              {t.jurisdiction_agency ?? ""}
            </p>
          </div>
        ))}
      </section>
    </div>
  );
}
