import { createFileRoute, Link } from '@tanstack/react-router';
import { PageHeader } from '@/components/AppShell';
import { useClientsAndProjects } from '@/lib/projects';
import { hubHead } from '@/lib/hub';
import { Chip } from '@/components/engagement/ui';
export const Route=createFileRoute('/_authenticated/management')({head:()=>hubHead('Management overview','Read-only FA Management portfolio overview.'),component:Management});
function Management(){const rows=useClientsAndProjects();return <><PageHeader title="Management overview" subtitle="Read-only portfolio"/><div className="border-y py-5 flex gap-12"><div><p className="text-sm text-muted-foreground">Clients</p><p className="text-2xl font-bold">{rows.data?.clients.length??0}</p></div><div><p className="text-sm text-muted-foreground">Engagements</p><p className="text-2xl font-bold">{rows.data?.projects.length??0}</p></div></div><div className="divide-y">{rows.data?.projects.map(p=><Link key={p.id} to="/projects/$projectId" params={{projectId:p.id}} className="flex flex-wrap justify-between gap-3 py-4 min-h-16"><span>{p.code} · {p.name}</span><Chip>{p.status}</Chip></Link>)}</div><p className="text-sm text-muted-foreground mt-6">SOPs and turnaround clocks follow in the Management stage.</p></>;}
