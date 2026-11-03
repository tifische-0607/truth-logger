import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { portalIdentity, type PortalIdentity } from '@/lib/portal-access';

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ context }) => {
    // Offline mode: when the device has no connection, getUser() cannot reach the
    // auth server. Fall back to the session already stored on this device so a
    // downloaded case stays readable; the server still validates every request.
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      const { data: local } = await supabase.auth.getSession();
      if (local.session?.user) {
        const identity = context.queryClient.getQueryData<PortalIdentity>(['staff-identity',local.session.user.id]);
        if(identity?.kind === 'staff') return { user: local.session.user };
      }
      throw redirect({ to: "/auth" });
    }
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      throw redirect({ to: "/auth" });
    }
    const identity = await portalIdentity();
    if(identity.kind === 'client') throw redirect({to:'/portal'});
    if(identity.kind !== 'staff') throw redirect({to:'/auth'});
    context.queryClient.setQueryData(['staff-identity',data.user.id],identity);
    return { user: data.user };
  },
  component: () => (
    <AppShell>
      <Outlet />
    </AppShell>
  ),
});
