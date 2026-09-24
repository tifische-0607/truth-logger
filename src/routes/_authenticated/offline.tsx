import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { CloudDownload, CloudOff, RefreshCw, Trash2, Wifi } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { formatBytes, formatDateTime, timeAgo } from "@/lib/format";
import {
  flushOutbox,
  listCachedCases,
  pendingOutboxCount,
  removeCachedCase,
  syncCase,
  useOnline,
  type SyncProgress,
} from "@/lib/offline";

export const Route = createFileRoute("/_authenticated/offline")({
  head: () => ({
    meta: [
      { title: "Offline library · SpyGlass V2" },
      {
        name: "description",
        content:
          "Download cases and their artefacts to this device so evidence can be reviewed without an internet connection.",
      },
      { property: "og:title", content: "Offline library · SpyGlass V2" },
      {
        property: "og:description",
        content: "Review downloaded cases and artefacts without an internet connection.",
      },
    ],
  }),
  component: OfflinePage,
});

function OfflinePage() {
  const online = useOnline();
  const queryClient = useQueryClient();
  const [progress, setProgress] = useState<(SyncProgress & { caseId: string }) | null>(null);

  const cached = useQuery({
    queryKey: ["offline-cache"],
    queryFn: async () => listCachedCases(),
  });

  const pending = useQuery({
    queryKey: ["offline-outbox"],
    queryFn: async () => pendingOutboxCount(),
    refetchInterval: 30_000,
  });

  const cases = useQuery({
    queryKey: ["cases", "all"],
    enabled: online,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cases")
        .select("id, target_of_complaint, status, opened_on")
        .order("opened_on", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ["offline-cache"] });
    await queryClient.invalidateQueries({ queryKey: ["offline-outbox"] });
  }

  async function doSync(caseId: string) {
    if (!online) {
      toast.error("No internet connection — try again when you're back online.");
      return;
    }
    try {
      const flushed = await flushOutbox();
      const record = await syncCase(caseId, (p) => setProgress({ ...p, caseId }));
      const bad = record.artefacts.filter((a) => a.hash_state === "mismatch").length;
      toast[bad ? "error" : "success"](
        bad
          ? `Downloaded with ${bad} file(s) failing the hash check — not stored offline.`
          : `CASE-${caseId} is available offline (${record.artefacts.length} files).`,
        flushed.sent ? { description: `${flushed.sent} queued custody entries sent.` } : undefined,
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Download failed");
    } finally {
      setProgress(null);
      void refresh();
    }
  }

  async function remove(caseId: string) {
    await removeCachedCase(caseId);
    toast.success(`Offline copy of CASE-${caseId} removed from this device`);
    void refresh();
  }

  const cachedList = cached.data ?? [];
  const cachedIds = new Set(cachedList.map((c) => c.caseId));
  const notCached = (cases.data ?? []).filter((c) => !cachedIds.has(c.id));
  const totalBytes = cachedList.reduce((sum, c) => sum + c.bytes, 0);

  return (
    <>
      <PageHeader
        title="Offline library"
        subtitle="Download cases to this device so they open without internet."
        actions={
          <div
            className={`inline-flex min-h-12 items-center gap-2 rounded-lg border px-4 text-sm font-medium ${
              online ? "text-done-foreground" : "text-failed-foreground"
            }`}
          >
            {online ? <Wifi className="size-4" /> : <CloudOff className="size-4" />}
            {online ? "Online" : "Offline"}
          </div>
        }
      />

      <div className="grid gap-5 lg:grid-cols-3">
        <section className="panel space-y-3 p-5 lg:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold">On this device</h2>
            <span className="text-muted-foreground text-xs">
              {cachedList.length} case{cachedList.length === 1 ? "" : "s"} · {formatBytes(totalBytes)}
            </span>
          </div>

          {cachedList.length ? (
            <ul className="divide-border divide-y">
              {cachedList.map((c) => {
                const mismatches = c.artefacts.filter((a) => a.hash_state === "mismatch").length;
                const busy = progress?.caseId === c.caseId;
                return (
                  <li key={c.caseId} className="flex flex-wrap items-center gap-3 py-4">
                    <div className="min-w-0 flex-1">
                      <Link
                        to="/cases/$caseId"
                        params={{ caseId: c.caseId }}
                        className="font-mono text-sm font-bold underline-offset-2 hover:underline"
                      >
                        CASE-{c.caseId}
                      </Link>
                      <div className="text-muted-foreground text-xs">
                        {c.items.length} items · {c.artefacts.length} files ·{" "}
                        {formatBytes(c.bytes)} · synced {timeAgo(c.syncedAt)}
                      </div>
                      {mismatches ? (
                        <div className="text-failed-foreground text-xs font-semibold">
                          {mismatches} file(s) failed the hash check and were not stored
                        </div>
                      ) : null}
                      {busy ? (
                        <div className="text-muted-foreground mt-1 truncate text-xs">
                          Downloading {progress.done}/{progress.total} · {progress.label}
                        </div>
                      ) : null}
                    </div>
                    <Button
                      variant="secondary"
                      className="h-12"
                      disabled={busy || !online}
                      onClick={() => void doSync(c.caseId)}
                    >
                      <RefreshCw className={`size-4 ${busy ? "animate-spin" : ""}`} /> Sync
                    </Button>
                    <Button
                      variant="ghost"
                      className="text-failed-foreground h-12"
                      disabled={busy}
                      onClick={() => void remove(c.caseId)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-muted-foreground text-sm">
              Nothing downloaded yet. Pick a case below while you have internet.
            </p>
          )}
        </section>

        <section className="panel space-y-3 p-5">
          <h2 className="font-semibold">Add a case</h2>
          {!online ? (
            <p className="text-muted-foreground text-sm">
              You're offline — reconnect to download another case.
            </p>
          ) : notCached.length ? (
            <ul className="divide-border divide-y">
              {notCached.map((c) => (
                <li key={c.id} className="flex items-center gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="font-mono text-sm font-bold">CASE-{c.id}</div>
                    <div className="text-muted-foreground truncate text-xs">
                      {c.target_of_complaint ?? "No target"} · opened {formatDateTime(c.opened_on)}
                    </div>
                  </div>
                  <Button
                    className="h-12"
                    disabled={progress?.caseId === c.id}
                    onClick={() => void doSync(c.id)}
                  >
                    <CloudDownload className="size-4" />
                    {progress?.caseId === c.id ? "Downloading…" : "Download"}
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted-foreground text-sm">Every case is already on this device.</p>
          )}

          <div className="border-t pt-3">
            <div className="text-muted-foreground text-xs">
              {pending.data
                ? `${pending.data} custody entr${pending.data === 1 ? "y" : "ies"} recorded offline, waiting to be sent.`
                : "No custody entries waiting to be sent."}
            </div>
            {pending.data ? (
              <Button
                variant="secondary"
                className="mt-2 h-12 w-full"
                disabled={!online}
                onClick={async () => {
                  const res = await flushOutbox();
                  toast.success(`${res.sent} custody entr${res.sent === 1 ? "y" : "ies"} sent`);
                  void refresh();
                }}
              >
                Send now
              </Button>
            ) : null}
          </div>

          <p className="text-muted-foreground border-t pt-3 text-xs leading-relaxed">
            Offline copies are working copies held only on this device. Each file is re-hashed as it
            downloads and is rejected if the SHA-256 doesn't match the record. The evidence of record
            stays in the secure store.
          </p>
        </section>
      </div>
    </>
  );
}
