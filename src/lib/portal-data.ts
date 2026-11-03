import { supabase } from '@/integrations/supabase/client';

/** Client-safe shapes returned by the portal_* database functions and the documents RLS policy. */
export type PortalEngagement = { id: string; code: string; name: string; status: string; opened_on: string; due_on: string | null; stage: number };
export type PortalBrief = {
  version: number; kind: string; amendment_no: number | null; situation: string | null; objectives: string[]; platforms: string[]; languages: string[];
  window_from: string | null; window_to: string | null; in_scope: string | null; out_of_scope: string | null; change_summary: string | null; authored_at: string;
};
export type PortalOrganisation = { display_name: string; legal_name: string | null; kind: string; contact_name: string | null; contact_email: string | null; phone: string | null; time_zone: string };
export type PortalNotify = { new_documents: boolean; engagement_updates: boolean; team_changes: boolean };
export type PortalDashboard = {
  client_id: string; client_name: string; kind: string; name: string | null; email: string | null; previous_sign_in: string | null; last_sign_in: string | null;
  notify: PortalNotify | null; organisation: PortalOrganisation; admins_used: number; pending_invites: number;
};
export type PortalDoc = {
  id: string; code: string; title: string; kind: string; source: string; engagement_id: string | null; sha256: string | null; file_name: string | null;
  size_bytes: number | null; manifest_only: boolean; storage_path: string | null; created_at: string; version: number;
};
export type PortalEvent = { id: string; at: string; type: 'document' | 'access'; action: string; subject: string | null; code: string | null; person: string };

export const STAGES = ['Planning', 'Collecting', 'Analysing', 'Reporting', 'Complete'] as const;
export const STAGE_NOTES = [
  'We agree the questions, scope and plan with you and record them in a signed brief.',
  'We gather the material set out in the brief.',
  'We read, check and analyse what was gathered.',
  'We prepare the report and check it before release to you.',
  'The report has been released and the engagement is closed out.',
];

export function stageName(stage: number) { return STAGES[Math.min(Math.max(stage, 1), 5) - 1]; }

export function statusWord(status: string) {
  return ({ scoping: 'Being set up', active: 'In progress', paused: 'Paused', delivered: 'Delivered', closed: 'Closed' } as Record<string, string>)[status] ?? status;
}

export function engagementSentence(e: PortalEngagement) {
  if (e.status === 'paused') return 'This engagement is paused. FridayAnalytics will contact you before it resumes.';
  return [
    'We are agreeing the plan and brief with you.',
    'We are gathering the material set out in your brief.',
    'We are reading and analysing the material gathered.',
    'We are preparing your report for release.',
    'Your report has been released. The engagement is complete.',
  ][Math.min(Math.max(e.stage, 1), 5) - 1];
}

const ACTION_WORDS: Record<string, string> = {
  shared: 'Shared document', uploaded: 'Uploaded document', downloaded: 'Downloaded document', download_refused: 'Download blocked (hash did not match)',
  invited: 'Invited administrator', resent: 'Resent invitation', accepted: 'Accepted invitation', cancel: 'Cancelled invitation',
  deactivate: 'Deactivated administrator', reactivate: 'Reactivated administrator', signed_in: 'Signed in', portal_enabled: 'Portal enabled',
  organisation_updated: 'Updated details', notifications_updated: 'Changed notification preferences',
};
export function actionWord(a: string) { return ACTION_WORDS[a] ?? a.replaceAll('_', ' '); }
/** Events shown under "What is new": client-safe and about content, not sign-ins. */
export const WHATS_NEW = new Set(['shared', 'uploaded', 'accepted', 'organisation_updated']);

/** Amendment marker for a brief field: the latest amendment that changed it, among versions the client may read. */
export function amendedBy(briefs: PortalBrief[], field: keyof PortalBrief): string | null {
  let marker: string | null = null;
  for (let i = 1; i < briefs.length; i++) {
    if (JSON.stringify(briefs[i][field]) !== JSON.stringify(briefs[i - 1][field]) && briefs[i].amendment_no != null) marker = `A${briefs[i].amendment_no}`;
  }
  return marker;
}

export function activityCsv(rows: PortalEvent[]) {
  const q = (v: unknown) => `"${String(v ?? '').replaceAll('"', '""')}"`;
  return [['When (UTC)', 'Person', 'Type', 'Action', 'About'], ...rows.map(r => [r.at, r.person, r.type, actionWord(r.action), r.code ? `${r.code} ${r.subject ?? ''}` : r.subject ?? ''])]
    .map(r => r.map(q).join(',')).join('\n');
}

async function rpc<T>(fn: string, args: Record<string, unknown>) {
  const { data, error } = await (supabase.rpc as unknown as (f: string, a: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>)(fn, args);
  if (error) throw error;
  return data as T;
}
const arg = (c?: string) => (c ? { c } : {});
export const portalApi = {
  dashboard: (c?: string) => rpc<PortalDashboard>('portal_dashboard', arg(c)),
  engagements: (c?: string) => rpc<PortalEngagement[]>('portal_engagements', arg(c)),
  briefs: (p: string) => rpc<PortalBrief[]>('portal_engagement_briefs', { p }),
  activity: (c?: string) => rpc<PortalEvent[]>('portal_activity', arg(c)),
  /** Read through the documents RLS policy; the filters also keep a staff preview to what the client sees. */
  documents: async (clientId: string) => {
    const { data, error } = await supabase.from('documents')
      .select('id,code,title,kind,source,engagement_id,sha256,file_name,size_bytes,manifest_only,storage_path,created_at,version')
      .eq('client_id', clientId).eq('visibility', 'client').eq('voided', false).order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []) as PortalDoc[];
  },
};
