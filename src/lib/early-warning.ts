/** U7 early warning: labels and the level → channel rule (mirrors public.ew_level_channels in the database). */
export const SIGNALS = [
  { id: "volume_spike", label: "Volume spike" },
  { id: "call_to_gather", label: "Call to gather" },
  { id: "named_date_location", label: "Named date or location" },
  { id: "new_accounts", label: "New accounts joining a narrative" },
  { id: "coordinated_posting", label: "Coordinated posting" },
] as const;
export type SignalId = (typeof SIGNALS)[number]["id"];

export const LEVELS = ["watch", "warning", "urgent"] as const;
export type Level = (typeof LEVELS)[number];
export const LEVEL_LABEL: Record<Level, string> = { watch: "Watch", warning: "Warning", urgent: "Urgent" };

export const FRAMEWORKS = [
  { code: "RABAT", label: "UN Rabat Plan of Action (six-part threshold test)" },
  { code: "DSP", label: "Dangerous Speech Project markers" },
  { code: "UN-FAAC", label: "UN Framework of Analysis for Atrocity Crimes" },
] as const;

export type Channel = "portal" | "email" | "telegram";
export function levelChannels(level: Level): Channel[] {
  return level === "watch" ? ["portal"] : level === "warning" ? ["portal", "email"] : ["portal", "email", "telegram"];
}

export const THRESHOLD_NOT_SET = "Threshold not set";
export function thresholdWord(v: number | null | undefined): string {
  return v === null || v === undefined ? THRESHOLD_NOT_SET : String(v);
}

/** Same rule as the database: highest level whose threshold is set and reached; unset thresholds never fire. */
export function levelFor(score: number, thresholds: Partial<Record<Level, number | null>>): Level | null {
  for (const l of ["urgent", "warning", "watch"] as const) {
    const t = thresholds[l];
    if (t !== null && t !== undefined && score >= t) return l;
  }
  return null;
}

export const DISPATCH_STATE: Record<string, string> = {
  shown_in_portal: "Shown to analysts in the portal",
  held_channel_not_configured: "Held — channel not configured, nothing sent",
  no_recipients: "No recipients set",
};

/** Server secret names for each channel. Values are never read into the browser. */
export const CHANNEL_SECRETS: Record<"email" | "telegram", readonly string[]> = {
  email: ["EW_EMAIL_SENDER_DOMAIN"],
  telegram: ["TELEGRAM_API_KEY"],
};
