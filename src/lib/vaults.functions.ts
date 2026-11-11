import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { cloudChecks, cloudConfigState, type CloudRoute } from '@/lib/vault-config';

async function cloudState(supabase: any) {
  const { data, error } = await supabase.from('vault_config').select('route').eq('vault', 'cloud').single();
  if (error) throw new Error(error.message);
  return cloudConfigState(data.route as CloudRoute, process.env as Record<string, string | undefined>);
}

/** Which Cloud Vault secrets are set (names only). Staff only: vault_status refuses anyone else. */
export const getCloudVaultConfig = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const gate = await context.supabase.rpc('vault_status');
    if (gate.error) throw new Error(gate.error.message);
    return cloudState(context.supabase);
  });

/**
 * Test connection. Home: calls the DarkNight receiver's /health (HTTPS only, no redirects).
 * Cloud: reports Not configured or configured but not attempted. Recorded in the append-only vault log.
 */
export const testVaultConnection = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ vault: z.enum(['home', 'cloud']) }).parse(input))
  .handler(async ({ data, context }) => {
    const gate = await context.supabase.rpc('vault_status');
    if (gate.error) throw new Error(gate.error.message);
    const status = gate.data as { home_online: boolean; window_minutes: number };
    let outcome: 'ok' | 'failed' | 'not_configured' | 'not_attempted';
    let detail: Record<string, unknown>;
    if (data.vault === 'cloud') {
      const s = await cloudState(context.supabase);
      outcome = s.configured ? 'not_attempted' : 'not_configured';
      detail = { route: s.route, missing: s.missing, checks: cloudChecks(s) };
    } else {
      const route = await context.supabase.from('darknight_route').select('gateway_url').limit(1).maybeSingle();
      const gw = route.data?.gateway_url ?? null;
      let gateway: 'not_configured' | 'online' | 'unreachable' = 'not_configured';
      if (gw) {
        try {
          const u = new URL(gw);
          if (u.protocol !== 'https:') throw new Error('not https');
          const r = await fetch(`${u.href.replace(/\/$/, '')}/health`, { redirect: 'error', signal: AbortSignal.timeout(8000) });
          const j = (await r.json().catch(() => ({}))) as { status?: string };
          gateway = r.ok && j.status === 'online' ? 'online' : 'unreachable';
        } catch { gateway = 'unreachable'; }
      }
      outcome = gateway === 'not_configured' ? 'not_configured' : gateway === 'online' ? 'ok' : 'failed';
      detail = { gateway, gateway_url: gw, online: status.home_online, window_minutes: status.window_minutes };
    }
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const rec = await supabaseAdmin.rpc('vault_record_check', { _vault: data.vault, _outcome: outcome, _detail: detail as never, _actor: context.userId });
    if (rec.error) throw new Error(rec.error.message);
    await context.supabase.rpc('vault_apply_offline');
    return { outcome, detail: JSON.parse(JSON.stringify(detail)) as { missing?: string[] } };
  });
