import { Link } from "@tanstack/react-router";
import { CloudOff } from "lucide-react";

import { useOnline } from "@/lib/offline";

export function OfflineBanner() {
  const online = useOnline();
  if (online) return null;
  return (
    <div className="bg-warn text-warn-foreground flex flex-wrap items-center gap-2 px-4 py-2.5 text-sm font-medium md:px-8">
      <CloudOff className="size-4 shrink-0" />
      <span>Offline — showing your downloaded copy. Nothing is saved to the case until you sync.</span>
      <Link to="/offline" className="ml-auto underline">
        Offline library
      </Link>
    </div>
  );
}
