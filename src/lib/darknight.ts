/**
 * Client for the DarkNight gateway (see GATEWAY_API.md).
 *
 * The browser talks to the gateway directly over Tailscale, so home-vault
 * content never passes through or is stored in the cloud. Only references
 * (record id + SHA-256 per file) are written to the hub's database, and only
 * when an analyst links a record to a case.
 */
import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { DARKNIGHT_SOURCE_ID, currentHandler, useSource, type SourceRow } from "@/lib/sources";

export type GatewayState = "not_configured" | "online" | "degraded" | "offline";

export type GatewayHealth = {
  state: GatewayState;
  version?: string | undefined;
  checks?: { database: boolean; nas: boolean } | undefined;
  checkedAt: string;
  error?: string | undefined;
};

export type DarkNightSummary = {
  record_id: string;
  record_code: string;
  platform: string | null;
  item_type: string | null;
  author_handle: string | null;
  published_at: string | null;
  collected_at: string | null;
  snippet: string | null;
  classification: string | null;
  file_count: number | null;
};

export type DarkNightFile = {
  file_id: string;
  filename: string | null;
  kind: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  created_at: string | null;
  sha256_stored: string | null;
  sha256: string | null;
  available: boolean;
};

export type DarkNightRecord = DarkNightSummary & {
  author_url: string | null;
  url: string | null;
  collected_by: string | null;
  text_original: string | null;
  language: string | null;
  text_en: string | null;
  translator_statement: string | null;
  location: string | null;
  outcome: string | null;
  extra: Record<string, unknown> | null;
  files: DarkNightFile[];
};

export type HomeCustodyEntry = {
  at: string;
  action: string;
  handler?: string;
  file_id?: string;
  filename?: string;
  sha256?: string | null;
  status?: string;
};

export class GatewayError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export function gatewayBase(source: SourceRow | null | undefined): string | null {
  if (!source?.enabled || !source.gateway_url) return null;
  return source.gateway_url.replace(/\/+$/, "");
}

async function accessToken(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new GatewayError("Sign in again to reach the home vault.", 401);
  return token;
}

async function gatewayFetch(base: string, path: string, init: RequestInit = {}): Promise<Response> {
  const token = await accessToken();
  let res: Response;
  try {
    res = await fetch(`${base}${path}`, {
      ...init,
      headers: { ...(init.headers ?? {}), Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
  } catch {
    throw new GatewayError(
      "Can't reach DarkNight. Check that this device is on Tailscale and the Mac Studio is awake.",
      0,
    );
  }
  if (!res.ok) {
    let detail = res.statusText;
    try {
      detail = ((await res.json()) as { detail?: string }).detail ?? detail;
    } catch {
      /* not JSON */
    }
    throw new GatewayError(detail, res.status);
  }
  return res;
}

export async function checkGateway(base: string | null): Promise<GatewayHealth> {
  const checkedAt = new Date().toISOString();
  if (!base) return { state: "not_configured", checkedAt };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6000);
  try {
    const res = await fetch(`${base}/health`, { signal: controller.signal, cache: "no-store" });
    const body = (await res.json()) as GatewayHealth & { ok: boolean };
    return {
      state: body.ok ? "online" : "degraded",
      version: body.version,
      checks: body.checks,
      checkedAt,
    };
  } catch (e) {
    return { state: "offline", checkedAt, error: e instanceof Error ? e.message : String(e) };
  } finally {
    clearTimeout(timer);
  }
}

/** Live state of the DarkNight gateway, re-checked every 30 seconds. */
export function useDarkNight() {
  const { source, isLoading } = useSource(DARKNIGHT_SOURCE_ID);
  const base = gatewayBase(source);
  const health = useQuery({
    queryKey: ["darknight-health", base],
    queryFn: () => checkGateway(base),
    enabled: !isLoading,
    refetchInterval: 30_000,
    retry: false,
  });
  const state: GatewayState = health.data?.state ?? (base ? "offline" : "not_configured");
  return {
    source,
    base,
    health: health.data,
    state,
    online: state === "online",
    isChecking: isLoading || health.isFetching,
    recheck: () => health.refetch(),
  };
}

export async function searchDarkNight(
  base: string,
  params: {
    q?: string | undefined;
    platform?: string | undefined;
    item_type?: string | undefined;
    date_from?: string | undefined;
    date_to?: string | undefined;
    limit?: number | undefined;
  },
): Promise<{ results: DarkNightSummary[]; next_offset: number | null }> {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params))
    if (v !== undefined && v !== "") qs.set(k, String(v));
  const res = await gatewayFetch(base, `/v1/search?${qs.toString()}`);
  return (await res.json()) as { results: DarkNightSummary[]; next_offset: number | null };
}

