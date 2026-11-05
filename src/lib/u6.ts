/** U6 methodology checkpoints: shared labels and display helpers. The database owns every rule. */
export const CHECKPOINTS = ["V1", "V2", "Q1", "Q2", "R", "C"] as const;
export type CheckpointId = (typeof CHECKPOINTS)[number];
export const CHECKPOINT_NAMES: Record<CheckpointId, string> = {
  V1: "Integrity", V2: "Verification", Q1: "Collection measures", Q2: "Reproducible counts", R: "Second review", C: "Curator release",
};
export const CONFIDENCE = ["Confirmed", "Probable", "Possible", "Unverified"] as const;
export type Confidence = (typeof CONFIDENCE)[number];
/** Mirrors the database rule: only Confirmed or Probable items may support a finding. */
export const canSupport = (c: string | null | undefined) => c === "Confirmed" || c === "Probable";

export const STANDARDS_NAMED = "the Berkeley Protocol on Digital Open Source Investigations, GIJN investigative practice and the SPJ Code of Ethics";
export const FA_STD_001_PLACEHOLDER = "[Placeholder: FA-STD-001 naming convention not yet decided]";
export const RETENTION_PLACEHOLDER = "[Placeholder: retention periods per evidence type not yet decided]";

export type StepState = "passed" | "failed" | "waiting" | "reopened";
/** One checkpoint step: passed only when every subject's latest result passed. */
export function stepState(latest: (string | null | undefined)[], expected: number): StepState {
  if (expected === 0 || latest.length === 0) return "waiting";
  if (latest.some((r) => r === "failed")) return "failed";
  if (latest.some((r) => r === "reopened")) return "reopened";
  if (latest.filter((r) => r === "passed").length >= expected) return "passed";
  return "waiting";
}

export function defaultStatement(standardVersion: number | null, sample: boolean) {
  return `This report was produced under the FridayAnalytics universal standard${standardVersion ? ` (version ${standardVersion}${sample ? ", Sample standard" : ""})` : ""}, which draws on ${STANDARDS_NAMED}. Every item cited was preserved with a SHA-256 hash and a custody record, verified for source, technical and content integrity, and rated for confidence. Only Confirmed or Probable items support findings; Possible or Unverified items appear only as labelled leads. Findings naming a person or organisation were approved by a second analyst. Item names follow FA-STD-001 ${FA_STD_001_PLACEHOLDER}. [Placeholder: statement wording to be approved by the Curator.]`;
}
