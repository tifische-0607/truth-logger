import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";

/** The cloud vault: Mac mini captures stored in this project. */
export const CLOUD_SOURCE_ID = "cloud";
/** The home vault: DarkNight, read live through the gateway on the home network. */
export const DARKNIGHT_SOURCE_ID = "darknight";

export type SourceKind = "cloud_vault" | "home_vault";

export type SourceRow = {
  id: string;
  name: string;
  kind: SourceKind;
  description: string | null;
  gateway_url: string | null;
  enabled: boolean;
};

export function useSources() {
  return useQuery({
    queryKey: ["sources"],
    queryFn: async (): Promise<SourceRow[]> => {
      const { data, error } = await supabase
        .from("sources")
        .select("id, name, kind, description, gateway_url, enabled")
        .order("kind");
      if (error) throw error;
      return (data ?? []) as SourceRow[];
    },
    staleTime: 60_000,
  });
}

export function useSource(id: string) {
  const sources = useSources();
  return { ...sources, source: sources.data?.find((s) => s.id === id) ?? null };
}

/** The handler name the analyst last used, shared with captures and verification. */
export function currentHandler(): string {
  if (typeof localStorage === "undefined") return "unknown";
  return localStorage.getItem("fbem.handler") ?? "unknown";
}

export type RefFile = {
  file_id: string;
  filename: string | null;
  kind: string | null;
  size_bytes: number | null;
  sha256: string | null;
};

export function refFiles(files: unknown): RefFile[] {
  return Array.isArray(files) ? (files as RefFile[]) : [];
}
