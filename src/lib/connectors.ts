/** Connector certification checks. Keys must match public.research_certify_connector's required list. */
export const CERT_CHECKS = [
  { key: "public_only", label: "Collects publicly accessible content only" },
  { key: "within_brief", label: "Collects only within the signed brief and its legal basis" },
  { key: "no_deception", label: "No deception, fake accounts or unlawful access to private groups" },
  { key: "standard_capture_shape", label: "Sends the one standard capture shape" },
  { key: "sha256_at_capture", label: "Hashes every artefact with SHA-256 at capture" },
  { key: "utc_time", label: "Records capture time in UTC" },
  { key: "requirement_bound", label: "Every capture carries an approved requirement ID" },
  { key: "quarantine_rules", label: "Passes quarantine, validation and rejection-limit tests" },
] as const;
