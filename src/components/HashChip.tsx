import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { shortHash } from "@/lib/format";

export function HashChip({
  value,
  full = false,
  label = "Hash",
  className,
}: {
  value?: string | null;
  full?: boolean;
  label?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  if (!value) return <span className="text-muted-foreground text-sm">—</span>;

  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          toast.success(`${label} copied`);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          toast.error("Could not copy");
        }
      }}
      className={cn(
        "hash bg-muted text-muted-foreground hover:bg-accent hover:text-accent-foreground inline-flex min-h-9 items-center gap-2 rounded-md px-2.5 py-1.5 transition-colors",
        className,
      )}
      title={value}
    >
      <span>{full ? value : shortHash(value)}</span>
      {copied ? <Check className="size-3.5 shrink-0" /> : <Copy className="size-3.5 shrink-0" />}
    </button>
  );
}
