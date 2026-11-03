/**
 * Engagements (projects) under FA-CEF V1.10, the Client Engagement Framework.
 *
 * The database enforces the framework: gates G0-G5, the signed brief and its amendments,
 * the two-person rule, evidence tiers, and release control. This module loads an
 * engagement and holds the framework's labels and tables; screens show the database's own
 * error text when it refuses something, because that text names what is missing.
 */
import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { gatewayHealth, refFiles, type VaultFile } from "@/lib/home-vault";
import { sourcesQuery, type EvidenceRef, type Source } from "@/lib/hub";

export type Client = Tables<"clients">;
export type Project = Tables<"projects">;
export type Brief = Tables<"project_briefs">;
export type Gate = Tables<"project_gates">;
export type Output = Tables<"project_outputs">;
export type ProjectEvent = Tables<"project_events">;
export type Interview = Tables<"project_interviews">;
export type IntakeItem = Tables<"project_intake_items">;
export type ResearchQuestion = Tables<"project_research_questions">;
export type Scenario = Tables<"project_scenarios">;
export type Measure = Tables<"project_success_measures">;
export type ScopeSheet = Tables<"project_scope_sheets">;
export type DesignSheet = Tables<"project_design_sheets">;
export type Target = Tables<"project_targets">;
export type Cycle = Tables<"project_cycles">;
export type Decision = Tables<"project_decisions"> & {
  needs_second_reader: boolean;
  second_reader_confirmed: boolean;
  disputed: boolean;
};
export type Tier = Tables<"project_item_tiers">;
export type Capture = Tables<"project_captures">;
export type LoadReport = Tables<"project_load_reports">;
export type ReportEntry = Tables<"project_report_entries">;
export type Closeout = Tables<"project_closeouts">;
export type ScenarioEvent = Tables<"project_scenario_events">;
export type Approval = Tables<"project_amendment_approvals">;

// ---- framework constants -------------------------------------------------------------------------
export type GateId = "G0" | "G1" | "G2" | "G3" | "G4" | "G5";
export const GATES: {
  id: GateId;
  name: string;
  signer: string;
  roles: string[];
  passes: string;
}[] = [
  {
    id: "G0",
    name: "Brief signed",
    signer: "Engagement lead records the client sponsor's sign-off",
    roles: ["owner", "engagement_lead"],
    passes:
      "Brief complete (sections 1 to 10), read back to and signed by the client sponsor; interviews, research questions, scenarios and success plan recorded.",
  },
  {
    id: "G1",
    name: "Mandate",
    signer: "Curator",
    roles: ["curator"],
    passes:
      "Curator signs the scope sheet after the risk screen and legal note. Without it, no collection starts.",
  },
  {
    id: "G2",
    name: "Design approved",
    signer: "Curator",
    roles: ["curator"],
    passes:
      "Design sheet approved: lexicon tested on a sample, scale and caps set, each choice traced to the brief, target register resolved. Lexicon and scale then freeze; changes bump the version and need G2 again.",
  },
  {
    id: "G3",
    name: "Read complete",
    signer: "Lead analyst (per cycle)",
    roles: ["owner", "lead_analyst"],
    passes:
      "Every candidate has a decision; counts reconcile (candidates = flagged + excluded); every CRITICAL or HIGH flag confirmed by a second reader.",
  },
  {
    id: "G4",
    name: "Evidence and QA",
    signer: "Evidence officer or data steward (per cycle)",
    roles: ["owner", "evidence_officer", "data_steward"],
    passes:
      "Database counts reconcile, hashes verified, evidence tier set on every flagged item, case folder complete with manifest.",
  },
  {
    id: "G5",
    name: "Release",
    signer: "Curator, in writing (per output)",
    roles: ["curator"],
    passes:
      "Written Curator approval. Default state is HELD. Only if the mandate allows release outside FridayAnalytics.org.",
  },
];

export const PHASES = [
  { n: 0, name: "Brief", gate: "G0, G1" },
  { n: 1, name: "Design", gate: "G2" },
  { n: 2, name: "Collect", gate: "" },
  { n: 3, name: "Screen", gate: "" },
  { n: 4, name: "Read", gate: "G3" },
  { n: 5, name: "Evidence", gate: "" },
  { n: 6, name: "Enrich", gate: "" },
  { n: 7, name: "Load", gate: "G4" },
  { n: 8, name: "Report", gate: "" },
  { n: 9, name: "Deliver", gate: "G5" },
  { n: 10, name: "Monitor", gate: "" },
] as const;

