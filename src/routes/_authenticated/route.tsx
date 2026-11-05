import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { portalIdentity, type PortalIdentity } from '@/lib/portal-access';

const STAFF_MARKER = "fa-portal-staff-verified";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ context }) => {
    // Offline mode: when the device has no connection, getUser() cannot reach the
    // auth server. Fall back to the session already stored on this device so a
    // downloaded case stays readable; the server still validates every request.
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      const { data: local } = await supabase.auth.getSession();
      if (local.session?.user) {
        const uid = local.session.user.id;
        const identity = context.queryClient.getQueryData<PortalIdentity>(['staff-identity',uid]);
        // The query cache is memory-only; fall back to the staff marker saved on
        // this device at the last online verification (presentation only).
        let staffOnDevice = false;
        try { staffOnDevice = localStorage.getItem(STAFF_MARKER) === uid; } catch { /* ignore */ }
        if(identity?.kind === 'staff' || staffOnDevice) return { user: local.session.user };
      }
      throw redirect({ to: "/auth" });
    }
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      try { localStorage.removeItem(STAFF_MARKER); } catch { /* ignore */ }
      throw redirect({ to: "/auth" });
    }
    const identity = await portalIdentity();
    try {
      if (identity.kind === 'staff') localStorage.setItem(STAFF_MARKER, data.user.id);
      else localStorage.removeItem(STAFF_MARKER);
    } catch { /* ignore */ }
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
