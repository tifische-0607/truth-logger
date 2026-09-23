import { createFileRoute } from "@tanstack/react-router";

import { checkWorkerToken, jsonResponse, readJson, sha256Hex } from "@/lib/worker-shared";

type ArtefactIn = {
  filename: string;
  kind: string;
  storage_path: string;
  sha256?: string;
  size_bytes?: number;
  mime_type?: string;
  captured_at?: string;
};

type CustodyIn = {
  filename?: string;
  sha256?: string;
  action: string;
  handler?: string;
  tool_version?: string;
  notes?: string;
};

type SubjectProfileIn = {
  subject_type: "poster" | "commenter";
  stated?: Record<string, unknown>;
  observed?: Record<string, unknown>;
  insufficient_data?: boolean;
};

type ItemIn = {
  item_code: string;
  item_type: "post" | "comment" | "reply";
  parent_item_code?: string | null;
  url?: string;
  platform_item_id?: string;
  author_name?: string;
  author_handle?: string;
  author_url?: string;
  published_at?: string;
  text_original?: string;
  text_en?: string;
  translator_statement?: string;
  engagement?: Record<string, unknown>;
  captured_at?: string;
  folder_path?: string;
  subject_profile?: SubjectProfileIn;
  artefacts?: ArtefactIn[];
  custody_events?: CustodyIn[];
};

type Body = {
  job_id?: string;
  records?: {
    case?: Record<string, unknown> & { id: string };
    incident?: Record<string, unknown> & { incident_id: string };
    account?: Record<string, unknown> & { handle: string };
    account_snapshot?: Record<string, unknown>;
    items?: ItemIn[];
  };
};

/** Copy only the fields the worker is allowed to set; unknown keys are dropped. */
function pick<T extends Record<string, unknown>>(source: unknown, keys: readonly string[]): T {
  const out: Record<string, unknown> = {};
  if (source && typeof source === "object") {
    for (const key of keys) {
      const value = (source as Record<string, unknown>)[key];
      if (value !== undefined) out[key] = value;
    }
  }
  return out as T;
}

const CASE_FIELDS = [
  "id",
  "opened_on",
  "target_of_complaint",
  "offence_alleged",
  "jurisdiction_agency",
  "lead_handler",
  "status",
  "related_cases",
  "notes",
] as const;
const INCIDENT_FIELDS = [
  "incident_id",
  "start_date",
  "end_date",
  "narrative_themes",
  "escalation_stage",
  "summary",
] as const;
const ACCOUNT_FIELDS = ["platform", "handle", "display_name", "profile_url", "platform_id"] as const;
const SNAPSHOT_FIELDS = [
  "display_name",
  "followers",
  "following",
  "verified",
  "bio_verbatim",
  "created",
  "captured_at",
] as const;

function fail(stage: string, detail: unknown) {
  console.error(`worker-ingest ${stage} failed:`, detail);
  return jsonResponse({ error: `Could not save ${stage}. Check the worker log.` }, 500);
}