export const CATEGORIES = [
  {
    id: "INCITEMENT",
    meaning: "Calls for, approves or threatens violence against a person or group",
    reportAs: "Violence",
  },
  {
    id: "DEHUMANISATION",
    meaning: "Compares people to animals, vermin, disease or objects",
    reportAs: "Harassment",
  },
  {
    id: "EXPULSION_CALL",
    meaning: "Calls for removal, deportation or exclusion of a group",
    reportAs: "Harassment",
  },
  {
    id: "GENERAL_HOSTILITY",
    meaning: "Insults or hostility aimed at a group",
    reportAs: "Harassment",
  },
] as const;
export const SEVERITIES = [
  {
    id: "CRITICAL",
    use: "Incitement to raid or burn places where people live or trade, or imminent threat",
  },
  { id: "HIGH", use: "Incitement to violence; threats against identified targets or institutions" },
  {
    id: "MEDIUM",
    use: "Approval of violence short of a direct call; strong dehumanisation or expulsion call",
  },
  { id: "LOW", use: "Insulting or hostile language at a group without a call to act" },
] as const;
export const EXCLUSION_CODES = [
  { id: "NO_TARGET_GROUP", meaning: "Hostile or crude but no group is targeted" },
  { id: "AMBIGUOUS_REFERENT", meaning: "Cannot tell who the comment is about without guessing" },
  { id: "NOT_HOSTILE", meaning: "Question, resemblance remark or neutral" },
  { id: "AIMED_AT_AUTHORITIES", meaning: "Criticism of officials or institutions" },
  {
    id: "OUT_OF_MANDATE_HELD",
    meaning: "Hostility at a group outside the mandate; held for the Curator, not deleted",
  },
] as const;
export const TIERS = [
  { id: "API_RAW_ONLY", label: "API raw only", proof: false },
  { id: "BROWSER_DOM_ONLY", label: "Browser DOM only", proof: false },
  { id: "ELEMENT_CROP", label: "Element crop", proof: false },
  { id: "FA_STD_001_V2", label: "FA-STD-001 V2", proof: true },
] as const;
export const tierLabel = (t?: string | null) =>
  TIERS.find((x) => x.id === t)?.label ?? "No tier yet";

export const SCENARIO_TYPES = [
  { id: "baseline", label: "S1 Baseline" },
  { id: "escalation", label: "S2 Escalation" },
  { id: "mobilization", label: "S3 Mobilization" },
  { id: "narrative_spike", label: "S4 Narrative spike" },
  { id: "protectee_under_attack", label: "S5 Protectee under attack" },
  { id: "data_loss", label: "S6 Data loss" },
  { id: "false_alarm", label: "S7 False alarm" },
  { id: "external_shock", label: "S8 External shock" },
  { id: "other", label: "Other" },
] as const;
export const MEASURE_LEVELS = [
  {
    id: "objectives",
    label: "Objectives",
    blurb: "The decisions the client will take on FA's output",
  },
  { id: "outputs", label: "Outputs", blurb: "Volumes collected, read, flagged, captured" },
  { id: "out_takes", label: "Out-takes", blurb: "What the data says people are saying" },
  { id: "outcomes", label: "Outcomes", blurb: "Change in the conversation across cycles" },
  {
    id: "impact",
    label: "Impact",
    blurb: "Client-reported effect of its own actions (client figures only)",
  },
] as const;

/** FA-CEF section 3: where each brief section is used. */
export const TRACEABILITY = [
  {
    n: 1,
    section: "Situation",
    used: "Phase 1, 8",
    how: "Frames the report; supplies the hypotheses to test",
  },
  {
    n: 2,
    section: "Purpose and decisions",
    used: "Phase 1, 8",
    how: "Sets what the report must let the client decide",
  },
  {
    n: 3,
    section: "Audiences and stakeholders",
    used: "Phase 1",
    how: "Target register; target groups in the taxonomy",
  },
  {
    n: 4,
    section: "Scope and exclusions",
    used: "Phase 1, 2, 4",
    how: "Platforms, languages, window, caps; exclusion codes and held categories",
  },
  {
    n: 5,
    section: "Research content supplied",
    used: "Phase 1, 3",
    how: "Seeds lexicon and targets after intake rules; baseline for comparison",
  },
  {
    n: 6,
    section: "Response parameters",
    used: "Phase 9, 10",
    how: "Who may act, how fast, approval path, red lines",
  },
  {
    n: 7,
    section: "Scenarios",
    used: "Phase 8, 10",
    how: "Triggers become watch conditions; options appear in the brief to the client",
  },
  {
    n: 8,
    section: "Success measures",
    used: "Phase 8",
    how: "Report structure; baseline and targets",
  },
  {
    n: 9,
    section: "Constraints and risks",
    used: "Phase 0, 2, 9",
    how: "Legal screen, data handling, retention",
  },
  { n: 10, section: "Governance", used: "All", how: "Contacts, approvals, amendment control" },
] as const;

