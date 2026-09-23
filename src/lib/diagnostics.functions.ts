import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type EndpointProbe = {
  name: string;
  path: string;
  ms: number;
  status: number | null;
  ok: boolean;
  note: string;
};

export type WorkerDiagnostics = {
  checkedAt: string;
  baseUrl: string;
  tokenConfigured: boolean;
  worker: {
    lastSeen: string | null;
    version: string | null;
    hostname: string | null;
    online: boolean;
  };
  probes: EndpointProbe[];
  errors: Array<{
    jobId: string;
    url: string;
    status: string;
    at: string;
    message: string;
  }>;
};

const ENDPOINTS = [
  "worker-heartbeat",
  "worker-claim",
  "worker-log",
  "worker-upload-url",
  "worker-ingest",
  "worker-complete",
];

/**
 * Probes each worker endpoint with a deliberately invalid bearer token.
 * A 401 proves the route is reachable and the auth check runs, without
 * causing any side effect (no heartbeat written, no job claimed).
 */
async function probe(baseUrl: string, name: string): Promise<EndpointProbe> {
  const path = `/api/public/${name}`;
  const started = Date.now();
  try {
    const res = await fetch(`${baseUrl}${path}`, {
      method: "POST",
      headers: {
        authorization: "Bearer diagnostics-probe-invalid-token",
        "content-type": "application/json",
      },
      body: "{}",
    });
    const ms = Date.now() - started;
    const ok = res.status === 401;
    return {
      name,
      path,
      ms,
      status: res.status,
      ok,
      note: ok
        ? "reachable, token check active"
        : res.status === 500
          ? "reachable, but WORKER_TOKEN is not configured"
          : `unexpected status ${res.status}`,
    };
  } catch (err) {
    return {
      name,
      path,
      ms: Date.now() - started,
      status: null,
      ok: false,
      note: err instanceof Error ? err.message : "request failed",
    };
  }
}

/** Only this app's own hosts may be probed — no arbitrary outbound requests. */
function isAllowedHost(hostname: string): boolean {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname.endsWith(".lovable.app") ||
    hostname.endsWith(".lovableproject.com")
  );
}

export const getWorkerDiagnostics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { baseUrl: string }) => {
    if (!data || typeof data.baseUrl !== "string") {
      throw new Error("baseUrl must be an absolute http(s) URL");
    }
    let url: URL;
    try {
      url = new URL(data.baseUrl);
    } catch {
      throw new Error("baseUrl must be an absolute http(s) URL");
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new Error("baseUrl must be an absolute http(s) URL");
    }
    if (!isAllowedHost(url.hostname)) {
      throw new Error("Diagnostics can only probe this app's own address.");
    }
    return { baseUrl: `${url.protocol}//${url.host}` };
  })

  .handler(async ({ data, context }): Promise<WorkerDiagnostics> => {
    const { baseUrl } = data;

    const [status, jobs, probes] = await Promise.all([
      context.supabase
        .from("worker_status")
        .select("last_seen, version, hostname")
        .eq("id", "worker")
        .maybeSingle(),
      context.supabase
        .from("capture_jobs")
        .select("id, url, status, warnings, log, updated_at")
        .in("status", ["failed"])
        .order("updated_at", { ascending: false })
        .limit(10),
      Promise.all(ENDPOINTS.map((name) => probe(baseUrl, name))),
    ]);

    const lastSeen = status.data?.last_seen ?? null;
    const online = lastSeen ? Date.now() - new Date(lastSeen).getTime() < 120_000 : false;

    const errors = (jobs.data ?? []).map((j) => ({
      jobId: j.id,
      url: j.url,
      status: j.status,
      at: j.updated_at,
      message:
        (j.warnings ?? []).slice(-1)[0] ??
        (j.log ?? []).slice(-1)[0] ??
        "Job failed with no log line",
    }));

    return {
      checkedAt: new Date().toISOString(),
      baseUrl,
      tokenConfigured: !probes.some((p) => p.status === 500),
      worker: {
        lastSeen,
        version: status.data?.version ?? null,
        hostname: status.data?.hostname ?? null,
        online,
      },
      probes,
      errors,
    };
  });
