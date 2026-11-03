import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Circle, CircleAlert } from "lucide-react";
import { useState, type ReactNode } from "react";

import { Chip } from "@/components/engagement/ui";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { errText, planStatus, useVaultStatus, type ResearchPlan } from "@/lib/research";
import { formatDateTime } from "@/lib/format";

export function PlanChip({ status }: { status: string }) {
  const s = planStatus(status);
  return (
    <Chip tone={s.tone}>
      <span aria-hidden className="size-1.5 rounded-full bg-current" />
      {s.label}
    </Chip>
  );
}

export function Check({ ok, children, pending }: { ok: boolean; children: ReactNode; pending?: boolean }) {
  const Icon = ok ? CheckCircle2 : pending ? Circle : CircleAlert;
  return (
    <li className="flex min-h-11 items-center gap-2 text-sm">
      <Icon className={ok ? "text-positive size-5 shrink-0" : "text-muted-foreground size-5 shrink-0"} aria-hidden />
      <span className="font-semibold">{ok ? "Done" : pending ? "Waiting" : "Not yet"}</span>
      <span className="text-muted-foreground">·</span>
      <span>{children}</span>
    </li>
  );
}

/** Inline alert carrying the database's own refusal text. */
export function Refusal({ text }: { text: string | null }) {
  if (!text) return null;
  return (
    <p role="alert" className="bg-failed/10 text-foreground border-failed rounded-lg border-l-4 px-4 py-3 text-sm">
      <span className="font-semibold">Refused: </span>
      {text}
    </p>
  );
}

export function VaultPanel() {
  const v = useVaultStatus();
  const online = v.data?.online ?? false;
  return (
    <div className="panel p-4" aria-live="polite">
      <p className="kicker">Home vault</p>
      <p className="mt-1 flex items-center gap-2 font-semibold">
        <span aria-hidden className={online ? "bg-positive size-2.5 rounded-full" : "bg-destructive size-2.5 rounded-full"} />
        {v.isLoading ? "Checking…" : online ? "Online" : "Offline"}
      </p>
      <p className="text-muted-foreground mt-1 text-xs">
        Online means the collection device reported in within the last {v.data?.windowMinutes ?? 15} minutes.
        {v.data?.last ? ` Last report ${formatDateTime(v.data.last.reported_at)}.` : " No report yet."}
      </p>
    </div>
  );
}

/** Pause, resume and stop. No optimistic update: the screen changes only after the database accepts. */
export function PlanControls({ plan, can }: { plan: ResearchPlan; can: boolean }) {
  const qc = useQueryClient();
  const [stopOpen, setStopOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const act = useMutation({
    mutationFn: async (v: { status: string; reason?: string }) => {
      const { error } = await supabase.rpc("research_set_status", {
        _plan: plan.id,
        _status: v.status,
        _reason: v.reason ?? "",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setErr(null);
      setStopOpen(false);
      setReason("");
      void qc.invalidateQueries({ queryKey: ["research"] });
    },
    onError: (e) => setErr(errText(e)),
  });
  if (!["queued", "running", "paused", "locked"].includes(plan.status)) return null;
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {plan.status === "paused" ? (
          <Button className="min-h-11" disabled={!can || act.isPending} onClick={() => act.mutate({ status: "running" })}>
            Resume
          </Button>
        ) : (
          <Button variant="outline" className="min-h-11" disabled={!can || act.isPending} onClick={() => act.mutate({ status: "paused" })}>
            Pause
          </Button>
        )}
        <Button variant="outline" className="min-h-11" disabled={!can || act.isPending} onClick={() => setStopOpen(true)}>
          Stop…
        </Button>
      </div>
      {!can ? (
        <p className="text-muted-foreground text-xs">Only the collection operator, engagement lead or Curator can pause, resume or stop.</p>
      ) : null}
      <Refusal text={stopOpen ? null : err} />
      <Dialog open={stopOpen} onOpenChange={setStopOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Stop research</DialogTitle>
            <DialogDescription>Stopping ends every queued job and open run for this plan. A reason is required and is logged.</DialogDescription>
          </DialogHeader>
          <label className="grid gap-1.5 text-sm font-medium">
            Reason
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} />
          </label>
          <Refusal text={err} />
          <DialogFooter>
            <Button variant="outline" className="min-h-11" onClick={() => setStopOpen(false)}>
              Cancel
            </Button>
            <Button className="min-h-11" disabled={act.isPending} onClick={() => act.mutate({ status: "stopped", reason })}>
              Stop research
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