export const OUTPUT_KINDS = [
  {
    id: "executive_brief",
    label: "Executive brief",
    blurb:
      "1 to 2 pages: scope, window, volumes, flagged counts by severity and category, top items quoted verbatim. Reports against the brief.",
  },
  {
    id: "findings_tables",
    label: "Findings tables",
    blurb:
      "Category by severity, by target group, by account, over time. Incitement kept apart from harassment. No single sentiment score.",
  },
  {
    id: "network_map",
    label: "Network map",
    blurb:
      "Six tiers; solid edges for proof, dashed for suspected; each node VALIDATED or SUSPECTED. Attach the finished map.",
  },
  {
    id: "limits_statement",
    label: "Limits statement",
    blurb:
      "Caps, uncaptured posts, API gaps, unreviewed translation, items still at API-only tier.",
  },
  {
    id: "evidence_bundle",
    label: "Evidence bundle",
    blurb:
      "ZIP of flagged items' files, re-hashed against their records, with manifest, decisions and tiers.",
  },
  { id: "dashboard", label: "Dashboard snapshot", blurb: "Dated snapshot of the live counts." },
  {
    id: "dataset",
    label: "Dataset",
    blurb: "CSV of flagged items with category, severity, group, tier and file hashes.",
  },
  {
    id: "release_pack",
    label: "Release pack",
    blurb: "Brief, tables, evidence index and limits statement assembled for G5.",
  },
] as const;
export type OutputKind = (typeof OUTPUT_KINDS)[number]["id"];
export const outputKindLabel = (k: string) => OUTPUT_KINDS.find((o) => o.id === k)?.label ?? k;

export const OUTPUT_STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  qa_review: "In QA",
  held: "HELD",
  released: "Released",
  withdrawn: "Withdrawn",
};
export const OUTPUT_STATUS_STYLE: Record<string, string> = {
  draft: "bg-muted text-foreground",
  qa_review: "bg-queued text-queued-foreground",
  held: "bg-warn text-warn-foreground",
  released: "bg-done text-done-foreground",
  withdrawn: "bg-failed text-failed-foreground",
};

export { DOCUMENT_FOOTER as ATTRIBUTION } from './document-footer';

export const PROJECT_STATUS = [
  { id: "scoping", label: "Scoping" },
  { id: "active", label: "Active" },
  { id: "paused", label: "Paused" },
  { id: "delivered", label: "Delivered" },
  { id: "closed", label: "Closed" },
];
export const projectStatusLabel = (s: string) => PROJECT_STATUS.find((p) => p.id === s)?.label ?? s;

export const ROLES = [
  {
    id: "engagement_lead",
    label: "Engagement lead",
    blurb:
      "Runs discovery, writes the brief and situation analysis, runs the scenario session; records G0.",
  },
  {
    id: "lead_analyst",
    label: "Lead analyst",
    blurb: "Design from the brief, reports against success measures, limits statement; signs G3.",
  },
  {
    id: "analyst",
    label: "Analyst",
    blurb: "Reads candidates, decides, confirms others' CRITICAL and HIGH flags.",
  },
  {
    id: "collection_operator",
    label: "Collection operator",
    blurb: "API and browser collection, hashing, SCAN_LOG.",
  },
  { id: "evidence_officer", label: "Evidence officer", blurb: "FA-STD-001 captures; signs G4." },
  {
    id: "data_steward",
    label: "Data steward",
    blurb: "Loading, register, sync, counts, intake register; signs G4.",
  },
  { id: "reviewer", label: "Reviewer", blurb: "Reads everything; changes nothing." },
  {
    id: "client_viewer",
    label: "Client viewer",
    blurb:
      "Someone at the client. Sees the brief in force and released outputs shared with them, once the client portal is on.",
  },
] as const;
export type MemberRole = (typeof ROLES)[number]["id"];
export const roleLabel = (r?: string | null) =>
  r === "owner"
    ? "Owner"
    : r === "curator"
      ? "Curator"
      : (ROLES.find((x) => x.id === r)?.label ?? "—");

