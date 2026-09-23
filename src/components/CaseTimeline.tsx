import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Camera, FileText, FolderOpen, ShieldCheck, User } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { formatDateTime } from "@/lib/format";

type Entry = {
  key: string;
  at: string;
  kind: "incident" | "snapshot" | "item" | "custody";
  title: string;
  detail: string;
  itemId?: string;
};

const KIND_META: Record<Entry["kind"], { label: string; icon: typeof Camera; className: string }> = {
  incident: { label: "Incident", icon: FolderOpen, className: "bg-primary/10 text-primary" },
  snapshot: { label: "Account snapshot", icon: User, className: "bg-secondary text-secondary-foreground" },
  item: { label: "Evidence item", icon: FileText, className: "bg-secondary text-secondary-foreground" },
  custody: { label: "Custody", icon: ShieldCheck, className: "bg-muted text-muted-foreground" },
};

export function CaseTimeline({ caseId }: { caseId: string }) {
  const timeline = useQuery({
    queryKey: ["case-timeline", caseId],
    queryFn: async (): Promise<Entry[]> => {
      const { data: incidents, error } = await supabase
        .from("incidents")
        .select(
          "id, incident_id, start_date, end_date, summary, created_at, accounts(id, handle, platform, account_snapshots(id, captured_at, followers, verified), items(id, item_code, item_type, author_name, captured_at, published_at))",
        )
        .eq("case_id", caseId);
      if (error) throw error;

      const entries: Entry[] = [];
      const itemIds: string[] = [];

      for (const inc of incidents ?? []) {
        entries.push({
          key: `inc-${inc.id}`,
          at: inc.start_date ? `${inc.start_date}T00:00:00Z` : inc.created_at,
          kind: "incident",
          title: `INC-${inc.incident_id} opened`,
          detail: inc.summary ?? (inc.end_date ? `Wave ends ${inc.end_date}` : "Incident wave recorded"),
        });
        for (const acct of inc.accounts ?? []) {
          const handle = `${acct.platform}_@${acct.handle}`;
          for (const snap of acct.account_snapshots ?? []) {
            entries.push({
              key: `snap-${snap.id}`,
              at: snap.captured_at,
              kind: "snapshot",
              title: `Snapshot of ${handle}`,
              detail: `${snap.followers ?? "—"} followers · ${snap.verified ? "verified" : "not verified"}`,
            });
          }
          for (const item of acct.items ?? []) {
            itemIds.push(item.id);
            entries.push({
              key: `item-${item.id}`,
              at: item.captured_at,
              kind: "item",
              title: `${item.item_code} captured`,
              detail: `${item.item_type} by ${item.author_name ?? "unknown"}${
                item.published_at ? ` · published ${formatDateTime(item.published_at)}` : ""
              }`,
              itemId: item.id,
            });
          }
        }
      }

      if (itemIds.length) {
        const { data: events, error: cErr } = await supabase
          .from("custody_events")
          .select("id, item_id, filename, action, handler, created_at, notes")
          .in("item_id", itemIds)
          .order("created_at", { ascending: false })
          .limit(400);
        if (cErr) throw cErr;
        for (const ev of events ?? []) {
          entries.push({
            key: `cust-${ev.id}`,
            at: ev.created_at,
            kind: "custody",
            title: `${ev.action} · ${ev.filename ?? "artefact"}`,
            detail: [ev.handler, ev.notes].filter(Boolean).join(" · ") || "Custody event",
            itemId: ev.item_id ?? undefined,
          });
        }
      }

      return entries.sort((a, b) => b.at.localeCompare(a.at));
    },
  });

  return (
    <section className="panel p-5">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="font-semibold">Case timeline</h2>
        <span className="text-muted-foreground text-xs">
          {timeline.data?.length ?? 0} events · newest first
        </span>
      </div>

      {timeline.isLoading ? (
        <p className="text-muted-foreground mt-4 text-sm">Building timeline…</p>
      ) : timeline.data?.length ? (
        <ol className="border-border mt-4 space-y-4 border-l pl-5">
          {timeline.data.map((e) => {
            const meta = KIND_META[e.kind];
            const Icon = meta.icon;
            const body = (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${meta.className}`}
                  >
                    <Icon className="size-3" />
                    {meta.label}
                  </span>
                  <span className="hash text-muted-foreground text-xs">{formatDateTime(e.at)}</span>
                </div>
                <div className="mt-1 text-sm font-medium">{e.title}</div>
                <div className="text-muted-foreground text-xs">{e.detail}</div>
              </>
            );
            return (
              <li key={e.key} className="relative">
                <span className="bg-border absolute -left-[23px] top-2 size-2.5 rounded-full" />
                {e.itemId ? (
                  <Link
                    to="/items/$itemId"
                    params={{ itemId: e.itemId }}
                    className="hover:bg-muted/60 -mx-2 block rounded-lg px-2 py-1 transition-colors"
                  >
                    {body}
                  </Link>
                ) : (
                  <div className="-mx-2 px-2 py-1">{body}</div>
                )}
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="text-muted-foreground mt-4 text-sm">Nothing recorded for this case yet.</p>
      )}
    </section>
  );
}
