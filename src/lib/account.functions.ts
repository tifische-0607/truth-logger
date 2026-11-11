import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { canonicalSiteUrl, siteLink } from './site-config';

export const EMAIL_NOT_CONFIGURED = 'Not configured: account emails are not set up yet, so no email was sent.';
/** Account emails (reset links, email-change confirmations) stay off until the ACCOUNT_EMAILS_ENABLED server setting is present. */
const emailsOn = () => !!process.env['ACCOUNT_EMAILS_ENABLED'];

export const getAccountEmailStatus = createServerFn({ method: 'GET' }).handler(async () => ({ configured: emailsOn() }));

export const sendPasswordReset = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ target: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    // The database decides whether the caller may act on this person.
    const { data: email, error } = await context.supabase.rpc('access_reset_target', { target: data.target });
    if (error) throw new Error(error.message);
    if (!emailsOn()) throw new Error(EMAIL_NOT_CONFIGURED);
    if (!email) throw new Error('This person has no email address on record.');
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const sent = await supabaseAdmin.auth.resetPasswordForEmail(String(email), { redirectTo: siteLink(canonicalSiteUrl(process.env['SITE_URL']), '/reset-password') });
    if (sent.error) throw new Error('The reset email could not be sent. Try again later.');
    const logged = await supabaseAdmin.rpc('access_log_admin', { actor: context.userId, target: data.target, a: 'password_reset_sent', detail: {} });
    if (logged.error) throw new Error(logged.error.message);
    return { ok: true };
  });

export const setAccountStatus = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ target: z.string().uuid(), active: z.boolean() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc('access_set_status', { target: data.target, make_active: data.active });
    if (error) throw new Error(error.message);
    // The database change already removes every right; blocking sign-in also ends their open sessions.
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const ban = await supabaseAdmin.auth.admin.updateUserById(data.target, { ban_duration: data.active ? 'none' : '876000h' });
    return { signInBlocked: !data.active && !ban.error, note: ban.error ? 'Access changed. Sign-in blocking could not be updated; the person still cannot open any screen.' : '' };
  });

export const createMemberInvite = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ name: z.string().trim().min(1).max(120), email: z.string().email(), tierId: z.string().uuid().optional(), existingId: z.string().uuid().optional() }).parse(input))
  .handler(async ({ data, context }) => {
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    const token = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
    const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))), b => b.toString(16).padStart(2, '0')).join('');
    const { error } = await context.supabase.rpc('member_invite', {
      n: data.name, e: data.email.toLowerCase(), h: hash, expires: new Date(Date.now() + 7 * 86400000).toISOString(),
      ...(data.tierId ? { tier: data.tierId } : {}), ...(data.existingId ? { existing: data.existingId } : {}),
    });
    if (error) throw new Error(error.message);
    return { link: siteLink(canonicalSiteUrl(process.env['SITE_URL']), `/invite?token=${token}`) };
  });

const newToken = async () => {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const token = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))), b => b.toString(16).padStart(2, '0')).join('');
  return { token, hash, expires: new Date(Date.now() + 7 * 86400000).toISOString() };
};

const LEVEL_LABELS: Record<string, string> = { superadmin: 'SuperAdmin', fa_staff: 'FA Staff', client_admin: 'Client Admin', client_staff: 'Client Staff', member: 'Member' };

/** Email the one-time link. Never fails the invitation itself: the link is always shown on screen too. */
async function emailInvite(to: string, name: string, level: string, link: string, expires: string, key: string): Promise<boolean> {
  try {
    const { sendTemplateEmail } = await import('@/lib/email-templates/send-email');
    const r = await sendTemplateEmail('account-invitation', to, {
      templateData: { name, levelLabel: LEVEL_LABELS[level] ?? level, link, expires: new Date(expires).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) },
      idempotencyKey: `account-invitation-${key}`,
    });
    return r.sent;
  } catch (e) { console.error('Invitation email failed', e); return false; }
}

/** Create an account of any level as a recorded single-use invitation. The database decides who may create which level and enforces caps. */
export const createAccount = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({
    level: z.enum(['superadmin', 'fa_staff', 'client_admin', 'client_staff', 'member']), name: z.string().trim().min(1).max(120), email: z.string().email(),
    roles: z.array(z.enum(['analyst', 'curator', 'management'])).default([]), clientId: z.string().uuid().optional(), tierId: z.string().uuid().optional(),
  }).parse(input))
  .handler(async ({ data, context }) => {
    const t = await newToken();
    const { error } = await context.supabase.rpc('account_invite', {
      lvl: data.level, n: data.name, e: data.email.toLowerCase(), h: t.hash, expires: t.expires, roles: data.roles,
      ...(data.clientId ? { client: data.clientId } : {}), ...(data.tierId ? { tier: data.tierId } : {}),
    });
    if (error) throw new Error(error.message);
    const link = siteLink(canonicalSiteUrl(process.env['SITE_URL']), `/invite?token=${t.token}`);
    const emailed = await emailInvite(data.email.toLowerCase(), data.name, data.level, link, t.expires, t.hash.slice(0, 32));
    return { link, emailed };
  });

export const resendAccountInvite = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const t = await newToken();
    const { error } = await context.supabase.rpc('account_invite_resend', { rid: data.id, h: t.hash, expires: t.expires });
    if (error) throw new Error(error.message);
    const link = siteLink(canonicalSiteUrl(process.env['SITE_URL']), `/invite?token=${t.token}`);
    const { data: list } = await context.supabase.rpc('account_pending_invites');
    const inv = ((list ?? []) as unknown as { id: string; email: string; name: string; level: string }[]).find(i => i.id === data.id);
    const emailed = inv ? await emailInvite(inv.email, inv.name, inv.level, link, t.expires, t.hash.slice(0, 32)) : false;
    return { link, emailed, email: inv?.email ?? '' };
  });
