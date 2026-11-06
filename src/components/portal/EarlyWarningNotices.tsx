import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ShieldAlert } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { fetchHomeFile, type HomeFile } from "@/lib/library-home";
import { LEVEL_LABEL, type Level } from "@/lib/early-warning";
import { cn } from "@/lib/utils";

type Notice = { id: string; level: Level; title: string; body: string; created_at: string; has_briefing: boolean };

const SAMPLE: Notice[] = [{ id: "sample-n1", level: "warning", title: "Sample notice — not a real warning", body: "Sample: FridayAnalytics analysts confirmed a rise in calls to gather. We will hand over a short briefing in person.", created_at: "2026-11-06T03:00:00Z", has_briefing: true }];

/** Client portal: only analyst-confirmed early-warning notices (the database returns nothing else). */
export function EarlyWarningNotices({ clientId, sample }: { clientId: string; sample: boolean }) {
  const q = useQuery({
    queryKey: ["portal-ew-notices", clientId], enabled: !sample,
    queryFn: async () => { const { data, error } = await supabase.rpc("portal_ew_notices", { c: clientId }); if (error) throw error; return data as unknown as Notice[]; },
  });
  const [msg, setMsg] = useState<Record<string, string>>({});
  const notices = sample ? SAMPLE : q.data ?? [];
  if (!sample && !notices.length) return null;
  const download = async (id: string) => {
    if (sample) return setMsg({ ...msg, [id]: "Sample mode: nothing is downloaded." });
    const { data, error } = await supabase.rpc("ew_briefing_file", { _notice: id });
    if (error) return setMsg({ ...msg, [id]: error.message });
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return setMsg({ ...msg, [id]: "Sign in to download" });
    const res = await fetchHomeFile(data as unknown as HomeFile, session.access_token);
    if (!res.ok) return setMsg({ ...msg, [id]: res.message });
    const url = URL.createObjectURL(new Blob([res.bytes])); const a = document.createElement("a"); a.href = url; a.download = res.fileName; a.click(); URL.revokeObjectURL(url);
    setMsg({ ...msg, [id]: "Fetched live from DarkNight. SHA-256 re-checked and matched." });
  };
  return (
    <section aria-labelledby="ew-notices" className="panel p-5">
      <h2 id="ew-notices" className="font-display flex items-center gap-2 text-lg font-medium"><ShieldAlert className="size-5" />Early warning notices</h2>
      <ul className="mt-3 space-y-3">
        {notices.map((n) => (
          <li key={n.id} className="bg-muted rounded-lg p-3">
            <p className="flex flex-wrap items-center gap-2 font-medium">
              <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold", n.level === "urgent" ? "bg-failed text-failed-foreground" : n.level === "warning" ? "bg-warn text-warn-foreground" : "bg-secondary text-secondary-foreground")}>
                <span aria-hidden className={cn("size-2 rounded-full", n.level === "urgent" ? "bg-negative" : n.level === "warning" ? "bg-caution" : "bg-muted-foreground")} />{LEVEL_LABEL[n.level]}
              </span>
              {n.title}
            </p>
            <p className="mt-1">{n.body}</p>
            <p className="text-muted-foreground mt-1 text-sm">{new Date(n.created_at).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })} · FridayAnalytics will hand over the briefing in person.</p>
            {n.has_briefing ? <Button variant="outline" className="mt-2 min-h-11" onClick={() => download(n.id)}>Download briefing</Button> : null}
            {msg[n.id] ? <p role="status" className="mt-1 text-sm">{msg[n.id]}</p> : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