// ---- who am I ------------------------------------------------------------------------------------------
export type Me = {
  uid: string | null;
  isOwner: boolean;
  isCurator: boolean;
  isManagement?: boolean;
  isInvestigator: boolean;
  name: string;
};

export function useMe() {
  return useQuery({
    queryKey: ["me"],
    staleTime: 60_000,
    queryFn: async (): Promise<Me> => {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id ?? null;
      if (!uid)
        return { uid: null, isOwner: false, isCurator: false, isInvestigator: false, name: "" };
      const [{ data: roles }, { data: profile }] = await Promise.all([
        supabase.from("user_roles").select("role").eq("user_id", uid),
        supabase.from("profiles").select("display_name, email").eq("id", uid).maybeSingle(),
      ]);
      const rs = (roles ?? []).map((r) => r.role as string);
      return {
        uid,
        isOwner: rs.includes("owner"),
        isCurator: rs.includes("curator"),
        isManagement: rs.includes("management"),
        isInvestigator: rs.some(r=>r!=='management'),
        name: profile?.display_name || profile?.email || auth.user?.email || "",
      };
    },
  });
}

// ---- lists ---------------------------------------------------------------------------------------------
export type ProjectListRow = Project & {
  clients: Pick<Client, "id" | "code" | "name"> | null;
  project_outputs: Pick<Output, "id" | "status">[] | null;
  project_cases: { case_id: string }[] | null;
  project_gates: { gate: string }[] | null;
};

export function useClientsAndProjects() {
  return useQuery({
    queryKey: ["clients-projects"],
    queryFn: async () => {
      const [clients, projects] = await Promise.all([
        supabase.from("clients").select("*").order("name"),
        supabase
          .from("projects")
          .select(
            "*, clients(id, code, name), project_outputs(id, status), project_cases(case_id), project_gates(gate)",
          )
          .order("updated_at", { ascending: false }),
      ]);
      if (clients.error) throw clients.error;
      if (projects.error) throw projects.error;
      return {
        clients: clients.data ?? [],
        projects: (projects.data ?? []) as unknown as ProjectListRow[],
      };
    },
  });
}

/** Engagements the signed-in user can link a case to (collection and lead roles, or owner/curator). */
export function useLinkableProjects(enabled = true) {
  return useQuery({
    queryKey: ["linkable-projects"],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("projects")
        .select("id, code, name, status, clients(code, name), project_gates(gate)")
        .in("status", ["scoping", "active", "paused"])
        .order("code");
      if (error) throw error;
      type Row = {
        id: string;
        code: string;
        name: string;
        clients: { code: string; name: string } | null;
        project_gates: { gate: string }[] | null;
      };
      // case folders can be linked only after G1
      return ((data ?? []) as unknown as Row[]).filter((p) =>
        (p.project_gates ?? []).some((g) => g.gate === "G1"),
      );
    },
  });
}

// ---- one engagement --------------------------------------------------------------------------------------
export type CloudArtefact = {
  id: string;
  filename: string;
  kind: string;
  sha256: string | null;
  size_bytes: number | null;
  mime_type: string | null;
  storage_path: string;
};

/** A candidate: a cloud item or a home-vault reference screened into a cycle. */
export type Candidate = {
  id: string; // project_items.id
  cycleNo: number;
  kind: "cloud_item" | "home_ref";
  refId: string;
  code: string;
  caseId: string | null;
  sourceId: string;
  platform: string | null;
  itemType: string | null;
  author: string | null;
  publishedAt: string | null;
  text: string | null;
  translation: string | null;
  url: string | null;
  score: number | null;
  matchedTerms: string[];
  sourceLine: string | null;
  chunkNo: number | null;
  voided: boolean;
  voidNote: string | null;
  artefacts: CloudArtefact[];
  homeFiles: VaultFile[];
  /** the home-vault reference row, for verified re-fetching */
  ref: EvidenceRef | null;
  recordId: string | null;
};

