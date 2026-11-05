import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export type Requirement = Tables<"research_requirements">;
export type RegisterMark = Tables<"research_register_marks">;

export const BASELINE_PLATFORMS = [
  { id: "facebook", label: "Facebook" },
  { id: "google", label: "Google" },
  { id: "threads", label: "Threads" },
  { id: "x", label: "X" },
  { id: "instagram", label: "Instagram" },
  { id: "tiktok", label: "TikTok" },
] as const;

export const LANGUAGES = [
  { id: "ms", label: "Malay" },
  { id: "en", label: "English" },
  { id: "zh", label: "Chinese" },
  { id: "ta", label: "Tamil" },
  { id: "ar", label: "Arabic" },
  { id: "id", label: "Indonesian" },
  { id: "und", label: "Undetermined" },
] as const;

const PLATFORM_ALIAS: Record<string, string> = { twitter: "x", "x (twitter)": "x", fb: "facebook", ig: "instagram", youtube: "google" };
const LANGUAGE_ALIAS: Record<string, string> = {
  malay: "ms", "bahasa melayu": "ms", bm: "ms", english: "en", chinese: "zh", mandarin: "zh",
  tamil: "ta", arabic: "ar", indonesian: "id", "bahasa indonesia": "id",
};

/** Mirrors the database's brief wording to codes; used only to prefill the form. The database re-checks. */
export const normPlatform = (t: string) => { const k = t.trim().toLowerCase(); return PLATFORM_ALIAS[k] ?? k; };
export const normLanguage = (t: string) => { const k = t.trim().toLowerCase(); return LANGUAGE_ALIAS[k] ?? k; };

/** Latest version of each requirement number. */
export function inForce(rows: Requirement[]): Requirement[] {
  const m = new Map<number, Requirement>();
  for (const r of rows) { const cur = m.get(r.req_no); if (!cur || r.version > cur.version) m.set(r.req_no, r); }
  return [...m.values()].sort((a, b) => a.req_no - b.req_no);
}

export type RegisterStatus = {
  brief_signed: boolean;
  brief_id: string | null;
  brief_version: number | null;
  complete: boolean;
  problems: string[];
  register_sha256: string;
};

export function useRegister(projectId: string) {
  return useQuery({
    queryKey: ["research", "register", projectId],
    queryFn: async () => {
      const [rows, marks, status] = await Promise.all([
        supabase.from("research_requirements").select("*").eq("project_id", projectId).order("req_no").order("version"),
        supabase.from("research_register_marks").select("*").eq("project_id", projectId).order("marked_at", { ascending: false }),
        supabase.rpc("research_register_status", { _project: projectId }),
      ]);
      if (rows.error) throw rows.error;
      if (marks.error) throw marks.error;
      if (status.error) throw status.error;
      const st = status.data as unknown as RegisterStatus;
      let brief: Tables<"project_briefs"> | null = null;
      if (st.brief_id) {
        const b = await supabase.from("project_briefs").select("*").eq("id", st.brief_id).maybeSingle();
        brief = b.data ?? null;
      }
      return { all: rows.data ?? [], current: inForce(rows.data ?? []), marks: marks.data ?? [], status: st, brief };
    },
  });
}
