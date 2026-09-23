import { createFileRoute } from "@tanstack/react-router";

import { checkWorkerToken, jsonResponse, readJson } from "@/lib/worker-shared";

type Body = { path?: string; content_type?: string };

export const Route = createFileRoute("/api/public/worker-upload-url")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = checkWorkerToken(request);
        if (denied) return denied;

        const body = await readJson<Body>(request);
        const path = (body.path ?? "").replace(/^\/+/, "");
        if (!path) return jsonResponse({ error: "path is required" }, 400);
        if (path.includes("..")) return jsonResponse({ error: "path may not contain '..'" }, 400);

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const slash = path.lastIndexOf("/");
        const folder = slash === -1 ? "" : path.slice(0, slash);
        const filename = slash === -1 ? path : path.slice(slash + 1);
        const { data: existing } = await supabaseAdmin.storage
          .from("evidence")
          .list(folder, { search: filename, limit: 100 });
        if (existing?.some((entry) => entry.name === filename)) {
          return jsonResponse({ error: "Object already exists; refusing to overwrite", path }, 409);
        }

        const { data, error } = await supabaseAdmin.storage
          .from("evidence")
          .createSignedUploadUrl(path);
        if (error || !data) {
          return jsonResponse({ error: error?.message ?? "Could not create upload URL" }, 500);
        }

        return jsonResponse({
          bucket: "evidence",
          path,
          token: data.token,
          signed_url: data.signedUrl,
          content_type: body.content_type ?? "application/octet-stream",
          expires_in: 7200,
        });
      },
    },
  },
});
