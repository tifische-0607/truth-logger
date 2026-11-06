import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { CHANNEL_SECRETS } from "@/lib/early-warning";

/**
 * Which alert channels have their server settings in place (names only, never values).
 * Nothing is sent in this build: even a configured channel only reports "Configured, sending not switched on".
 */
export const getAlertChannelStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const gate = await context.supabase.rpc("ew_overview");
    if (gate.error) throw new Error(gate.error.message);
    const out: Record<string, { configured: boolean; missing: string[] }> = {};
    for (const [ch, names] of Object.entries(CHANNEL_SECRETS)) {
      const missing = names.filter((n) => !process.env[n]);
      out[ch] = { configured: missing.length === 0, missing };
    }
    return out as { email: { configured: boolean; missing: string[] }; telegram: { configured: boolean; missing: string[] } };
  });
