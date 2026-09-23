import { cn } from "@/lib/utils";

const styles: Record<string, string> = {
  queued: "bg-queued text-queued-foreground",
  running: "bg-running text-running-foreground",
  done: "bg-done text-done-foreground",
  failed: "bg-failed text-failed-foreground",
  open: "bg-running text-running-foreground",
  filed: "bg-done text-done-foreground",
  closed: "bg-queued text-queued-foreground",
};

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide",
        styles[status] ?? styles["queued"],
        className,
      )}
    >
      {status === "running" ? (
        <span className="size-1.5 animate-pulse rounded-full bg-current" />
      ) : null}
      {status}
    </span>
  );
}
