import { createFileRoute } from '@tanstack/react-router';
import { PageHeader } from '@/components/AppShell';
import { AccountPanel } from '@/components/account/AccountPanel';

export const Route = createFileRoute('/_authenticated/account')({
  head: () => ({ meta: [
    { title: 'Account — FA Portal' }, { name: 'description', content: 'Your FA Portal profile, password and sessions.' },
    { property: 'og:title', content: 'Account — FA Portal' }, { property: 'og:description', content: 'Your FA Portal profile, password and sessions.' },
    { property: 'og:type', content: 'website' }, { name: 'twitter:card', content: 'summary' },
  ] }),
  component: () => <div className="space-y-6"><PageHeader kicker="Account" title="Account" subtitle="Your profile, password and sessions." /><AccountPanel /></div>,
});
