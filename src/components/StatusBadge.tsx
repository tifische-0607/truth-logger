import { cn } from "@/lib/utils";

const dots: Record<string, string> = {
  queued: "bg-muted-foreground", running: "bg-caution animate-pulse", done: "bg-positive",
  failed: "bg-negative", open: "bg-caution", filed: "bg-positive", closed: "bg-muted-foreground",
};
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
        "chip inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide",
        styles[status] ?? styles["queued"],
        className,
      )}
    >
      <span aria-hidden="true" className={cn("size-2 rounded-full", dots[status] ?? dots["queued"])} />
      {status}
    </span>
  );
}