export const Route = createFileRoute("/api/public/worker-ingest")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = checkWorkerToken(request);
        if (denied) return denied;

        const body = await readJson<Body>(request);
        const records = body.records;
        if (!body.job_id) return jsonResponse({ error: "job_id is required" }, 400);
        if (!records?.case?.id) return jsonResponse({ error: "records.case.id is required" }, 400);
        if (!records.incident?.incident_id) {
          return jsonResponse({ error: "records.incident.incident_id is required" }, 400);
        }
        if (!records.account?.handle) {
          return jsonResponse({ error: "records.account.handle is required" }, 400);
        }

        const db = (await import("@/integrations/supabase/client.server")).supabaseAdmin;
        const sb = db as unknown as {
          from: (t: string) => any;
          storage: { from: (b: string) => any };
        };

        // 1. case
        const { error: caseErr } = await sb
          .from("cases")
          .upsert(pick(records.case, CASE_FIELDS), { onConflict: "id" });
        if (caseErr) return fail("the case", caseErr);

        // 2. incident
        const { data: incident, error: incErr } = await sb
          .from("incidents")
          .upsert(
            { ...pick(records.incident, INCIDENT_FIELDS), case_id: records.case.id },
            { onConflict: "case_id,incident_id" },
          )
          .select("id")
          .single();
        if (incErr) return fail("the incident", incErr);

        // 3. account + snapshot (snapshots are append-only by convention)
        const { data: account, error: acctErr } = await sb
          .from("accounts")
          .upsert(
            { platform: "FB", ...pick(records.account, ACCOUNT_FIELDS), incident_uuid: incident.id },
            { onConflict: "incident_uuid,platform,handle" },
          )
          .select("id")
          .single();
        if (acctErr) return fail("the account", acctErr);

        if (records.account_snapshot) {
          const { error } = await sb
            .from("account_snapshots")
            .insert({ ...pick(records.account_snapshot, SNAPSHOT_FIELDS), account_id: account.id });
          if (error) return fail("the account snapshot", error);
        }

        // 4. items — parents before children
        const incoming = records.items ?? [];
        const order = { post: 0, comment: 1, reply: 2 } as const;
        const sorted = [...incoming].sort((a, b) => order[a.item_type] - order[b.item_type]);

        const codeToId = new Map<string, string>();
        const { data: existingItems } = await sb
          .from("items")
          .select("id, item_code")
          .eq("account_id", account.id);
        for (const row of existingItems ?? []) codeToId.set(row.item_code, row.id);

        const insertedArtefacts: { id: string; path: string; sha: string | null; name: string; item: string }[] =
          [];

        for (const item of sorted) {
          const parentId = item.parent_item_code
            ? (codeToId.get(item.parent_item_code) ?? null)
            : null;
          const row = {
            account_id: account.id,
            item_code: item.item_code,
            item_type: item.item_type,
            parent_item_id: parentId,
            url: item.url ?? null,
            platform_item_id: item.platform_item_id ?? null,
            author_name: item.author_name ?? null,
            author_handle: item.author_handle ?? null,
            author_url: item.author_url ?? null,
            published_at: item.published_at ?? null,
            text_original: item.text_original ?? null,
            text_en: item.text_en ?? null,
            translator_statement: item.translator_statement ?? null,
            engagement: item.engagement ?? {},
            captured_at: item.captured_at ?? new Date().toISOString(),
            folder_path: item.folder_path ?? null,
          };
          const { data: saved, error } = await sb
            .from("items")
            .upsert(row, { onConflict: "account_id,item_code" })
            .select("id")
            .single();
          if (error) return fail(`item ${item.item_code}`, error);
          codeToId.set(item.item_code, saved.id);

          if (item.subject_profile) {
            const { error: spErr } = await sb.from("subject_profiles").insert({
              item_id: saved.id,
              account_id: account.id,
              subject_type: item.subject_profile.subject_type,
              stated: item.subject_profile.stated ?? {},
              observed: item.subject_profile.observed ?? {},
              insufficient_data: item.subject_profile.insufficient_data ?? false,
            });
            if (spErr) return fail("the subject profile", spErr);
          }

          for (const artefact of item.artefacts ?? []) {
            const { data: savedArtefact, error: aErr } = await sb
              .from("artefacts")
              .insert({
                item_id: saved.id,
                filename: artefact.filename,
                kind: artefact.kind,
                storage_path: artefact.storage_path,
                sha256: artefact.sha256 ?? null,
                size_bytes: artefact.size_bytes ?? null,
                mime_type: artefact.mime_type ?? null,
                captured_at: artefact.captured_at ?? new Date().toISOString(),
              })
              .select("id")
              .single();
            if (aErr) return fail(`artefact ${artefact.filename}`, aErr);
            insertedArtefacts.push({
              id: savedArtefact.id,
              path: artefact.storage_path,
              sha: artefact.sha256 ?? null,
              name: artefact.filename,
              item: saved.id,
            });
          }

          for (const event of item.custody_events ?? []) {
            const { error: cErr } = await sb.from("custody_events").insert({
              item_id: saved.id,
              filename: event.filename ?? null,
              sha256: event.sha256 ?? null,
              action: event.action,
              handler: event.handler ?? null,
              tool_version: event.tool_version ?? null,
              notes: event.notes ?? null,
            });
            if (cErr) return fail("the custody event", cErr);
          }
        }

        // 5. re-hash every newly inserted artefact straight from storage
        const verification: { filename: string; result: string; sha256: string | null }[] = [];
        for (const artefact of insertedArtefacts) {
          let result = "MISSING";
          let actual: string | null = null;
          const { data: file } = await sb.storage.from("evidence").download(artefact.path);
          if (file) {
            actual = await sha256Hex(await file.arrayBuffer());
            result = artefact.sha ? (actual === artefact.sha ? "MATCH" : "MISMATCH") : "RECORDED";
          }
          verification.push({ filename: artefact.name, result, sha256: actual });

          await sb.from("custody_events").insert({
            artefact_id: artefact.id,
            item_id: artefact.item,
            filename: artefact.name,
            sha256: actual ?? artefact.sha,
            action: "transferred",
            handler: "mac-mini-worker",
            notes: `uploaded from Mac mini worker, hash ${result}`,
          });
        }

        const primaryItem = sorted.find((i) => i.item_type === "post") ?? sorted[0];
        const primaryItemId = primaryItem ? (codeToId.get(primaryItem.item_code) ?? null) : null;

        return jsonResponse({
          ok: true,
          job_id: body.job_id,
          case_id: records.case.id,
          incident_uuid: incident.id,
          account_id: account.id,
          item_id: primaryItemId,
          items: Object.fromEntries(codeToId),
          artefacts_inserted: insertedArtefacts.length,
          verification,
        });
      },
    },
  },
});
