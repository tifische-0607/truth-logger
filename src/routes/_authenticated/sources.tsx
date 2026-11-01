import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Cloud, House, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { PageHeader, useWorkerStatus } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { checkGateway, useDarkNight } from "@/lib/darknight";
import { DARKNIGHT_SOURCE_ID } from "@/lib/sources";
import { formatDateTime, timeAgo } from "@/lib/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/sources")({
  head: () => ({ meta: [{ title: "Sources — Evidence Hub" }] }),
  component: SourcesPage,
});

function useIsOwner() {
  return useQuery({
    queryKey: ["me", "is-owner"],
    queryFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid) return false;
      const { data } = await supabase.from("user_roles").select("role").eq("user_id", uid);
      return (data ?? []).some((r) => r.role === "owner");
    },
  });
}

function SourcesPage() {
  const worker = useWorkerStatus();
  const dn = useDarkNight();
  const isOwner = useIsOwner().data ?? false;
  const queryClient = useQueryClient();

  const counts = useQuery({
    queryKey: ["source-counts"],
    queryFn: async () => {
      const [artefacts, cases, refs] = await Promise.all([
        supabase.from("artefacts").select("id", { count: "exact", head: true }),
        supabase.from("cases").select("id", { count: "exact", head: true }),
        supabase.from("evidence_refs").select("case_id"),
      ]);
      const refCases = new Set((refs.data ?? []).map((r) => r.case_id));
      return {
        artefacts: artefacts.count ?? 0,
        cases: cases.count ?? 0,
        refs: refs.data?.length ?? 0,
        refCases: refCases.size,
      };
    },
  });

  const [url, setUrl] = useState("");
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    if (dn.source) {
      setUrl(dn.source.gateway_url ?? "");
      setEnabled(dn.source.enabled);
    }
  }, [dn.source]);

  const save = useMutation({
    mutationFn: async () => {
      const clean = url.trim().replace(/\/+$/, "");
      if (clean && !/^https:\/\/[^\s/]+(:\d+)?$/.test(clean)) {
        throw new Error(
          "Use the gateway's https address, e.g. https://mac-studio.tail1234.ts.net:8443",
        );
      }
      const { error } = await supabase
        .from("sources")
        .update({ gateway_url: clean || null, enabled: enabled && !!clean })
        .eq("id", DARKNIGHT_SOURCE_ID);
      if (error) throw error;
      return clean ? checkGateway(clean) : null;
    },
    onSuccess: (health) => {
      void queryClient.invalidateQueries({ queryKey: ["sources"] });
      if (!health) toast.success("DarkNight disconnected");
      else if (health.state === "online") toast.success("Saved. DarkNight answered.");
      else
        toast.warning("Saved, but DarkNight didn't answer from this device. Is it on Tailscale?");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Save failed"),
  });

  const dnStatus =
    dn.state === "online"
      ? { word: "Online", cls: "bg-done text-done-foreground" }
      : dn.state === "degraded"
        ? { word: "Partly reachable", cls: "bg-warn text-warn-foreground" }
        : dn.state === "offline"
          ? { word: "Offline", cls: "bg-failed text-failed-foreground" }
          : { word: "Not connected", cls: "bg-queued text-queued-foreground" };

  const setupSteps = [
    { done: !!dn.source?.gateway_url, label: "Gateway address saved below" },
    {
      done: dn.health?.checks?.database === true,
      label: "Gateway reaches DarkNight with its read-only user",
    },
    { done: dn.health?.checks?.nas === true, label: "Gateway sees the NAS evidence share" },
    { done: dn.state === "online", label: "This device reaches the gateway over Tailscale" },
  ];

  return (
    <>
      <PageHeader title="Sources" subtitle="Where evidence comes from, and where it is kept." />

      <div className="grid items-start gap-6 xl:grid-cols-2">
        <section className="panel space-y-4 p-6" aria-labelledby="cloud-h">
          <div className="flex items-center gap-4">
            <div className="bg-cloud text-cloud-foreground flex size-11 shrink-0 items-center justify-center rounded-xl">
              <Cloud className="size-6" aria-hidden />
            </div>
            <div className="min-w-0 flex-1">
              <h2 id="cloud-h" className="text-lg font-semibold">
                Mac mini captures
              </h2>
              <p className="text-muted-foreground text-sm">
                Cloud vault · Facebook posts, comments, reels, live streams
              </p>
            </div>
            <span
              className={cn(
                "rounded-full px-3 py-1 text-xs font-semibold",
                worker.online ? "bg-done text-done-foreground" : "bg-failed text-failed-foreground",
              )}
            >
              {worker.online ? "Online" : "Offline"}
            </span>
          </div>
          <dl className="grid grid-cols-[minmax(0,9rem)_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm">
            <dt className="text-muted-foreground">Stored in</dt>
            <dd>Private cloud storage, short-lived signed links only</dd>
            <dt className="text-muted-foreground">Collected by</dt>
            <dd>Capture worker on the Mac mini</dd>
            <dt className="text-muted-foreground">Last check-in</dt>
            <dd>
              {timeAgo(worker.lastSeen)}
              {worker.lastSeen ? ` (${formatDateTime(worker.lastSeen)})` : ""}
            </dd>
            <dt className="text-muted-foreground">Holds</dt>
            <dd>
              {counts.data
                ? `${counts.data.artefacts.toLocaleString()} files across ${counts.data.cases} cases`
                : "—"}
            </dd>
            <dt className="text-muted-foreground">Hash checks</dt>
            <dd>Re-hashed by the server on upload, verify and export</dd>
          </dl>
          <div className="flex flex-wrap gap-2">
            <Link
              to="/collect"
              className="border-input hover:bg-accent inline-flex min-h-11 items-center rounded-lg border px-4 text-sm font-medium"
            >
              Open Collect
            </Link>
            <Link
              to="/worker"
              className="border-input hover:bg-accent inline-flex min-h-11 items-center rounded-lg border px-4 text-sm font-medium"
            >
              Worker diagnostics
            </Link>
          </div>
        </section>

        <section className="panel border-home-foreground/30 space-y-4 p-6" aria-labelledby="dn-h">
          <div className="flex items-center gap-4">
            <div className="bg-home text-home-foreground flex size-11 shrink-0 items-center justify-center rounded-xl">
              <House className="size-6" aria-hidden />
            </div>
            <div className="min-w-0 flex-1">
              <h2 id="dn-h" className="text-lg font-semibold">
                DarkNight
              </h2>
              <p className="text-muted-foreground text-sm">
                Home vault · database on the Mac Studio, evidence files on the NAS
              </p>
            </div>
            <span className={cn("rounded-full px-3 py-1 text-xs font-semibold", dnStatus.cls)}>
              {dnStatus.word}
            </span>
          </div>
          <dl className="grid grid-cols-[minmax(0,9rem)_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm">
            <dt className="text-muted-foreground">Stored in</dt>
            <dd>At home only; never copied to the cloud</dd>
            <dt className="text-muted-foreground">Read by</dt>
            <dd>This device, live, through the gateway over Tailscale</dd>
            <dt className="text-muted-foreground">Cloud keeps</dt>
            <dd>A reference and SHA-256 per file, for linked items only</dd>
            <dt className="text-muted-foreground">Linked so far</dt>
            <dd>
              {counts.data
                ? `${counts.data.refs} ${counts.data.refs === 1 ? "item" : "items"} in ${counts.data.refCases} ${counts.data.refCases === 1 ? "case" : "cases"}`
                : "—"}
            </dd>
            {dn.health?.version ? (
              <>
                <dt className="text-muted-foreground">Gateway</dt>
                <dd className="font-mono text-xs">
                  {dn.health.version} · checked {timeAgo(dn.health.checkedAt)}
                </dd>
              </>
            ) : null}
          </dl>

          <div className="bg-home/40 space-y-2 rounded-xl p-4">
            <div className="text-home-foreground text-xs font-semibold tracking-wider uppercase">
              Connection checklist
            </div>
            <ul className="space-y-1.5 text-sm">
              {setupSteps.map((step) => (
                <li key={step.label} className="flex items-start gap-2">
                  <span
                    aria-hidden
                    className={cn(
                      "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md border-2 text-[11px] font-bold",
                      step.done
                        ? "bg-done-foreground border-done-foreground text-white"
                        : "border-home-foreground/60",
                    )}
                  >
                    {step.done ? "✓" : ""}
                  </span>
                  <span>
                    <span className="sr-only">{step.done ? "Done: " : "To do: "}</span>
                    {step.label}
                  </span>
                </li>
              ))}
            </ul>
            <p className="text-muted-foreground text-xs">
              Setup steps for the Mac Studio are in gateway/README.md in the repository.
            </p>
          </div>

          {isOwner ? (
            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                save.mutate();
              }}
            >
              <div className="space-y-2">
                <Label htmlFor="gw-url">Gateway address</Label>
                <Input
                  id="gw-url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://mac-studio.tail1234.ts.net:8443"
                  className="h-12 font-mono text-sm"
                  inputMode="url"
                  autoCapitalize="off"
                  autoCorrect="off"
                />
              </div>
              <div className="flex items-center gap-3">
                <Switch id="gw-enabled" checked={enabled} onCheckedChange={setEnabled} />
                <Label htmlFor="gw-enabled">Read from DarkNight</Label>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="submit" className="min-h-11" disabled={save.isPending}>
                  {save.isPending ? <Loader2 className="size-4 animate-spin" /> : null} Save and
                  test
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-11"
                  onClick={() => void dn.recheck()}
                >
                  Test again
                </Button>
              </div>
            </form>
          ) : (
            <p className="text-muted-foreground text-sm">
              Only the workspace owner can change this connection.
            </p>
          )}
        </section>
      </div>

      <section className="mt-8 space-y-3" aria-labelledby="next-h">
        <h2 id="next-h" className="font-semibold">
          Possible next sources
        </h2>
        <div className="grid gap-4 md:grid-cols-3">
          {[
            ["HSDB", "Handles and findings from the OSINT methodology · home vault"],
            [
              "Instagram, TikTok, YouTube captures",
              "New capture modes on the worker · cloud vault",
            ],
            ["Manual upload", "Files from complainants, hashed on arrival · cloud vault"],
          ].map(([title, body]) => (
            <div key={title} className="border-border rounded-xl border border-dashed p-4">
              <div className="text-sm font-semibold">{title}</div>
              <div className="text-muted-foreground text-sm">{body}</div>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
