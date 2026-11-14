import { createFileRoute, Link } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Building2, Search } from 'lucide-react';
import { PageHeader } from '@/components/AppShell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { NewClientDialog } from '@/components/projects/ClientProjectDialogs';
import { EditClientDetails } from '@/components/projects/EditClientDetails';
import { ClientDatabaseDetails } from '@/components/projects/ClientDatabaseDetails';
import { accessMenuQuery } from '@/lib/access-levels';
import { clientAdminQuery } from '@/lib/client-administration';
import { loadTiers, loadSettings, formatPrice, PERIOD_LABEL, errText } from '@/lib/billing';
import { hubHead } from '@/lib/hub';

export const Route = createFileRoute('/_authenticated/client-admin')({ head: () => hubHead('Client administration', 'Client organisations, membership plans and database references in FA Portal.'), component: ClientAdministration });

function ClientAdministration() {
  const access = useQuery(accessMenuQuery);
  const clients = useQuery(clientAdminQuery);
  const tiers = useQuery({ queryKey: ['billing-tiers'], queryFn: loadTiers });
  const settings = useQuery({ queryKey: ['billing-settings'], queryFn: loadSettings });
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [newClient, setNewClient] = useState(false);
  const superadmin = access.data?.level === 'superadmin' && access.data.status === 'active';
  const rows = (clients.data ?? []).filter(c => `${c.name} ${c.code} ${c.contact_email ?? ''}`.toLowerCase().includes(search.toLowerCase()) && (status === 'all' || c.status === status));
  const error = clients.error ?? tiers.error ?? settings.error;
  return <>
    <PageHeader title="Client administration" subtitle={`${clients.data?.length ?? '—'} clients`} actions={superadmin ? <Button onClick={() => setNewClient(true)}><Building2 className="size-4" />New client</Button> : undefined} />
    <div className="mb-6 flex flex-wrap gap-3"><div className="relative min-w-0 flex-1"><Search className="absolute left-3 top-3 size-5 text-muted-foreground" /><Input aria-label="Search clients" className="min-h-11 pl-10" placeholder="Search clients" value={search} onChange={e => setSearch(e.target.value)} /></div><Select value={status} onValueChange={setStatus}><SelectTrigger className="min-h-11 w-40" aria-label="Client status"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All statuses</SelectItem><SelectItem value="active">Active</SelectItem><SelectItem value="archived">Archived</SelectItem></SelectContent></Select></div>
    {error ? <p role="alert" className="text-failed-foreground">{errText(error)}</p> : null}
    {clients.isLoading ? <p role="status">Loading clients…</p> : null}
    <div className="space-y-4">{rows.map(client => {
      const tier = tiers.data?.find(t => t.id === client.tier_id);
      return <article key={client.id} className="panel p-5">
        <div className="flex items-start justify-between gap-3"><div className="min-w-0"><Link to="/clients/$clientId" params={{ clientId: client.id }} className="font-semibold hover:underline break-words">{client.name}</Link><p className="text-sm text-muted-foreground break-words">{client.code} · {client.status === 'active' ? 'Active' : 'Archived'}</p></div>{superadmin ? <EditClientDetails client={client} /> : null}</div>
        <div className="mt-4 grid gap-5 lg:grid-cols-3"><div><p className="text-xs text-muted-foreground">Membership plan</p><p className="font-semibold">{tier?.name ?? (client.tier_id ? 'Plan unavailable' : 'No plan assigned')}</p>{tier && settings.data ? <p className="text-sm text-muted-foreground">{formatPrice(tier.price, settings.data.currency)}{tier.price !== null ? ` · ${PERIOD_LABEL[settings.data.billing_period]}` : ''}</p> : null}<p className="mt-1 text-sm">{client.seats_used} seats used{tier ? ` / ${tier.seat_limit ?? 'Unlimited'}` : ''}</p></div><div className="min-w-0"><p className="text-xs text-muted-foreground">Contact</p><p className="text-sm break-words">{client.contact_name || 'Not set'}</p><p className="text-sm text-muted-foreground break-all">{client.contact_email || 'No contact email'}</p></div><ClientDatabaseDetails client={client} /></div>
      </article>;
    })}</div>
    {!clients.isLoading && !error && !rows.length ? <p className="py-8 text-muted-foreground">No clients found.</p> : null}
    <NewClientDialog open={newClient} onOpenChange={setNewClient} />
  </>;
}