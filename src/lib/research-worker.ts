import { checkWorkerToken, jsonResponse, readJson } from "@/lib/worker-shared";

/**
 * Research worker API: one handler shape for every route. The service credential is the WORKER_TOKEN
 * server secret; every rule (scope, quarantine, counts, delivery) runs inside the database function.
 */
export function researchHandler<B>(run: (body: B, rpc: Rpc) => Promise<unknown>) {
  return async ({ request }: { request: Request }) => {
    const denied = checkWorkerToken(request);
    if (denied) return denied;
    let body: B;
    try {
      body = await readJson<B>(request);
    } catch (e) {
      return jsonResponse({ error: (e as Error).message }, 400);
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const rpc: Rpc = async (fn, args) => {
      const { data, error } = await (
        supabaseAdmin.rpc as unknown as (
          f: string,
          a: Record<string, unknown>,
        ) => Promise<{ data: unknown; error: { message: string } | null }>
      )(fn, args);
      if (error) throw new RefusedError(error.message);
      return data;
    };
    try {
      return jsonResponse(await run(body, rpc));
    } catch (e) {
      if (e instanceof RefusedError) return jsonResponse({ status: "refused", reason: e.message }, 409);
      return jsonResponse({ error: (e as Error).message }, 400);
    }
  };
}

export type Rpc = (fn: string, args: Record<string, unknown>) => Promise<unknown>;
class RefusedError extends Error {}

export function need(v: unknown, name: string): string {
  if (typeof v !== "string" || !v.trim()) throw new Error(`${name} is required`);
  return v;
}
