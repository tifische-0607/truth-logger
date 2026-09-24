import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { formatDateTime } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/capture-settings")({
  head: () => ({
    meta: [
      { title: "Capture settings — SpyGlass V2" },
      {
        name: "description",
        content:
          "Set the Facebook account label, proxy address and capture timeout the Mac mini uses for every queued capture.",
      },
      { property: "og:title", content: "Capture settings — SpyGlass V2" },
      {
        property: "og:description",
        content: "Account, proxy and timeout settings applied to every queued Facebook capture.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CaptureSettingsPage,
});

type FieldRule = { keep: boolean; reason: string };
type FieldRules = Record<string, FieldRule>;

const PROFILE_FIELDS: { key: string; label: string; locked?: string }[] = [
  { key: "display_name", label: "Full name", locked: "Always kept — identifies who posted the evidence." },
  { key: "profile_url", label: "Profile link", locked: "Always kept — needed to trace the account." },
  { key: "profile_screenshot", label: "Profile screenshot" },
  { key: "platform_id", label: "Facebook account ID" },
  { key: "verified", label: "Verified badge" },
  { key: "followers", label: "Followers count" },
  { key: "following", label: "Following count" },
  { key: "likes", label: "Likes count" },
  { key: "bio_verbatim", label: "Bio" },
  { key: "intro_stated", label: "Intro lines (work, city, etc.)" },
];

function CaptureSettingsPage() {
  const qc = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    fb_account_label: "",
    proxy_url: "",
    timeout_seconds: 180,
    expand_comments: true,
    save_pdf: true,
    notes: "",
  });
  const [rules, setRules] = useState<FieldRules>({});

  const settings = useQuery({
    queryKey: ["capture-settings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("capture_settings")
        .select("*")
        .eq("id", "default")
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    const d = settings.data;
    if (!d) return;
    setForm({
      fb_account_label: d.fb_account_label ?? "",
      proxy_url: d.proxy_url ?? "",
      timeout_seconds: d.timeout_seconds ?? 180,
      expand_comments: d.expand_comments,
      save_pdf: d.save_pdf,
      notes: d.notes ?? "",
    });
    setRules(((d as { profile_fields?: FieldRules }).profile_fields ?? {}) as FieldRules);
  }, [settings.data]);

  const save = async () => {
    const missing = PROFILE_FIELDS.find((f) => rules[f.key]?.keep === false && !rules[f.key]?.reason.trim());
    if (missing) {
      toast.error(`Add a reason for dropping "${missing.label}".`);
      return;
    }
    setSaving(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const { error } = await supabase
        .from("capture_settings")
        .update({
          fb_account_label: form.fb_account_label || null,
          proxy_url: form.proxy_url || null,
          timeout_seconds: Number(form.timeout_seconds) || 180,
          expand_comments: form.expand_comments,
          save_pdf: form.save_pdf,
          notes: form.notes || null,
          profile_fields: rules,
          updated_by: userData.user?.id ?? null,
        })
        .eq("id", "default");
      if (error) throw error;
      await qc.invalidateQueries({ queryKey: ["capture-settings"] });
      toast.success("Capture settings saved — the Mac mini uses them on its next run.");
    } catch {
      toast.error("Could not save. Only the workspace owner can change these settings.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Capture settings"
        subtitle="Applied to every capture the Mac mini runs from the queue."
        actions={
          <Button className="h-12" disabled={saving} onClick={() => void save()}>
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
            Save
          </Button>
        }
      />

      <section className="panel space-y-5 p-5">
        <div className="space-y-2">
          <Label htmlFor="fb">Facebook account in use</Label>
          <Input
            id="fb"
            className="h-12"
            value={form.fb_account_label}
            onChange={(e) => setForm({ ...form, fb_account_label: e.target.value })}
            placeholder="e.g. investigations@fridayanalytics.org"
          />
          <p className="text-muted-foreground text-xs">
            A label only, for the record. The password is never stored here — the Mac mini keeps
            its own signed-in browser session (run <span className="font-mono">python -m
            worker.login</span> once on that machine).
          </p>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="proxy">Proxy address</Label>
            <Input
              id="proxy"
              className="h-12"
              value={form.proxy_url}
              onChange={(e) => setForm({ ...form, proxy_url: e.target.value })}
              placeholder="http://user:pass@host:port (leave blank for none)"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="timeout">Capture timeout (seconds)</Label>
            <Input
              id="timeout"
              type="number"
              min={30}
              max={1800}
              className="h-12"
              value={form.timeout_seconds}
              onChange={(e) => setForm({ ...form, timeout_seconds: Number(e.target.value) })}
            />
          </div>
        </div>

        <div className="flex items-center justify-between gap-4 py-1">
          <Label htmlFor="expand">Expand all comments before capturing</Label>
          <Switch
            id="expand"
            checked={form.expand_comments}
            onCheckedChange={(v) => setForm({ ...form, expand_comments: v })}
          />
        </div>
        <div className="flex items-center justify-between gap-4 py-1">
          <Label htmlFor="pdf">Save a PDF copy alongside the screenshot</Label>
          <Switch
            id="pdf"
            checked={form.save_pdf}
            onCheckedChange={(v) => setForm({ ...form, save_pdf: v })}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="notes">Notes</Label>
          <Textarea
            id="notes"
            rows={3}
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            placeholder="Anything the handler should know about this capture setup."
          />
        </div>

        <p className="text-muted-foreground text-xs">
          Last changed: {settings.data?.updated_at ? formatDateTime(settings.data.updated_at) : "—"}
        </p>
      </section>

      <section className="panel space-y-4 p-5">
        <div>
          <h2 className="font-semibold">Profile privacy</h2>
          <p className="text-muted-foreground text-sm">
            Choose which author profile details the Mac mini saves. Dropped details are never
            stored; each drop needs a reason, and it is written to the capture log. Religion,
            politics, ethnicity, birth date and age are always dropped (PDPA).
          </p>
        </div>
        <div className="divide-y">
          {PROFILE_FIELDS.map((f) => {
            const rule = rules[f.key] ?? { keep: true, reason: "" };
            const set = (patch: Partial<FieldRule>) =>
              setRules({ ...rules, [f.key]: { ...rule, ...patch } });
            return (
              <div key={f.key} className="space-y-2 py-3">
                <div className="flex items-center justify-between gap-4">
                  <Label htmlFor={`pf-${f.key}`} className="text-sm">
                    {f.label}
                    <span className="text-muted-foreground ml-2 text-xs">
                      {f.locked ? "Kept" : rule.keep ? "Saved" : "Dropped"}
                    </span>
                  </Label>
                  <Switch
                    id={`pf-${f.key}`}
                    checked={f.locked ? true : rule.keep}
                    disabled={!!f.locked}
                    onCheckedChange={(v) => set({ keep: v })}
                  />
                </div>
                {f.locked ? (
                  <p className="text-muted-foreground text-xs">{f.locked}</p>
                ) : (
                  <Input
                    className="h-11"
                    value={rule.reason}
                    onChange={(e) => set({ reason: e.target.value })}
                    placeholder={rule.keep ? "Why it's saved (e.g. shows reach of the post)" : "Why it's dropped (required)"}
                  />
                )}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
