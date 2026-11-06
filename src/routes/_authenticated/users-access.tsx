import { createFileRoute } from '@tanstack/react-router';
import { PageHeader } from '@/components/AppShell';
import { UsersAccess } from '@/components/account/UsersAccess';

export const Route = createFileRoute('/_authenticated/users-access')({
  head: () => ({ meta: [
    { title: 'Users and access — FA Portal' }, { name: 'description', content: 'Access levels, status and account actions for FA Portal logins.' },
    { property: 'og:title', content: 'Users and access — FA Portal' }, { property: 'og:description', content: 'Access levels, status and account actions for FA Portal logins.' },
    { property: 'og:type', content: 'website' }, { name: 'twitter:card', content: 'summary' },
  ] }),
  component: () => <div className="space-y-6"><PageHeader kicker="Users and access" title="Users and access" subtitle="Levels, job roles, clients and status. Every action is logged." /><UsersAccess /></div>,
});