export async function getDarkNightRecord(base: string, recordId: string): Promise<DarkNightRecord> {
  const res = await gatewayFetch(base, `/v1/records/${encodeURIComponent(recordId)}`);
  return (await res.json()) as DarkNightRecord;
}

export async function rehashDarkNightRecord(base: string, recordId: string) {
  const res = await gatewayFetch(base, `/v1/records/${encodeURIComponent(recordId)}/rehash`, {
    method: "POST",
  });
  return (await res.json()) as {
    record_id: string;
    results: { file_id: string; filename: string | null; sha256: string | null; status: string }[];
  };
}

export async function getHomeCustody(base: string, recordId: string): Promise<HomeCustodyEntry[]> {
  const res = await gatewayFetch(base, `/v1/records/${encodeURIComponent(recordId)}/custody`);
  return ((await res.json()) as { entries: HomeCustodyEntry[] }).entries;
}

export async function sha256Hex(buffer: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export type FetchedFile = {
  blob: Blob;
  /** Hash of the bytes this device actually received. */
  sha256: string;
  /** Hash the gateway reported for the file on the NAS. */
  gatewaySha256: string | null;
};

/** Downloads a file straight from the gateway and re-hashes it on this device. */
export async function fetchDarkNightFile(
  base: string,
  recordId: string,
  fileId: string,
  opts: { download?: boolean | undefined } = {},
): Promise<FetchedFile> {
  const path = `/v1/records/${encodeURIComponent(recordId)}/files/${encodeURIComponent(fileId)}${
    opts.download ? "?download=1" : ""
  }`;
  const res = await gatewayFetch(base, path);
  const buffer = await res.arrayBuffer();
  const type = res.headers.get("content-type") ?? "application/octet-stream";
  return {
    blob: new Blob([buffer], { type }),
    sha256: await sha256Hex(buffer),
    gatewaySha256: res.headers.get("x-evidence-sha256"),
  };
}

/**
 * Records a custody event in the hub for a home-vault item that is linked to a case.
 * Unlinked records are logged only in the home custody log, by the gateway.
 */
export async function logHomeVaultEvent(input: {
  evidenceRefId: string;
  action: "accessed" | "re-hashed" | "linked" | "exported";
  filename?: string | null;
  sha256?: string | null;
  notes?: string;
}) {
  const { error } = await supabase.from("custody_events").insert({
    action: input.action,
    source_id: DARKNIGHT_SOURCE_ID,
    evidence_ref_id: input.evidenceRefId,
    filename: input.filename ?? null,
    sha256: input.sha256 ?? null,
    handler: currentHandler(),
    tool_version: "evidence-hub-web",
    notes: input.notes ?? null,
  });
  if (error) throw error;
}

export function platformLabel(platform: string | null | undefined): string {
  if (!platform) return "Unknown platform";
  const map: Record<string, string> = {
    fb: "Facebook",
    facebook: "Facebook",
    tiktok: "TikTok",
    instagram: "Instagram",
    ig: "Instagram",
    threads: "Threads",
    youtube: "YouTube",
    yt: "YouTube",
    telegram: "Telegram",
    x: "X",
  };
  return map[platform.toLowerCase()] ?? platform;
}

export function classificationLabel(value: string | null | undefined): string | null {
  if (!value) return null;
  return value.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}
