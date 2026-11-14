import { supabase } from '@/integrations/supabase/client';

/** The five access levels. The database (access_menu) decides which screens each level plus job role may open; this file only maps screens to paths and labels. */
export type AccessLevel = 'superadmin' | 'fa_staff' | 'client_admin' | 'client_staff' | 'member';
export type AccessMenu = { level: AccessLevel | null; status: 'active' | 'inactive'; roles: string[]; screens: string[] };

export const LEVEL_LABEL: Record<AccessLevel, string> = {
  superadmin: 'SuperAdmin', fa_staff: 'FA Staff', client_admin: 'Client Admin', client_staff: 'Client Staff', member: 'Member',
};
export const levelLabel = (l: string | null | undefined) => (l && l in LEVEL_LABEL ? LEVEL_LABEL[l as AccessLevel] : 'No access level');

export const FORBIDDEN_MESSAGE = 'Your access level does not include this screen. Ask a SuperAdmin if you need it.';

/** Staff screens by path. Order matters: first match wins. Unlisted staff paths need "dashboard" (any active FA login). */
const STAFF_SCREENS: [RegExp, string][] = [
  [/^\/client-admin(?:\/|$)/, 'client_admin'],
  [/^\/users-access/, 'users_access'],
  [/^\/vaults/, 'vaults'],
  [/^\/connectors/, 'connectors'],
  [/^\/executive-agent/, 'executive_agent'],
  [/^\/team/, 'team'],
  [/^\/settings/, 'settings'],
  [/^\/billing/, 'billing'],
  [/^\/management/, 'management'],
  [/^\/inbox/, 'curator_inbox'],
  [/^\/account/, 'account'],
  [/^\/(projects|clients|methodology|statement)/, 'engagements'],
  [/^\/(research|rejections)/, 'research'],
  [/^\/early-warning/, 'early_warning'],
  [/^\/links/, 'links'],
  [/^\/narratives/, 'narratives'],
  [/^\/evidence-search/, 'evidence_search'],
  [/^\/library/, 'library'],
  [/^\/frameworks/, 'frameworks'],
  [/^\/sources/, 'sources'],
  [/^\/templates/, 'templates'],
  [/^\/document-samples/, 'document_samples'],
  [/^\/search/, 'search'],
  [/^\/(collect|queue|watchlist|results|capture-log|worker|capture-settings|jobs)/, 'collect'],
  [/^\/(integrity|verify|export|offline)/, 'integrity'],
  [/^\/(cases|case-database|trail|timeline|profiles|comments|transcripts|custody|report|dossier|summary|items|review|vault)/, 'cases'],
];
export function staffScreenFor(pathname: string): string {
  return STAFF_SCREENS.find(([re]) => re.test(pathname))?.[1] ?? 'dashboard';
}
export function canOpen(menu: Pick<AccessMenu, 'screens' | 'status'> | null | undefined, screen: string) {
  return !!menu && menu.status !== 'inactive' && menu.screens.includes(screen);
}

/** Client portal tabs by screen key, in menu order. */
export const PORTAL_TABS = [
  { tab: 'Dashboard', screen: 'portal_dashboard', label: 'Dashboard' },
  { tab: 'Documents', screen: 'portal_reports', label: 'Reports' },
  { tab: 'Engagements', screen: 'portal_engagements', label: 'Engagement progress' },
  { tab: 'Notices', screen: 'portal_notices', label: 'Notices' },
  { tab: 'Administration', screen: 'portal_team', label: 'Team and seats' },
  { tab: 'Pricing', screen: 'portal_pricing', label: 'Pricing and upgrade' },
  { tab: 'Billing', screen: 'portal_billing', label: 'Billing and invoices' },
  { tab: 'Account', screen: 'account', label: 'Account' },
] as const;
/** Staff previewing the portal see every client tab except Account (their own account lives in the staff workspace). */
export function portalTabsFor(menu: AccessMenu | null | undefined, preview: boolean) {
  if (preview) return PORTAL_TABS.filter(t => t.tab !== 'Account');
  return PORTAL_TABS.filter(t => canOpen(menu, t.screen));
}

export async function fetchAccessMenu(): Promise<AccessMenu> {
  const { data, error } = await supabase.rpc('access_menu');
  if (error) throw error;
  return data as unknown as AccessMenu;
}
export const accessMenuQuery = { queryKey: ['access-menu'] as const, queryFn: fetchAccessMenu, staleTime: 60_000 };