export type Workspace = {
  project: Project;
  client: Client | null;
  me: Me;
  role: string | null;
  canManage: boolean;
  has: (...roles: string[]) => boolean;
  gates: Gate[];
  gateAt: (g: GateId, cycle?: number, output?: string | null) => Gate | undefined;
  briefs: Brief[];
  approvals: Approval[];
  briefInForce: Brief | null;
  draft: Brief | null;
  interviews: Interview[];
  intake: IntakeItem[];
  rqs: ResearchQuestion[];
  scenarios: Scenario[];
  scenarioEvents: ScenarioEvent[];
  measures: Measure[];
  scopeSheet: ScopeSheet | null;
  designSheets: DesignSheet[];
  design: DesignSheet | null;
  targets: Target[];
  cycles: Cycle[];
  cases: {
    case_id: string;
    note: string | null;
    linked_at: string;
    voided_at: string | null;
    target: string | null;
  }[];
  candidates: Candidate[];
  decisions: Map<string, Decision>;
  tiers: Map<string, Tier>;
  captures: Capture[];
  loadReports: LoadReport[];
  outputs: Output[];
  entries: ReportEntry[];
  closeout: Closeout | null;
  events: ProjectEvent[];
  members: (Tables<"project_members"> & { name: string; email: string | null })[];
  names: Map<string, string>;
};

type CloudItemRow = {
  id: string;
  item_code: string;
  item_type: string;
  author_handle: string | null;
  published_at: string | null;
  text_original: string | null;
  text_en: string | null;
  url: string | null;
  accounts: { platform: string; incidents: { case_id: string } | null } | null;
  artefacts: CloudArtefact[] | null;
};
export const ITEM_SELECT =
  "id, item_code, item_type, author_handle, published_at, text_original, text_en, url, accounts(platform, incidents(case_id)), artefacts(id, filename, kind, sha256, size_bytes, mime_type, storage_path)";

export function cloudToCandidate(r: CloudItemRow, link: Tables<"project_items"> | null): Candidate {
  return {
    id: link?.id ?? "",
    cycleNo: link?.cycle_no ?? 0,
    kind: "cloud_item",
    refId: r.id,
    code: r.item_code,
    caseId: r.accounts?.incidents?.case_id ?? null,
    sourceId: "cloud",
    platform: r.accounts?.platform ?? null,
    itemType: r.item_type,
    author: r.author_handle,
    publishedAt: r.published_at,
    text: r.text_original,
    translation: r.text_en,
    url: r.url,
    score: link?.screen_score ?? null,
    matchedTerms: link?.matched_terms ?? [],
    sourceLine: link?.source_line ?? null,
    chunkNo: link?.chunk_no ?? null,
    voided: !!link?.voided_at,
    voidNote: link?.void_note ?? null,
    artefacts: r.artefacts ?? [],
    homeFiles: [],
    ref: null,
    recordId: null,
  };
}
export function homeToCandidate(r: EvidenceRef, link: Tables<"project_items"> | null): Candidate {
  return {
    id: link?.id ?? "",
    cycleNo: link?.cycle_no ?? 0,
    kind: "home_ref",
    refId: r.id,
    code: r.record_code ?? r.record_id,
    caseId: r.case_id,
    sourceId: r.source_id,
    platform: r.platform,
    itemType: r.item_type,
    author: null,
    publishedAt: r.published_at,
    text: r.note,
    translation: null,
    url: null,
    score: link?.screen_score ?? null,
    matchedTerms: link?.matched_terms ?? [],
    sourceLine: link?.source_line ?? null,
    chunkNo: link?.chunk_no ?? null,
    voided: !!link?.voided_at,
    voidNote: link?.void_note ?? null,
    artefacts: [],
    homeFiles: refFiles(r),
    ref: r,
    recordId: r.record_id,
  };
}

