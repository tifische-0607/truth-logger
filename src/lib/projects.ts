/**
 * Clients and projects: data access and labels.
 *
 * A project draws on the shared evidence pool by linking cases and items, never by
 * copying them. Its brief is versioned; criteria belong to a brief version; every
 * output records the version it answers. See the migration
 * 20261102090000_evidence_hub_clients_projects.sql for the rules the database enforces.
 */
import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { refFiles, type RefFile } from "@/lib/sources";

export type Client = Tables<"clients">;
export type Project = Tables<"projects">;
export type Brief = Tables<"project_briefs">;
export type Criterion = Tables<"project_criteria">;
export type Member = Tables<"project_members">;
export type ProjectOutput = Tables<"project_outputs">;
export type ProjectEvent = Tables<"project_events">;
export type Assessment = Tables<"project_assessments">;

export type OutputKind = "evidence_bundle" | "report" | "dashboard" | "dataset";
export type OutputStatus = "draft" | "in_review" | "approved" | "delivered" | "withdrawn";
export type MemberRole = "lead" | "analyst" | "reviewer" | "client_viewer";
export type CriterionKind = "inclusion" | "exclusion" | "assessment" | "threshold";
export type AssessmentResult = "meets" | "does_not_meet" | "unclear" | "not_applicable";

export const OUTPUT_KINDS: { id: OutputKind; label: string; blurb: string }[] = [
  {
    id: "evidence_bundle",
    label: "Evidence bundle",
    blurb: "ZIP of the included files, re-hashed, with manifest, criteria and assessments.",
  },
  {
    id: "report",
    label: "Report or brief",
    blurb: "Written analysis. Start from a skeleton built from the brief, then attach the final.",
  },
  {
    id: "dashboard",
    label: "Live dashboard",
    blurb: "The project's live numbers by criterion, platform and month; snapshot on approval.",
  },
  {
    id: "dataset",
    label: "Dataset export",
    blurb: "CSV of included items with their criteria results and file hashes.",
  },
];

export const outputKindLabel = (k: string) => OUTPUT_KINDS.find((o) => o.id === k)?.label ?? k;

export const OUTPUT_STATUS_LABEL: Record<OutputStatus, string> = {
  draft: "Draft",
  in_review: "In review",
  approved: "Approved",
  delivered: "Delivered",
  withdrawn: "Withdrawn",
};

export const OUTPUT_STATUS_STYLE: Record<OutputStatus, string> = {
  draft: "bg-muted text-foreground",
  in_review: "bg-queued text-queued-foreground",
  approved: "bg-secondary text-secondary-foreground",
  delivered: "bg-done text-done-foreground",
  withdrawn: "bg-failed text-failed-foreground",
};

export const PROJECT_STATUS: { id: string; label: string }[] = [
  { id: "scoping", label: "Scoping" },
  { id: "active", label: "Active" },
  { id: "paused", label: "Paused" },
  { id: "delivered", label: "Delivered" },
  { id: "closed", label: "Closed" },
];
export const projectStatusLabel = (s: string) => PROJECT_STATUS.find((p) => p.id === s)?.label ?? s;

export const ROLE_LABEL: Record<MemberRole, string> = {
  lead: "Lead",
  analyst: "Analyst",
  reviewer: "Reviewer",
  client_viewer: "Client viewer",
};

export const CRITERION_KIND_LABEL: Record<CriterionKind, string> = {
  inclusion: "Include if",
  exclusion: "Exclude if",
  assessment: "Assess",
  threshold: "Threshold",
};

export const RESULT_LABEL: Record<AssessmentResult, string> = {
  meets: "Meets",
  does_not_meet: "Does not meet",
  unclear: "Unclear",
  not_applicable: "N/A",
};
export const RESULT_STYLE: Record<AssessmentResult, string> = {
  meets: "bg-done text-done-foreground",
  does_not_meet: "bg-failed text-failed-foreground",
  unclear: "bg-queued text-queued-foreground",
  not_applicable: "bg-muted text-muted-foreground",
};

// ---- who am I ------------------------------------------------------------------------
export type Me = { uid: string | null; isOwner: boolean; isInvestigator: boolean; name: string };

export function useMe() {
  return useQuery({
    queryKey: ["me"],
    staleTime: 60_000,
    queryFn: async (): Promise<Me> => {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id ?? null;
      if (!uid) return { uid: null, isOwner: false, isInvestigator: false, name: "" };
      const [{ data: roles }, { data: profile }] = await Promise.all([
        supabase.from("user_roles").select("role").eq("user_id", uid),
        supabase.from("profiles").select("display_name, email").eq("id", uid).maybeSingle(),
      ]);
      return {
        uid,
        isOwner: (roles ?? []).some((r) => r.role === "owner"),
        isInvestigator: (roles ?? []).length > 0,
        name: profile?.display_name || profile?.email || auth.user?.email || "",
      };
    },
  });
}

