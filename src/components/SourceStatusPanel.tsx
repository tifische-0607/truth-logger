import { Link } from "@tanstack/react-router";

import { useWorkerStatus } from "@/components/AppShell";
import { useDarkNight } from "@/lib/darknight";
import { timeAgo } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Sidebar footer: live status of every evidence source. */
export function SourceStatusPanel() {
  const worker = useWorkerStatus();
  const dn = useDarkNight();

  const dnLine =
    dn.state === "online"
      ? "Home vault · online"
      : dn.state === "degraded"
        ? "Home vault · partly reachable"
        : dn.state === "offline"
          ? "Home vault · offline"
          : "Home vault · not connected";

  return (
    <Link
      to="/sources"
      className="bg-sidebar-accent/40 border-sidebar-border hover:bg-sidebar-accent/70 block space-y-3 rounded-xl border p-3 transition-colors"
    >
      <div className="text-sidebar-foreground/60 text-[11px] font-semibold tracking-wider uppercase">
        Source status
      </div>
      <Row
        dot={worker.online ? "on" : "off"}
        title="Capture worker"
        detail={`Mac mini · ${worker.online ? "online" : "offline"} · seen ${timeAgo(worker.lastSeen)}`}
      />
      <Row
        dot={dn.state === "online" ? "on" : dn.state === "not_configured" ? "none" : "off"}
        title="DarkNight"
        detail={dnLine}
      />
    </Link>
  );
}

function Row({
  dot,
  title,
  detail,
}: {
  dot: "on" | "off" | "none";
  title: string;
  detail: string;
}) {
  return (
    <div className="flex items-start gap-2.5">
      <span
        aria-hidden
        className={cn(
          "mt-1 size-2.5 shrink-0 rounded-full",
          dot === "on" && "bg-done-foreground animate-pulse",
          dot === "off" && "bg-failed-foreground",
          dot === "none" && "border-sidebar-foreground/60 border-2",
        )}
      />
      <div className="min-w-0 leading-snug">
        <div className="text-xs font-semibold">{title}</div>
        <div className="text-sidebar-foreground/65 truncate text-[11px]">{detail}</div>
      </div>
    </div>
  );
}
