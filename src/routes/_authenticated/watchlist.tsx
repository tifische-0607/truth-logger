import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/_authenticated/watchlist")({
  head: () => ({
    meta: [
      { title: "Watched pages — Evidence Hub" },
      { name: "description", content: "Pages the Mac mini checks for new posts and captures automatically." },
      { property: "og:title", content: "Watched pages — Evidence Hub" },
      { property: "og:description", content: "Automatic capture of new Facebook and Instagram posts." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: WatchlistPage,
});

const INTERVALS = [
  { v: 15, l: "Every 15 minutes" },
  { v: 60, l: "Every hour" },
  { v: 360, l: "Every 6 hours" },
  { v: 1440, l: "Once a day" },
];

const fmt = (s: string | null) =>
  s
    ? new Date(s).toLocaleString("en-GB", { timeZone: "Asia/Kuala_Lumpur", dateStyle: "medium", timeStyle: "short" })
    : "Not yet";

function WatchlistPage() {
  const qc = useQueryClient();
  const [url, setUrl] = useState("");
  const [label, setLabel] = useState("");
  const [caseId, setCaseId] = useState("");
  const [interval, setInterval] = useState(60);

  const cases = useQuery({
    queryKey: ["watch-cases"],
    queryFn: async () => {
      const { data, error } = await supabase.from("cases").select("id").order("id", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const targets = useQuery({
    queryKey: ["watch-targets"],
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("watch_targets")
        .select("*, watch_seen(id, baseline, job_id)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const add = useMutation({
    mutationFn: async () => {
      const u = url.trim();
      if (!/^https:\/\/(www\.|m\.)?(facebook|instagram)\.com\//i.test(u))
        throw new Error("Enter a facebook.com or instagram.com page or profile link");
      if (!caseId) throw new Error("Choose the case new posts should be filed in");
      const { data: user } = await supabase.auth.getUser();
      const { error } = await supabase.from("watch_targets").insert({
        url: u,
        label: label.trim() || null,
        case_id: caseId,
        interval_minutes: interval,
        platform: /instagram\.com/i.test(u) ? "instagram" : "facebook",
        created_by: user.user?.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setUrl("");
      setLabel("");
      toast.success("Page added. The first check records what's already there.");
      qc.invalidateQueries({ queryKey: ["watch-targets"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const update = useMutation({
    mutationFn: async (p: { id: string; patch: { active?: boolean; interval_minutes?: number } }) => {
      const { error } = await supabase.from("watch_targets").update(p.patch).eq("id", p.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["watch-targets"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("watch_targets").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["watch-targets"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 md:p-8">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">Watched pages</h1>
        <p className="text-sm text-muted-foreground">
          The Mac mini opens each page on schedule with your logged-in browser. Any post it hasn't seen
          before is captured automatically, filed in the chosen case under a new incident.
        </p>
      </header>

      <section className="space-y-3 rounded-lg border bg-card p-4">
        <h2 className="font-medium">Add a page</h2>
        <Input className="h-12" placeholder="https://www.facebook.com/pagename" value={url} onChange={(e) => setUrl(e.target.value)} />
        <Input className="h-12" placeholder="Name (optional)" value={label} onChange={(e) => setLabel(e.target.value)} />
        <div className="grid gap-3 sm:grid-cols-2">
          <select className="h-12 rounded-md border bg-background px-3" value={caseId} onChange={(e) => setCaseId(e.target.value)}>
            <option value="">File new posts in case…</option>
            {cases.data?.map((c) => (
              <option key={c.id} value={c.id}>CASE-{c.id}</option>
            ))}
          </select>
          <select className="h-12 rounded-md border bg-background px-3" value={interval} onChange={(e) => setInterval(Number(e.target.value))}>
            {INTERVALS.map((i) => (
              <option key={i.v} value={i.v}>{i.l}</option>
            ))}
          </select>
        </div>
        <Button className="h-12 w-full sm:w-auto" onClick={() => add.mutate()} disabled={add.isPending}>
          Start watching
        </Button>
      </section>

      <section className="space-y-3">
        {targets.data?.length === 0 && <p className="text-sm text-muted-foreground">No pages watched yet.</p>}
        {targets.data?.map((t) => {
          const seen = t.watch_seen ?? [];
          const captured = seen.filter((s) => s.job_id).length;
          return (
            <div key={t.id} className="space-y-3 rounded-lg border bg-card p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-medium">{t.label || t.url}</div>
                  <a href={t.url} target="_blank" rel="noreferrer" className="break-all text-xs text-muted-foreground underline">{t.url}</a>
                </div>
                <span className={`rounded-full px-2 py-1 text-xs ${t.active ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"}`}>
                  {t.active ? "Watching" : "Paused"}
                </span>
              </div>
              <div className="grid gap-2 text-sm sm:grid-cols-4">
                <div><div className="text-xs text-muted-foreground">Case</div>
                  <Link to="/cases/$caseId" params={{ caseId: t.case_id }} className="underline">CASE-{t.case_id}</Link></div>
                <div><div className="text-xs text-muted-foreground">Last checked</div>{fmt(t.last_checked_at)}</div>
                <div><div className="text-xs text-muted-foreground">Posts known</div>{seen.length}</div>
                <div><div className="text-xs text-muted-foreground">Auto-captured</div>{captured}</div>
              </div>
              {t.last_error && <p className="text-sm text-destructive">Last check failed: {t.last_error}</p>}
              <div className="flex flex-wrap gap-2">
                <select className="h-11 rounded-md border bg-background px-3 text-sm" value={t.interval_minutes}
                  onChange={(e) => update.mutate({ id: t.id, patch: { interval_minutes: Number(e.target.value) } })}>
                  {INTERVALS.map((i) => (<option key={i.v} value={i.v}>{i.l}</option>))}
                </select>
                <Button variant="outline" className="h-11" onClick={() => update.mutate({ id: t.id, patch: { active: !t.active } })}>
                  {t.active ? "Pause" : "Resume"}
                </Button>
                <Button variant="outline" className="h-11" onClick={() => { if (confirm("Stop watching this page? Captured evidence stays.")) remove.mutate(t.id); }}>
                  Remove
                </Button>
              </div>
            </div>
          );
        })}
      </section>
    </div>
  );
}