export function useProjectWorkspace(projectId: string) {
  return useQuery({
    queryKey: ["project", projectId],
    queryFn: async (): Promise<Workspace> => {
      const pid = projectId;
      const eq = <T extends { eq: (c: string, v: string) => T }>(q: T) => q.eq("project_id", pid);
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id ?? "";
      const [
        project,
        members,
        gates,
        briefs,
        approvals,
        interviews,
        intake,
        rqs,
        scenarios,
        scenarioEvents,
        measures,
        scopeSheets,
        designSheets,
        targets,
        cycles,
        cases,
        links,
        decisions,
        tiers,
        captures,
        loads,
        outputs,
        entries,
        closeouts,
        events,
        role,
        inForce,
        meRes,
      ] = await Promise.all([
        supabase.from("projects").select("*, clients(*)").eq("id", pid).maybeSingle(),
        eq(supabase.from("project_members").select("*")),
        eq(supabase.from("project_gates").select("*")).order("signed_at"),
        eq(supabase.from("project_briefs").select("*")).order("version", { ascending: false }),
        eq(supabase.from("project_amendment_approvals").select("*")),
        eq(supabase.from("project_interviews").select("*")).order("held_at", { ascending: false }),
        eq(supabase.from("project_latest_intake").select("*")).order("item_ref"),
        eq(supabase.from("project_latest_rqs").select("*")).order("rq_no"),
        eq(supabase.from("project_latest_scenarios").select("*")).order("scenario_no"),
        eq(supabase.from("project_scenario_events").select("*")).order("created_at", {
          ascending: false,
        }),
        eq(supabase.from("project_latest_measures").select("*")).order("measure_no"),
        eq(supabase.from("project_scope_sheets").select("*")).order("completed_at", {
          ascending: false,
        }),
        eq(supabase.from("project_design_sheets").select("*")).order("version", {
          ascending: false,
        }),
        eq(supabase.from("project_latest_targets").select("*")).order("target_key"),
        eq(supabase.from("project_cycles").select("*")).order("cycle_no"),
        eq(
          supabase
            .from("project_cases")
            .select("case_id, note, linked_at, voided_at, cases(target_of_complaint)"),
        ).order("linked_at"),
        eq(supabase.from("project_items").select("*")),
        eq(supabase.from("project_latest_decisions").select("*")),
        eq(supabase.from("project_latest_tiers").select("*")),
        eq(supabase.from("project_captures").select("*")).order("created_at"),
        eq(supabase.from("project_load_reports").select("*")).order("recorded_at", {
          ascending: false,
        }),
        eq(supabase.from("project_outputs").select("*")).order("created_at", { ascending: false }),
        eq(supabase.from("project_report_entries").select("*")).order("created_at"),
        eq(supabase.from("project_closeouts").select("*")),
        eq(supabase.from("project_events").select("*"))
          .order("at", { ascending: false })
          .limit(300),
        supabase.rpc("project_role", { _user_id: uid, _project_id: pid }),
        supabase.rpc("project_current_brief_id", { _project: pid }),
        supabase.auth.getUser(),
      ]);
      for (const r of [
        project,
        members,
        gates,
        briefs,
        approvals,
        interviews,
        intake,
        rqs,
        scenarios,
        scenarioEvents,
        measures,
        scopeSheets,
        designSheets,
        targets,
        cycles,
        cases,
        links,
        decisions,
        tiers,
        captures,
        loads,
        outputs,
        entries,
        closeouts,
        events,
      ]) {
        if (r.error) throw r.error;
      }
      if (!project.data) throw new Error("Engagement not found, or you are not on its team.");
      void meRes;

      const linkRows = links.data ?? [];
      const cloudIds = linkRows.filter((l) => l.item_id).map((l) => l.item_id as string);
      const homeIds = linkRows
        .filter((l) => l.evidence_ref_id)
        .map((l) => l.evidence_ref_id as string);
      const memberIds = (members.data ?? []).map((m) => m.user_id);
      const actorIds = [
        ...new Set([
          ...memberIds,
          ...(gates.data ?? []).map((g) => g.signed_by).filter(Boolean),
        ] as string[]),
      ];
      const [cloudItems, homeRefs, profiles] = await Promise.all([
        cloudIds.length
          ? supabase.from("items").select(ITEM_SELECT).in("id", cloudIds)
          : Promise.resolve({ data: [], error: null }),
        homeIds.length
          ? supabase.from("evidence_refs").select("*").in("id", homeIds)
          : Promise.resolve({ data: [], error: null }),
        actorIds.length
          ? supabase.from("profiles").select("id, display_name, email").in("id", actorIds)
          : Promise.resolve({ data: [], error: null }),
      ]);
      if (cloudItems.error) throw cloudItems.error;
      if (homeRefs.error) throw homeRefs.error;
      const linkByRef = new Map(
        linkRows.map((l) => [(l.item_id ?? l.evidence_ref_id) as string, l]),
      );
      const candidates: Candidate[] = [
        ...((cloudItems.data ?? []) as unknown as CloudItemRow[]).map((r) =>
          cloudToCandidate(r, linkByRef.get(r.id) ?? null),
        ),
        ...((homeRefs.data ?? []) as unknown as EvidenceRef[]).map((r) =>
          homeToCandidate(r, linkByRef.get(r.id) ?? null),
        ),
      ].sort(
        (a, b) =>
          (b.score ?? 0) - (a.score ?? 0) ||
          String(b.publishedAt ?? "").localeCompare(String(a.publishedAt ?? "")),
      );

      const names = new Map(
        (profiles.data ?? []).map((p) => [p.id, p.display_name || p.email || "Unknown"]),
      );
      const myRole = (role.data as string | null) ?? null;
      const myMember = (members.data ?? []).find((m) => m.user_id === uid)?.role ?? null;
      const proj = project.data as unknown as Project & { clients: Client | null };
      const { clients: client, ...projectRow } = proj;
      const gateRows = gates.data ?? [];
      const allBriefs = briefs.data ?? [];
      const g0 = gateRows.find((g) => g.gate === "G0");
      const draft = g0 ? null : (allBriefs[0] ?? null);
      const memberRoles = new Set([myRole, myMember].filter(Boolean) as string[]);
      const me: Me = {
        uid,
        isOwner: myRole === "owner",
        isCurator: myRole === "curator",
        isManagement: myRole === "management",
        isInvestigator: !!myRole && myRole !== 'management',
        name: names.get(uid) ?? "",
      };
      return {
        project: projectRow as Project,
        client,
        me,
        role: myRole,
        canManage: myRole === "owner" || myRole === "engagement_lead",
        has: (...roles: string[]) => roles.some((r) => memberRoles.has(r)),
        gates: gateRows,
        gateAt: (g, cycle = 0, output = null) =>
          gateRows.find(
            (x) =>
              x.gate === g &&
              x.cycle_no === (g === "G3" || g === "G4" ? cycle : 0) &&
              (x.output_id ?? null) === (g === "G5" ? output : null),
          ),
        briefs: allBriefs,
        approvals: approvals.data ?? [],
        briefInForce: allBriefs.find((b) => b.id === inForce.data) ?? null,
        draft,
        interviews: interviews.data ?? [],
        intake: (intake.data ?? []) as unknown as IntakeItem[],
        rqs: ((rqs.data ?? []) as unknown as ResearchQuestion[]).filter((r) => !r.withdrawn),
        scenarios: ((scenarios.data ?? []) as unknown as Scenario[]).filter((r) => !r.withdrawn),
        scenarioEvents: scenarioEvents.data ?? [],
        measures: ((measures.data ?? []) as unknown as Measure[]).filter((r) => !r.withdrawn),
        scopeSheet: scopeSheets.data?.[0] ?? null,
        designSheets: designSheets.data ?? [],
        design: designSheets.data?.[0] ?? null,
        targets: ((targets.data ?? []) as unknown as Target[]).filter((t) => !t.withdrawn),
        cycles: cycles.data ?? [],
        cases: (
          (cases.data ?? []) as unknown as {
            case_id: string;
            note: string | null;
            linked_at: string;
            voided_at: string | null;
            cases: { target_of_complaint: string | null } | null;
          }[]
        ).map((c) => ({
          case_id: c.case_id,
          note: c.note,
          linked_at: c.linked_at,
          voided_at: c.voided_at,
          target: c.cases?.target_of_complaint ?? null,
        })),
        candidates,
        decisions: new Map(
          ((decisions.data ?? []) as unknown as Decision[]).map((d) => [d.project_item_id, d]),
        ),
        tiers: new Map(
          ((tiers.data ?? []) as unknown as Tier[]).map((t) => [t.project_item_id, t]),
        ),
        captures: captures.data ?? [],
        loadReports: loads.data ?? [],
        outputs: outputs.data ?? [],
        entries: entries.data ?? [],
        closeout: closeouts.data?.[0] ?? null,
        events: events.data ?? [],
        members: (members.data ?? []).map((m) => ({
          ...m,
          name: names.get(m.user_id) ?? "Unknown user",
          email: (profiles.data ?? []).find((p) => p.id === m.user_id)?.email ?? null,
        })),
        names,
      };
    },
  });
}

