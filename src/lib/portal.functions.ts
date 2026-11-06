import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { canonicalSiteUrl, siteLink } from './site-config';

export const getSiteConfig = createServerFn({ method: 'GET' }).handler(async () => ({ siteUrl: canonicalSiteUrl(process.env['SITE_URL']) }));

export const createClientInvite = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ clientId: z.string().uuid(), name: z.string().trim().min(1), email: z.string().email(), existingId: z.string().uuid().optional(), role: z.enum(['client_admin', 'client_user']).default('client_admin') }).parse(input))
  .handler(async ({ data, context }) => {
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    const token = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
    const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))), b => b.toString(16).padStart(2, '0')).join('');
    const { error } = await context.supabase.rpc('portal_invite_member', { r: data.role, c: data.clientId, n: data.name, e: data.email.toLowerCase(), h: hash, expires: new Date(Date.now() + 7 * 86400000).toISOString(), ...(data.existingId ? {existing: data.existingId} : {}) });
    if (error) throw new Error(error.message);
    return { link: siteLink(canonicalSiteUrl(process.env['SITE_URL']), `/invite?token=${token}`) };
  });

export const getInviteInfo = createServerFn({ method: 'POST' })
  .inputValidator((input) => z.object({ token: z.string().regex(/^[a-f0-9]{64}$/) }).parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(data.token))), b => b.toString(16).padStart(2, '0')).join('');
    const { data: info, error } = await supabaseAdmin.rpc('portal_invitation_info', { h: hash });
    if (error) throw new Error(error.message);
    if (info) return info as unknown as { client_name: string; name: string; email: string; existing_account: boolean; kind?: string };
    const member = await supabaseAdmin.rpc('member_invitation_info', { h: hash });
    if (member.error) throw new Error(member.error.message);
    if (!member.data) throw new Error('This invitation is invalid, expired or already used.');
    return member.data as unknown as { client_name: string; name: string; email: string; existing_account: boolean; kind?: string };
  });

export const acceptNewClientInvite = createServerFn({ method: 'POST' })
  .inputValidator((input) => z.object({ token: z.string().regex(/^[a-f0-9]{64}$/), password: z.string().min(12).max(128) }).parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(data.token))), b => b.toString(16).padStart(2, '0')).join('');
    const info = await supabaseAdmin.rpc('portal_invitation_info', { h: hash });
    if (info.error) throw new Error(info.error.message);
    const details = info.data as unknown as { email: string; name: string; existing_account: boolean } | null;
    if (!details) {
      // Member invitation (no client organisation, no seat).
      const m = await supabaseAdmin.rpc('member_invitation_info', { h: hash });
      if (m.error) throw new Error(m.error.message);
      const md = m.data as unknown as { email: string; name: string; existing_account: boolean } | null;
      if (!md) throw new Error('This invitation is invalid, expired or already used.');
      if (md.existing_account) throw new Error('This email already has a FA Portal login. Ask FridayAnalytics for help.');
      const mc = await supabaseAdmin.rpc('member_claim_invitation', { h: hash });
      if (mc.error) throw new Error(mc.error.message);
      const mclaimed = mc.data as unknown as { id: string };
      const mu = await supabaseAdmin.auth.admin.createUser({ email: md.email, password: data.password, email_confirm: true, user_metadata: { display_name: md.name } });
      if (mu.error || !mu.data.user) throw new Error(mu.error?.message ?? 'Account creation failed. Request a new invitation.');
      const ma = await supabaseAdmin.rpc('member_activate_invitation', { rid: mclaimed.id, uid: mu.data.user.id });
      if (ma.error) throw new Error(ma.error.message);
      return { email: md.email };
    }
    if (details.existing_account) throw new Error('Sign in to your existing account to accept this invitation.');
    // Consuming the token is atomic and happens before any privileged account operation.
    const claim = await supabaseAdmin.rpc('portal_claim_invitation', { h: hash });
    if (claim.error) throw new Error(claim.error.message);
    const claimed = claim.data as unknown as { id: string };
    // Possession of the single-use invitation confirms this invited address, not global signup.
    const created = await supabaseAdmin.auth.admin.createUser({ email: details.email, password: data.password, email_confirm: true, user_metadata: { display_name: details.name } });
    if (created.error || !created.data.user) throw new Error(created.error?.message ?? 'Account creation failed. Request a new invitation.');
    const activated = await supabaseAdmin.rpc('portal_activate_invitation', { rid: claimed.id, uid: created.data.user.id });
    if (activated.error) throw new Error(activated.error.message);
    return { email: details.email };
  });

export const acceptExistingClientInvite = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ token: z.string().regex(/^[a-f0-9]{64}$/) }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: staff, error: staffError } = await context.supabase.rpc('portal_is_staff', { u: context.userId });
    if (staffError) throw new Error(staffError.message);
    if (staff) throw new Error('A client administrator cannot have a staff role or engagement membership.');
    const { data: user, error: userError } = await context.supabase.auth.getUser();
    if (userError || !user.user) throw new Error('Sign in to continue.');
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(data.token))), b => b.toString(16).padStart(2, '0')).join('');
    const info = await supabaseAdmin.rpc('portal_invitation_info', { h: hash });
    if (info.error) throw new Error(info.error.message);
    const details = info.data as unknown as { email: string } | null;
    if (!details || details.email !== user.user.email?.toLowerCase()) throw new Error('Sign in with the email address on this invitation.');
    const claim = await supabaseAdmin.rpc('portal_claim_invitation', { h: hash });
    if (claim.error) throw new Error(claim.error.message);
    const claimed = claim.data as unknown as { id: string };
    const activated = await supabaseAdmin.rpc('portal_activate_invitation', { rid: claimed.id, uid: context.userId });
    if (activated.error) throw new Error(activated.error.message);
    return { ok: true };
  });