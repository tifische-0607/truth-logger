/** Sample document types for checking the shared A4 layout. All content is labelled Sample. */
export const SAMPLE_KINDS = [
  { id: "case-report", label: "Case report", long: true },
  { id: "dossier", label: "Dossier", long: true },
  { id: "custody-report", label: "Custody report", long: true },
  { id: "export-manifest", label: "Export manifest", long: false },
  { id: "verification-report", label: "Verification report", long: false },
  { id: "executive-brief", label: "Executive brief", long: false },
  { id: "limits-statement", label: "Limits statement", long: false },
  { id: "release-log", label: "Release log", long: false },
  { id: "home-vault-bundle", label: "Home-vault bundle manifest", long: false },
  { id: "ew-briefing", label: "Early warning briefing (template placeholder)", long: false },
] as const;
export type SampleKind = (typeof SAMPLE_KINDS)[number]["id"];

/** Deterministic 64-hex sample hash (not a real fingerprint). */
export function sampleHash(seed: string) {
  let h = 2166136261;
  let out = "";
  for (let round = 0; out.length < 64; round++) {
    for (const ch of `${seed}:${round}`) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
    out += h.toString(16).padStart(8, "0");
  }
  return out.slice(0, 64);
}
