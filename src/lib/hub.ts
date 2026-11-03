import type { Tables } from "@/integrations/supabase/types";
import { supabase } from "@/integrations/supabase/client";

export type Source = Tables<"sources">;
export type EvidenceRef = Tables<"evidence_refs">;
export function hubHead(
  title: string,
  description = "FridayAnalytics private evidence hub with projects, source references and verifiable custody.",
) {
  return {
    meta: [
      { title: `${title} — FA Portal` },
      { name: "description", content: description },
      { property: "og:title", content: `${title} — FA Portal` },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  };
}
export function hubDate(value?: string | null) {
  return value
    ? new Intl.DateTimeFormat("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        timeZone: "Asia/Kuala_Lumpur",
      }).format(new Date(value))
    : "—";
}
export async function currentAccess() {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) throw new Error("Sign in to continue");
  const { data: owner, error: roleError } = await supabase.rpc("has_role", {
    _user_id: user.id,
    _role: "owner",
  });
  if (roleError) throw roleError;
  return { userId: user.id, owner: Boolean(owner) };
}
export const sourcesQuery = {
  queryKey: ["hub-sources"],
  queryFn: async () => {
    const { data, error } = await supabase.from("sources").select("*").order("id");
    if (error) throw error;
    return data;
  },
};
export function safeName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").replace(/^\.+/, "_") || "file";
}
export async function sha256(bytes: Uint8Array) {
  const copy = new Uint8Array(bytes);
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", copy.buffer)), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}
export function validHash(hash?: string | null) {
  return /^[a-f0-9]{64}$/i.test(hash ?? "");
}
export function saveBytes(bytes: Uint8Array, filename: string, mime = "application/octet-stream") {
  const url = URL.createObjectURL(new Blob([new Uint8Array(bytes).buffer], { type: mime }));
  const a = document.createElement("a");
  a.href = url;
  a.download = safeName(filename);
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
export function csv(rows: unknown[][]) {
  return rows
    .map((row) => row.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(","))
    .join("\r\n");
}
