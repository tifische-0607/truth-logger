export const ENTRY_KINDS = [
  { id: "framework", label: "Framework" },
  { id: "standard", label: "Standard" },
  { id: "lexicon", label: "Lexicon" },
  { id: "indicators", label: "Indicator definitions" },
  { id: "thresholds", label: "Scoring thresholds" },
  { id: "glossary", label: "Glossary" },
] as const;

export const LEARNING_CATEGORIES = [
  { id: "definition", label: "Definition" },
  { id: "indicator", label: "Indicator" },
  { id: "risk_factor", label: "Risk factor" },
  { id: "scoring", label: "Scoring criterion" },
  { id: "lexicon_term", label: "Lexicon term" },
  { id: "method", label: "Method" },
] as const;

export const PROPOSALS = [
  { id: "strengthen", label: "Strengthen a rule" },
  { id: "add", label: "Add a rule" },
  { id: "conflict", label: "Flag a conflict" },
] as const;

export type VersionStatus = "pending" | "active" | "superseded" | "scheduled" | "rejected";
export const VERSION_STATUS: Record<VersionStatus, { label: string; dot: string }> = {
  pending: { label: "Awaiting Curator", dot: "bg-caution" },
  active: { label: "In force", dot: "bg-positive" },
  scheduled: { label: "Approved, not yet effective", dot: "bg-primary" },
  superseded: { label: "Superseded", dot: "bg-muted-foreground" },
  rejected: { label: "Rejected", dot: "bg-negative" },
};

/** The extraction step is replaceable; with no service set it is "Not configured". No outside connection is opened. */
export function extractionState(env: Record<string, string | undefined>): { outcome: "not_configured" | "not_attempted"; message: string } {
  if (!env["FRAMEWORK_EXTRACTION_SERVICE"])
    return { outcome: "not_configured", message: "Not configured. Record learnings by hand below." };
  return { outcome: "not_attempted", message: "An extraction service is set but was not contacted: outside connections are not allowed yet. Record learnings by hand below." };
}

export const kindLabel = (k: string) => (k === "universal_standard" ? "Universal standard" : ENTRY_KINDS.find((x) => x.id === k)?.label ?? k);
