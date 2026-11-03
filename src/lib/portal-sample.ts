import type { PortalBrief, PortalDashboard, PortalDoc, PortalEngagement, PortalEvent } from './portal-data';
import type { ClientAdmin } from './portal-access';

/** Review-only Sample data for /portal?preview=sample. Staff only; never written to the database. */
const h = (n: number) => (n.toString(16).padStart(2, '0')).repeat(32);
const day = (d: number) => new Date(Date.UTC(2026, 9, d, 2, 30)).toISOString();

export const SAMPLE_CLIENT_ID = '00000000-0000-4000-8000-000000000000';
export const sampleDashboard: PortalDashboard = {
  client_id: SAMPLE_CLIENT_ID, client_name: 'Sample Organisation Berhad', kind: 'organisation', name: 'Sample Administrator', email: 'admin@sample.invalid',
  previous_sign_in: day(20), last_sign_in: day(30), notify: { new_documents: true, engagement_updates: true, team_changes: false },
  organisation: { display_name: 'Sample Organisation Berhad', legal_name: 'Sample Organisation Berhad (Sample)', kind: 'organisation', contact_name: 'Sample Contact', contact_email: 'contact@sample.invalid', phone: '+60 3-0000 0000 (Sample)', time_zone: 'Asia/Kuala_Lumpur' },
  admins_used: 2, pending_invites: 1,
};
export const sampleEngagements: PortalEngagement[] = [
  { id: 's-e1', code: 'ENG-S01', name: 'Sample: online narrative review', status: 'active', opened_on: '2026-09-01', due_on: '2026-12-15', stage: 3 },
  { id: 's-e2', code: 'ENG-S02', name: 'Sample: platform response study', status: 'active', opened_on: '2026-10-05', due_on: '2027-01-30', stage: 1 },
  { id: 's-e3', code: 'ENG-S03', name: 'Sample: quarterly summary', status: 'closed', opened_on: '2026-06-02', due_on: '2026-08-29', stage: 5 },
];
export const sampleBriefs: PortalBrief[] = [
  { version: 1, kind: 'brief', amendment_no: null, situation: 'Sample situation: the client wants to understand how a narrative spread online.', objectives: ['Sample objective one', 'Sample objective two'], platforms: ['Facebook'], languages: ['Malay', 'English'], window_from: '2026-08-01', window_to: '2026-09-30', in_scope: 'Public posts and comments on named pages (Sample).', out_of_scope: 'Private groups and messages (Sample).', change_summary: null, authored_at: day(2) },
  { version: 2, kind: 'amendment', amendment_no: 1, situation: 'Sample situation: the client wants to understand how a narrative spread online.', objectives: ['Sample objective one', 'Sample objective two'], platforms: ['Facebook'], languages: ['Malay', 'English'], window_from: '2026-08-01', window_to: '2026-10-31', in_scope: 'Public posts and comments on named pages (Sample).', out_of_scope: 'Private groups and messages (Sample).', change_summary: 'Sample: window extended by one month.', authored_at: day(12) },
];
export const sampleDocs: PortalDoc[] = [
  { id: 's-d1', code: 'DOC-S0004', title: 'Sample: interim findings report', kind: 'report', source: 'fa', engagement_id: 's-e1', sha256: h(171), file_name: 'interim.pdf', size_bytes: 482113, manifest_only: false, storage_path: null, home_path: 'sample', created_at: day(28), version: 1 },
  { id: 's-d2', code: 'DOC-S0003', title: 'Sample: brief amendment A1', kind: 'brief', source: 'fa', engagement_id: 's-e1', sha256: h(43), file_name: null, size_bytes: null, manifest_only: false, storage_path: null, home_path: null, created_at: day(12), version: 2 },
  { id: 's-d3', code: 'DOC-S0002', title: 'Sample: our background notes', kind: 'client_upload', source: 'client', engagement_id: null, sha256: h(205), file_name: 'notes.docx', size_bytes: 38211, manifest_only: false, storage_path: null, home_path: 'sample', created_at: day(9), version: 1 },
  { id: 's-d4', code: 'DOC-S0001', title: 'Sample: signed brief', kind: 'brief', source: 'fa', engagement_id: 's-e1', sha256: h(18), file_name: null, size_bytes: null, manifest_only: false, storage_path: null, home_path: null, created_at: day(2), version: 1 },
];
export const sampleEvents: PortalEvent[] = [
  { id: 's-a1', at: day(30), type: 'access', action: 'signed_in', subject: 'Sample Administrator', code: null, person: 'Sample Administrator' },
  { id: 's-a2', at: day(28), type: 'document', action: 'shared', subject: 'Sample: interim findings report', code: 'DOC-S0004', person: 'FridayAnalytics' },
  { id: 's-a3', at: day(25), type: 'access', action: 'invited', subject: 'Sample Colleague', code: null, person: 'Sample Administrator' },
  { id: 's-a4', at: day(12), type: 'document', action: 'shared', subject: 'Sample: brief amendment A1', code: 'DOC-S0003', person: 'FridayAnalytics' },
  { id: 's-a5', at: day(9), type: 'document', action: 'uploaded', subject: 'Sample: our background notes', code: 'DOC-S0002', person: 'Sample Administrator' },
  { id: 's-a6', at: day(3), type: 'document', action: 'downloaded', subject: 'Sample: signed brief', code: 'DOC-S0001', person: 'Sample Administrator' },
];
export const sampleAdmins: ClientAdmin[] = [
  { id: 's-u1', user_id: 's', email: 'admin@sample.invalid', name: 'Sample Administrator', status: 'active', last_sign_in: day(30), invite_expires_at: null },
  { id: 's-u2', user_id: null, email: 'colleague@sample.invalid', name: 'Sample Colleague', status: 'pending', last_sign_in: null, invite_expires_at: day(31) },
];
