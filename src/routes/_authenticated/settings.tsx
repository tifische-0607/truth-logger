import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { PageHeader, useWorkerStatus } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatDateTime, timeAgo } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  const worker = useWorkerStatus();
  const [handler, setHandler] = useState("");

  useEffect(() => {
    setHandler(localStorage.getItem("fbem.handler") ?? "");
  }, []);

  return (
    <>
      <PageHeader title="Settings" subtitle="Worker status and capture defaults." />

      <div className="grid gap-5 md:grid-cols-2">
        <section className="panel p-5">
          <h2 className="font-semibold">Mac mini worker</h2>
          <div className="mt-4 flex items-center gap-3">
            <span
              className={`size-3 rounded-full ${
                worker.online ? "bg-done-foreground animate-pulse" : "bg-failed-foreground"
              }`}
            />
            <span className="text-lg font-semibold">{worker.online ? "Online" : "Offline"}</span>
          </div>
          <dl className="text-muted-foreground mt-4 space-y-1 text-sm">
            <div>Last check-in: {timeAgo(worker.lastSeen)}</div>
            <div>{formatDateTime(worker.lastSeen)}</div>
            <div>Version: {worker.data?.version ?? "—"}</div>
            <div>Host: {worker.data?.hostname ?? "—"}</div>
          </dl>
          <p className="text-muted-foreground mt-4 text-xs">
            The worker authenticates with the WORKER_TOKEN secret and posts to
            <span className="hash"> /api/public/worker-heartbeat</span> every minute.
          </p>
        </section>

        <section className="panel p-5">
          <h2 className="font-semibold">Default handler</h2>
          <p className="text-muted-foreground mt-1 text-sm">
            Pre-filled on every new capture on this device.
          </p>
          <div className="mt-4 space-y-2">
            <Label htmlFor="handler">Handler name</Label>
            <Input
              id="handler"
              value={handler}
              onChange={(e) => setHandler(e.target.value)}
              className="h-12 text-base"
            />
            <Button
              className="h-12 w-full"
              onClick={() => {
                localStorage.setItem("fbem.handler", handler);
                toast.success("Default handler saved");
              }}
            >
              Save
            </Button>
          </div>
        </section>
      </div>
    </>
  );
}