// ---- lists -----------------------------------------------------------------------------
export type ProjectListRow = Project & {
  clients: Pick<Client, "id" | "code" | "name"> | null;
  project_outputs: Pick<ProjectOutput, "id" | "status">[] | null;
  project_cases: { case_id: string }[] | null;
  project_items: { id: string }[] | null;
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
            "*, clients(id, code, name), project_outputs(id, status), project_cases(case_id), project_items(id)",
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

/** Projects the signed-in user can add evidence to (lead or analyst, or owner). */
export function useWorkableProjects(enabled = true) {
  return useQuery({
    queryKey: ["workable-projects"],
    enabled,
    queryFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      const { data, error } = await supabase
        .from("projects")
        .select("id, code, name, status, clients(code, name), project_members(user_id, role)")
        .in("status", ["scoping", "active", "paused"])
        .order("code");
      if (error) throw error;
      const { data: roles } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", uid ?? "");
      const owner = (roles ?? []).some((r) => r.role === "owner");
      type Row = {
        id: string;
        code: string;
        name: string;
        status: string;
        clients: { code: string; name: string } | null;
        project_members: { user_id: string; role: string }[] | null;
      };
      return ((data ?? []) as unknown as Row[]).filter(
        (p) =>
          owner ||
          (p.project_members ?? []).some(
            (m) => m.user_id === uid && (m.role === "lead" || m.role === "analyst"),
          ),
      );
    },
  });
}

// ---- one project -----------------------------------------------------------------------
export type CloudArtefact = {
  id: string;
  filename: string;
  kind: string;
  sha256: string | null;
  size_bytes: number | null;
  mime_type: string | null;
  storage_path: string;
};

export type PoolItem = {
  /** project_items.id when linked */
  linkId: string | null;
  kind: "cloud_item" | "home_ref";
  /** items.id or evidence_refs.id */
  refId: string;
  code: string;
  caseId: string | null;
  sourceId: string;
  platform: string | null;
  itemType: string | null;
  author: string | null;
  publishedAt: string | null;
  snippet: string | null;
  artefacts: CloudArtefact[];
  homeFiles: RefFile[];
  /** for home refs: the gateway record id */
  recordId: string | null;
};

export type Workspace = {
  project: Project;
  client: Client | null;
  briefs: Brief[];
  current: Brief | null;
  criteria: Criterion[];
  allCriteria: Criterion[];
  members: (Member & { name: string; email: string | null })[];
  cases: { case_id: string; note: string | null; linked_at: string; target: string | null }[];
  items: PoolItem[];
  assessments: Assessment[];
  outputs: ProjectOutput[];
  events: ProjectEvent[];
  role: string | null;
  canManage: boolean;
  canWork: boolean;
};

type CloudItemRow = {
  id: string;
  item_code: string;
  item_type: string;
  author_handle: string | null;
  published_at: string | null;
  text_original: string | null;
  accounts: { platform: string; incidents: { case_id: string } | null } | null;
  artefacts: CloudArtefact[] | null;
};
type HomeRefRow = {
  id: string;
  case_id: string;
  source_id: string;
  record_id: string;
  record_code: string;
  platform: string | null;
  item_type: string | null;
  published_at: string | null;
  note: string | null;
  files: unknown;
};

const ITEM_SELECT =
  "id, item_code, item_type, author_handle, published_at, text_original, accounts(platform, incidents(case_id)), artefacts(id, filename, kind, sha256, size_bytes, mime_type, storage_path)";

export function cloudToPool(r: CloudItemRow, linkId: string | null): PoolItem {
  return {
    linkId,
    kind: "cloud_item",
    refId: r.id,
    code: r.item_code,
    caseId: r.accounts?.incidents?.case_id ?? null,
    sourceId: "cloud",
    platform: r.accounts?.platform ?? null,
    itemType: r.item_type,
    author: r.author_handle,
    publishedAt: r.published_at,
    snippet: r.text_original ? r.text_original.slice(0, 200) : null,
    artefacts: r.artefacts ?? [],
    homeFiles: [],
    recordId: null,
  };
}

export function homeToPool(r: HomeRefRow, linkId: string | null): PoolItem {
  return {
    linkId,
    kind: "home_ref",
    refId: r.id,
    code: r.record_code,
    caseId: r.case_id,
    sourceId: r.source_id,
    platform: r.platform,
    itemType: r.item_type,
    author: null,
    publishedAt: r.published_at,
    snippet: r.note,
    artefacts: [],
    homeFiles: refFiles(r.files),
    recordId: r.record_id,
  };
}

