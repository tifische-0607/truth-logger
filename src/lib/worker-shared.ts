export function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** Returns a Response when the caller is not the worker, otherwise null. */
export function checkWorkerToken(request: Request): Response | null {
  const expected = process.env["WORKER_TOKEN"];
  if (!expected) return jsonResponse({ error: "WORKER_TOKEN is not configured" }, 500);
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (token.length !== expected.length) return jsonResponse({ error: "Unauthorized" }, 401);
  let diff = 0;
  for (let i = 0; i < expected.length; i += 1) diff |= token.charCodeAt(i) ^ expected.charCodeAt(i);
  if (diff !== 0) return jsonResponse({ error: "Unauthorized" }, 401);
  return null;
}

export async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function readJson<T>(request: Request): Promise<T> {
  try {
    return (await request.json()) as T;
  } catch {
    throw new Error("Request body must be valid JSON");
  }
}