/** Items in the linked case folders that could still be screened into a cycle. */
export function useCasePool(caseIds: string[], enabled: boolean) {
  return useQuery({
    queryKey: ["case-pool", [...caseIds].sort().join(",")],
    enabled: enabled && caseIds.length > 0,
    queryFn: async (): Promise<Candidate[]> => {
      const [cloud, home] = await Promise.all([
        supabase
          .from("items")
          .select(
            ITEM_SELECT.replace("accounts(", "accounts!inner(").replace(
              "incidents(",
              "incidents!inner(",
            ),
          )
          .in("accounts.incidents.case_id", caseIds)
          .order("published_at", { ascending: false, nullsFirst: false })
          .limit(500),
        supabase
          .from("evidence_refs")
          .select("*")
          .in("case_id", caseIds)
          .order("published_at", { ascending: false, nullsFirst: false })
          .limit(500),
      ]);
      if (cloud.error) throw cloud.error;
      if (home.error) throw home.error;
      return [
        ...((cloud.data ?? []) as unknown as CloudItemRow[]).map((r) => cloudToCandidate(r, null)),
        ...((home.data ?? []) as unknown as EvidenceRef[]).map((r) => homeToCandidate(r, null)),
      ];
    },
  });
}

// ---- derived -------------------------------------------------------------------------------------------------
export function currentPhase(ws: Workspace): number {
  if (!ws.gateAt("G0")) return 0;
  if (!ws.gateAt("G1")) return 0;
  if (!ws.gateAt("G2") || ws.project.design_stale) return 1;
  const last = ws.cycles[ws.cycles.length - 1];
  if (!last) return 2;
  if (!ws.gateAt("G3", last.cycle_no))
    return ws.candidates.some((c) => c.cycleNo === last.cycle_no && !c.voided) ? 4 : 3;
  if (!ws.gateAt("G4", last.cycle_no))
    return ws.loadReports.some((l) => l.cycle_no === last.cycle_no) ? 7 : 5;
  if (!ws.outputs.some((o) => o.status === "released")) return ws.outputs.length ? 9 : 8;
  return 10;
}