export function useProjectWorkspace(projectId: string) {
  return useQuery({
    queryKey: ["project", projectId],
    queryFn: async (): Promise<Workspace> => {
      const pid = projectId;
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id ?? null;
      const [
        project,
        briefs,
        criteria,
        members,
        cases,
        links,
        assessments,
        outputs,
        events,
        role,
        manage,
        work,
      ] = await Promise.all([
        supabase.from("projects").select("*, clients(*)").eq("id", pid).maybeSingle(),
        supabase
          .from("project_briefs")
          .select("*")
          .eq("project_id", pid)
          .order("version", { ascending: false }),
        supabase.from("project_criteria").select("*").eq("project_id", pid).order("position"),
        supabase.from("project_members").select("*").eq("project_id", pid),
        supabase
          .from("project_cases")
          .select("case_id, note, linked_at, cases(target_of_complaint)")
          .eq("project_id", pid)
          .order("linked_at"),
        supabase.from("project_items").select("*").eq("project_id", pid),
        supabase
          .from("project_assessments")
          .select("*")
          .eq("project_id", pid)
          .order("assessed_at", { ascending: true }),
        supabase
          .from("project_outputs")
          .select("*")
          .eq("project_id", pid)
          .order("created_at", { ascending: false }),
        supabase
          .from("project_events")
          .select("*")
          .eq("project_id", pid)
          .order("at", { ascending: false })
          .limit(200),
        supabase.rpc("project_role", { _user_id: uid ?? "", _project_id: pid }),
        supabase.rpc("can_manage_project", { _user_id: uid ?? "", _project_id: pid }),
        supabase.rpc("can_work_project", { _user_id: uid ?? "", _project_id: pid }),
      ]);
      for (const r of [
        project,
        briefs,
        criteria,
        members,
        cases,
        links,
        assessments,
        outputs,
        events,
      ]) {
        if (r.error) throw r.error;
      }
      if (!project.data) throw new Error("Project not found, or you are not on its team.");

      const linkRows = links.data ?? [];
      const cloudIds = linkRows.filter((l) => l.item_id).map((l) => l.item_id as string);
      const homeIds = linkRows
        .filter((l) => l.evidence_ref_id)
        .map((l) => l.evidence_ref_id as string);
      const memberIds = (members.data ?? []).map((m) => m.user_id);
      const [cloudItems, homeRefs, profiles] = await Promise.all([
        cloudIds.length
          ? supabase.from("items").select(ITEM_SELECT).in("id", cloudIds)
          : Promise.resolve({ data: [], error: null }),
        homeIds.length
          ? supabase.from("evidence_refs").select("*").in("id", homeIds)
          : Promise.resolve({ data: [], error: null }),
        memberIds.length
          ? supabase.from("profiles").select("id, display_name, email").in("id", memberIds)
          : Promise.resolve({ data: [], error: null }),
      ]);
      if (cloudItems.error) throw cloudItems.error;
      if (homeRefs.error) throw homeRefs.error;
      const linkByRef = new Map<string, string>();
      for (const l of linkRows) linkByRef.set((l.item_id ?? l.evidence_ref_id) as string, l.id);
      const items: PoolItem[] = [
        ...((cloudItems.data ?? []) as unknown as CloudItemRow[]).map((r) =>
          cloudToPool(r, linkByRef.get(r.id) ?? null),
        ),
        ...((homeRefs.data ?? []) as unknown as HomeRefRow[]).map((r) =>
          homeToPool(r, linkByRef.get(r.id) ?? null),
        ),
      ].sort((a, b) => String(b.publishedAt ?? "").localeCompare(String(a.publishedAt ?? "")));

      const allBriefs = briefs.data ?? [];
      const current = allBriefs[0] ?? null;
      const allCriteria = criteria.data ?? [];
      const prof = new Map((profiles.data ?? []).map((p) => [p.id, p]));
      const proj = project.data as unknown as Project & { clients: Client | null };
      const { clients: client, ...projectRow } = proj;
      return {
        project: projectRow as Project,
        client,
        briefs: allBriefs,
        current,
        criteria: current ? allCriteria.filter((c) => c.brief_id === current.id) : [],
        allCriteria,
        members: (members.data ?? []).map((m) => ({
          ...m,
          name: prof.get(m.user_id)?.display_name || prof.get(m.user_id)?.email || "Unknown user",
          email: prof.get(m.user_id)?.email ?? null,
        })),
        cases: (
          (cases.data ?? []) as unknown as {
            case_id: string;
            note: string | null;
            linked_at: string;
            cases: { target_of_complaint: string | null } | null;
          }[]
        ).map((c) => ({
          case_id: c.case_id,
          note: c.note,
          linked_at: c.linked_at,
          target: c.cases?.target_of_complaint ?? null,
        })),
        items,
        assessments: assessments.data ?? [],
        outputs: outputs.data ?? [],
        events: events.data ?? [],
        role: (role.data as string | null) ?? null,
        canManage: Boolean(manage.data),
        canWork: Boolean(work.data),
      };
    },
  });
}

