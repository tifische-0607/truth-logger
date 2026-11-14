import { Database, HardDrive, HeartPulse } from 'lucide-react';

/** Client database assignments and measurements are not yet provisioned.
 * Never present shared-cloud reachability or storage totals as client database health/size.
 */
export function ClientDatabaseDetails() {
  return (
    <dl aria-label="Client database details" className="flex min-w-0 flex-wrap items-start gap-x-6 gap-y-2 text-sm">
      <div className="min-w-0">
        <dt className="text-muted-foreground flex items-center gap-1.5 text-xs"><Database className="size-3.5" aria-hidden />Database</dt>
        <dd className="mt-1 break-words font-medium" title="No database or client schema has been assigned yet">Not configured</dd>
      </div>
      <div>
        <dt className="text-muted-foreground flex items-center gap-1.5 text-xs"><HardDrive className="size-3.5" aria-hidden />Size</dt>
        <dd className="text-muted-foreground mt-1">Unavailable</dd>
      </div>
      <div>
        <dt className="text-muted-foreground flex items-center gap-1.5 text-xs"><HeartPulse className="size-3.5" aria-hidden />Health</dt>
        <dd className="text-muted-foreground mt-1">Not checked</dd>
      </div>
    </dl>
  );
}