export type Counts = {
  candidates: number;
  decided: number;
  flagged: number;
  excluded: number;
  bySeverity: Record<string, number>;
  byCategory: Record<string, number>;
  byGroup: Map<string, number>;
  needSecondReader: number;
  judgementCalls: number;
};
export function countsFor(ws: Workspace, cycle?: number): Counts {
  const c: Counts = {
    candidates: 0,
    decided: 0,
    flagged: 0,
    excluded: 0,
    bySeverity: {},
    byCategory: {},
    byGroup: new Map(),
    needSecondReader: 0,
    judgementCalls: 0,
  };
  for (const cand of ws.candidates) {
    if (cand.voided || (cycle !== undefined && cand.cycleNo !== cycle)) continue;
    c.candidates++;
    const d = ws.decisions.get(cand.id);
    if (!d) continue;
    c.decided++;
    if (d.judgement_call) c.judgementCalls++;
    if (d.decision === "flag") {
      c.flagged++;
      c.bySeverity[d.severity ?? "?"] = (c.bySeverity[d.severity ?? "?"] ?? 0) + 1;
      c.byCategory[d.category ?? "?"] = (c.byCategory[d.category ?? "?"] ?? 0) + 1;
      c.byGroup.set(d.target_group ?? "—", (c.byGroup.get(d.target_group ?? "—") ?? 0) + 1);
      if (d.needs_second_reader && !d.second_reader_confirmed) c.needSecondReader++;
    } else c.excluded++;
  }
  return c;
}

export const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
export function formatDay(value?: string | null) {
  if (!value) return "—";
  const d = new Date(value.length === 10 ? `${value}T00:00:00` : value);
  return Number.isNaN(d.getTime())
    ? value
    : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}
export function safeName(s: string) {
  return s.replace(/[^A-Za-z0-9._-]+/g, "_").slice(0, 80);
}

const PLATFORM: Record<string, string> = {
  facebook: "Facebook",
  fb: "Facebook",
  tiktok: "TikTok",
  x: "X",
  twitter: "X",
  threads: "Threads",
  instagram: "Instagram",
  youtube: "YouTube",
  telegram: "Telegram",
};
export const platformLabel = (p?: string | null) => (p ? (PLATFORM[p.toLowerCase()] ?? p) : "—");

/** The home vault (DarkNight): its source row and whether the gateway answers right now. */
export function useHomeVault() {
  const sources = useQuery(sourcesQuery);
  const source: Source | undefined = (sources.data ?? []).find((s) => s.kind === "home_vault");
  const health = useQuery({
    queryKey: ["home-vault-health", source?.id, source?.gateway_url, source?.enabled],
    enabled: !!source,
    refetchInterval: 30_000,
    retry: false,
    queryFn: () => source ? gatewayHealth(source) : Promise.resolve('offline' as const),
  });
  return {
    source,
    sources: sources.data ?? [],
    online: health.data === "online",
    state: health.data ?? "offline",
  };
}