/** Items in the linked cases that could be added to the project. */
export function useProjectPool(caseIds: string[], enabled: boolean) {
  return useQuery({
    queryKey: ["project-pool", [...caseIds].sort().join(",")],
    enabled: enabled && caseIds.length > 0,
    queryFn: async (): Promise<PoolItem[]> => {
      const [cloud, home] = await Promise.all([
        supabase
          .from("items")
          .select(
            "id, item_code, item_type, author_handle, published_at, text_original, accounts!inner(platform, incidents!inner(case_id)), artefacts(id, filename, kind, sha256, size_bytes, mime_type, storage_path)",
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
        ...((cloud.data ?? []) as unknown as CloudItemRow[]).map((r) => cloudToPool(r, null)),
        ...((home.data ?? []) as unknown as HomeRefRow[]).map((r) => homeToPool(r, null)),
      ];
    },
  });
}

// ---- derived ----------------------------------------------------------------------------
/** Latest result per (project item, criterion). */
export function latestResults(assessments: Assessment[]) {
  const map = new Map<string, Assessment>();
  for (const a of assessments) map.set(`${a.project_item_id}:${a.criterion_id}`, a);
  return map;
}

export type ItemVerdict = "included" | "excluded" | "pending";

/**
 * An item is included when every required inclusion criterion is met and no
 * exclusion criterion is met; excluded when a required inclusion fails or an
 * exclusion is met; otherwise pending.
 */
export function itemVerdict(
  linkId: string,
  criteria: Criterion[],
  latest: Map<string, Assessment>,
): ItemVerdict {
  let pending = false;
  for (const c of criteria) {
    const r = latest.get(`${linkId}:${c.id}`)?.result as AssessmentResult | undefined;
    if (c.kind === "exclusion" && r === "meets") return "excluded";
    if ((c.kind === "inclusion" || c.required) && c.kind !== "exclusion") {
      if (r === "does_not_meet") return "excluded";
      if (!r || r === "unclear") pending = true;
    }
  }
  return pending ? "pending" : "included";
}

export function projectStats(ws: Workspace) {
  const latest = latestResults(ws.assessments);
  const linked = ws.items.filter((i) => i.linkId);
  const verdicts = { included: 0, excluded: 0, pending: 0 };
  for (const i of linked) verdicts[itemVerdict(i.linkId!, ws.criteria, latest)]++;
  const byCriterion = ws.criteria.map((c) => {
    const counts: Record<AssessmentResult | "unassessed", number> = {
      meets: 0,
      does_not_meet: 0,
      unclear: 0,
      not_applicable: 0,
      unassessed: 0,
    };
    for (const i of linked) {
      const r = latest.get(`${i.linkId}:${c.id}`)?.result as AssessmentResult | undefined;
      counts[r ?? "unassessed"]++;
    }
    return { criterion: c, counts };
  });
  const byPlatform = new Map<string, number>();
  const byMonth = new Map<string, number>();
  for (const i of linked) {
    byPlatform.set(i.platform ?? "unknown", (byPlatform.get(i.platform ?? "unknown") ?? 0) + 1);
    const m = i.publishedAt ? i.publishedAt.slice(0, 7) : "undated";
    byMonth.set(m, (byMonth.get(m) ?? 0) + 1);
  }
  return {
    latest,
    linkedCount: linked.length,
    cloudCount: linked.filter((i) => i.kind === "cloud_item").length,
    homeCount: linked.filter((i) => i.kind === "home_ref").length,
    verdicts,
    byCriterion,
    byPlatform: [...byPlatform.entries()].sort((a, b) => b[1] - a[1]),
    byMonth: [...byMonth.entries()].sort((a, b) => a[0].localeCompare(b[0])),
  };
}

export function safeName(s: string) {
  return s.replace(/[^A-Za-z0-9._-]+/g, "_").slice(0, 80);
}

/** "15 Dec 2026" for date-only values (no time of day). */
export function formatDay(value?: string | null) {
  if (!value) return "—";
  const d = new Date(value.length === 10 ? `${value}T00:00:00` : value);
  return Number.isNaN(d.getTime())
    ? value
    : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

/** "Oct 2026" for a YYYY-MM key. */
export function formatMonth(key: string) {
  if (!/^\d{4}-\d{2}$/.test(key)) return key;
  return new Date(`${key}-01T00:00:00`).toLocaleDateString("en-GB", {
    month: "short",
    year: "numeric",
  });
}

export const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
