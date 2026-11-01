import { Cloud, House } from "lucide-react";

import { cn } from "@/lib/utils";
import type { GatewayState } from "@/lib/darknight";

const STATE_WORD: Partial<Record<GatewayState, string>> = {
  offline: "offline",
  degraded: "partly reachable",
  not_configured: "not connected",
};

/** Which vault an item lives in. Always an icon plus words, never colour alone. */
export function SourceBadge({
  vault,
  state,
  label,
  className,
}: {
  vault: "cloud" | "home";
  state?: GatewayState | undefined;
  label?: string | undefined;
  className?: string | undefined;
}) {
  const home = vault === "home";
  const suffix = home && state ? STATE_WORD[state] : undefined;
  return (
    <span
      className={cn(
        "inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-xs font-semibold whitespace-nowrap",
        home ? "bg-home text-home-foreground" : "bg-cloud text-cloud-foreground",
        className,
      )}
    >
      {home ? (
        <House className="size-3.5" aria-hidden />
      ) : (
        <Cloud className="size-3.5" aria-hidden />
      )}
      {label ?? (home ? "Home vault" : "Cloud vault")}
      {suffix ? ` · ${suffix}` : ""}
    </span>
  );
}
