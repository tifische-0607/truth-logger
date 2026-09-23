import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    // Offline mode: when the device has no connection, getUser() cannot reach the
    // auth server. Fall back to the session already stored on this device so a
    // downloaded case stays readable; the server still validates every request.
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      const { data: local } = await supabase.auth.getSession();
      if (local.session?.user) return { user: local.session.user };
      throw redirect({ to: "/auth" });
    }
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      const { data: local } = await supabase.auth.getSession();
      if (local.session?.user) return { user: local.session.user };
      throw redirect({ to: "/auth" });
    }
    return { user: data.user };
  },
  component: () => (
    <AppShell>
      <Outlet />
    </AppShell>
  ),
});
