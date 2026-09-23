import { zipSync, strToU8 } from "fflate";

import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type ArtefactRow = {
  id: string;
  filename: string;
  kind: string;
  storage_path: string;
  sha256: string | null;
  size_bytes: number | null;
  mime_type: string | null;
  captured_at: string;
  item_id: string;
};

export type ItemRow = {
  id: string;
  item_code: string;
  item_type: string;
  parent_item_id: string | null;
  url: string | null;
  author_name: string | null;
  author_handle: string | null;
  published_at: string | null;
  text_original: string | null;
  text_en: string | null;
  translator_statement: string | null;
  folder_path: string | null;
  captured_at: string;
  account_id: string;
};

export type ScopeData = {
  caseId: string;
  incidents: Array<{ id: string; incident_id: string; case_id: string; start_date: string | null }>;
  accounts: Array<{ id: string; handle: string; platform: string; incident_uuid: string }>;
  items: ItemRow[];
  artefacts: ArtefactRow[];
};

export type VerifyResult = {
  artefact_id: string;
  filename: string;
  storage_path: string;
  item_code: string;
  expected: string | null;
  actual: string | null;
  status: "MATCH" | "MISMATCH" | "MISSING" | "NO_BASELINE";
};

type SupabaseLike = typeof supabaseAdmin;

async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Load every item + artefact in a case, or a single item (and its children). */
export async function loadScope(
  db: SupabaseLike,
  scope: "case" | "item",
  id: string,
): Promise<ScopeData> {
  let caseId = id;
  let accountIds: string[] = [];
  let items: ItemRow[] = [];

  if (scope === "case") {
    const { data: incidents, error: incErr } = await db
      .from("incidents")
      .select("id, incident_id, case_id, start_date")
      .eq("case_id", id)
      .order("incident_id");
    if (incErr) throw new Error(incErr.message);

    const { data: accounts, error: accErr } = await db
      .from("accounts")
      .select("id, handle, platform, incident_uuid")
      .in("incident_uuid", (incidents ?? []).map((i) => i.id));
    if (accErr) throw new Error(accErr.message);
    accountIds = (accounts ?? []).map((a) => a.id);

    const { data: itemRows, error: itemErr } = await db
      .from("items")
      .select("*")
      .in("account_id", accountIds.length ? accountIds : ["00000000-0000-0000-0000-000000000000"])
      .order("item_code");
    if (itemErr) throw new Error(itemErr.message);
    items = (itemRows ?? []) as ItemRow[];

    const artefacts = await loadArtefacts(db, items.map((i) => i.id));
    return {
      caseId,
      incidents: incidents ?? [],
      accounts: accounts ?? [],
      items,
      artefacts,
    };
  }

  const { data: root, error: rootErr } = await db.from("items").select("*").eq("id", id).single();
  if (rootErr) throw new Error(rootErr.message);
  const { data: children } = await db.from("items").select("*").eq("parent_item_id", id);
  items = [root as ItemRow, ...((children ?? []) as ItemRow[])];
  accountIds = [...new Set(items.map((i) => i.account_id))];

  const { data: accounts } = await db
    .from("accounts")
    .select("id, handle, platform, incident_uuid")
    .in("id", accountIds);
  const { data: incidents } = await db
    .from("incidents")
    .select("id, incident_id, case_id, start_date")
    .in("id", [...new Set((accounts ?? []).map((a) => a.incident_uuid))]);
  caseId = incidents?.[0]?.case_id ?? "";

  const artefacts = await loadArtefacts(db, items.map((i) => i.id));
  return { caseId, incidents: incidents ?? [], accounts: accounts ?? [], items, artefacts };
}

async function loadArtefacts(db: SupabaseLike, itemIds: string[]): Promise<ArtefactRow[]> {
  if (!itemIds.length) return [];
  const { data, error } = await db
    .from("artefacts")
    .select("*")
    .in("item_id", itemIds)
    .order("filename");
  if (error) throw new Error(error.message);
  return (data ?? []) as ArtefactRow[];
}

/** Download every artefact, recompute SHA-256, write `re-hashed` custody events. */
export async function rehashArtefacts(
  scopeData: ScopeData,
  handler: string,
  opts: { writeEvents?: boolean; note?: string } = {},
): Promise<{ results: VerifyResult[]; bytes: Map<string, Uint8Array> }> {
  const itemById = new Map(scopeData.items.map((i) => [i.id, i]));
  const results: VerifyResult[] = [];
  const bytes = new Map<string, Uint8Array>();

  for (const artefact of scopeData.artefacts) {
    const item = itemById.get(artefact.item_id);
    let actual: string | null = null;
    let status: VerifyResult["status"] = "MISSING";

    const { data: blob, error } = await supabaseAdmin.storage
      .from("evidence")
      .download(artefact.storage_path);

    if (!error && blob) {
      const buf = await blob.arrayBuffer();
      bytes.set(artefact.id, new Uint8Array(buf));
      actual = await sha256Hex(buf);
      if (!artefact.sha256) status = "NO_BASELINE";
      else status = actual === artefact.sha256 ? "MATCH" : "MISMATCH";
    }

    results.push({
      artefact_id: artefact.id,
      filename: artefact.filename,
      storage_path: artefact.storage_path,
      item_code: item?.item_code ?? "—",
      expected: artefact.sha256,
      actual,
      status,
    });

    if (opts.writeEvents !== false) {
      await supabaseAdmin.from("custody_events").insert({
        artefact_id: artefact.id,
        item_id: artefact.item_id,
        filename: artefact.filename,
        sha256: actual ?? artefact.sha256,
        action: "re-hashed",
        handler,
        tool_version: "fb-evidence-monitor/verify",
        notes: `${status}${opts.note ? ` · ${opts.note}` : ""}${
          status === "MISMATCH" ? ` · recorded ${artefact.sha256} · recomputed ${actual}` : ""
        }`,
      });
    }
  }

  return { results, bytes };
}

function safe(part: string): string {
  return part.replace(/[^A-Za-z0-9._@-]+/g, "-");
}

/** 6-level folder layout path prefix for an item's artefacts. */
export function itemFolder(
  scopeData: ScopeData,
  item: ItemRow,
  parentByIdCode: Map<string, ItemRow>,
): string {
  const account = scopeData.accounts.find((a) => a.id === item.account_id);
  const incident = scopeData.incidents.find((i) => i.id === account?.incident_uuid);
  const date = (incident?.start_date ?? item.captured_at ?? "").slice(0, 10) || "undated";
  const base = [
    `CASE-${safe(scopeData.caseId || "unknown")}`,
    `INC-${safe(incident?.incident_id ?? "00")}_${date}`,
    `${safe(account?.platform ?? "FB")}_@${safe(account?.handle ?? "unknown")}`,
  ];
  if (item.item_type === "post") {
    return [...base, safe(item.item_code), "artefacts"].join("/");
  }
  const parent = item.parent_item_id ? parentByIdCode.get(item.parent_item_id) : undefined;
  const postCode = parent
    ? parent.item_type === "post"
      ? parent.item_code
      : (parentByIdCode.get(parent.parent_item_id ?? "")?.item_code ?? parent.item_code)
    : "POST-unknown";
  return [...base, safe(postCode), "comments", safe(item.item_code), "artefacts"].join("/");
}

function mdEscape(v: string | null | undefined): string {
  return (v ?? "—").replace(/\|/g, "\\|");
}

/** Build the export ZIP: artefacts in the 6-level layout, manifest.txt, custody logs. */
export async function buildBundle(
  scopeData: ScopeData,
  verify: VerifyResult[],
  bytes: Map<string, Uint8Array>,
  meta: { handler: string; recipient: string; purpose: string; generatedAt: string },
): Promise<{ zip: Uint8Array; fileCount: number }> {
  const files: Record<string, Uint8Array> = {};
  const itemById = new Map(scopeData.items.map((i) => [i.id, i]));
  const manifest: string[] = [];
  const byId = new Map(verify.map((v) => [v.artefact_id, v]));

  manifest.push(`FB EVIDENCE MONITOR — EXPORT MANIFEST`);
  manifest.push(`Case: ${scopeData.caseId}`);
  manifest.push(`Generated (UTC): ${meta.generatedAt}`);
  manifest.push(`Exported by: ${meta.handler}`);
  manifest.push(`Released to: ${meta.recipient}`);
  manifest.push(`Purpose: ${meta.purpose || "—"}`);
  manifest.push(`Artefacts: ${scopeData.artefacts.length}`);
  manifest.push("");
  manifest.push("SHA-256  path-in-bundle  (verification status)");
  manifest.push("".padEnd(78, "-"));

  for (const artefact of scopeData.artefacts) {
    const item = itemById.get(artefact.item_id);
    if (!item) continue;
    const folder = itemFolder(scopeData, item, itemById);
    const path = `${folder}/${safe(artefact.filename)}`;
    const data = bytes.get(artefact.id);
    if (data) files[path] = data;
    const v = byId.get(artefact.id);
    manifest.push(`${artefact.sha256 ?? "(no recorded hash)"}  ${path}   (${v?.status ?? "—"})`);
  }

  // Per-item text + metadata sidecars
  for (const item of scopeData.items) {
    const folder = itemFolder(scopeData, item, itemById).replace(/\/artefacts$/, "");
    const lines = [
      `# ${item.item_code} (${item.item_type})`,
      "",
      `- Source URL: ${item.url ?? "—"}`,
      `- Author: ${item.author_name ?? "—"} (@${item.author_handle ?? "—"})`,
      `- Published: ${item.published_at ?? "—"}`,
      `- Captured: ${item.captured_at}`,
      "",
      "## Original text",
      "",
      item.text_original ?? "—",
      "",
      "## English translation",
      "",
      item.text_en ?? "—",
      "",
      "## Translator statement",
      "",
      item.translator_statement ?? "—",
    ];
    files[`${folder}/${safe(item.item_code)}.md`] = strToU8(lines.join("\n"));
  }

  // Custody log as markdown
  const itemIds = scopeData.items.map((i) => i.id);
  const { data: events } = await supabaseAdmin
    .from("custody_events")
    .select("*")
    .in("item_id", itemIds.length ? itemIds : ["00000000-0000-0000-0000-000000000000"])
    .order("created_at", { ascending: true });

  const custody: string[] = [
    `# Chain of custody — case ${scopeData.caseId}`,
    "",
    `Generated ${meta.generatedAt} by ${meta.handler}. Released to ${meta.recipient}.`,
    "",
    "| Timestamp (UTC) | Item | Action | File | SHA-256 | Handler | Tool | Notes |",
    "| --- | --- | --- | --- | --- | --- | --- | --- |",
  ];
  for (const e of events ?? []) {
    const item = e.item_id ? itemById.get(e.item_id) : undefined;
    custody.push(
      `| ${e.created_at} | ${mdEscape(item?.item_code)} | ${mdEscape(e.action)} | ${mdEscape(
        e.filename,
      )} | \`${e.sha256 ?? "—"}\` | ${mdEscape(e.handler)} | ${mdEscape(e.tool_version)} | ${mdEscape(
        e.notes,
      )} |`,
    );
  }
  files["custody-log.md"] = strToU8(custody.join("\n"));

  const verifyLines = [
    `# Verification report — case ${scopeData.caseId}`,
    "",
    `Every artefact was downloaded from storage and re-hashed at ${meta.generatedAt} (UTC).`,
    "",
    "| Item | File | Recorded SHA-256 | Recomputed SHA-256 | Result |",
    "| --- | --- | --- | --- | --- |",
    ...verify.map(
      (v) =>
        `| ${v.item_code} | ${v.filename} | \`${v.expected ?? "—"}\` | \`${v.actual ?? "—"}\` | ${v.status} |`,
    ),
    "",
    "Images labelled RENDER are built from API data and are NOT platform screenshots.",
  ];
  files["verification-report.md"] = strToU8(verifyLines.join("\n"));
  files["manifest.txt"] = strToU8(manifest.join("\n"));

  const zip = zipSync(files, { level: 6 });
  return { zip, fileCount: Object.keys(files).length };
}

export async function uploadBundle(
  caseId: string,
  zip: Uint8Array,
): Promise<{ path: string; signedUrl: string }> {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const path = `exports/CASE-${safe(caseId || "unknown")}/bundle_${stamp}.zip`;
  const { error } = await supabaseAdmin.storage
    .from("evidence")
    .upload(path, zip as unknown as ArrayBufferView, {
      contentType: "application/zip",
      upsert: false,
    });
  if (error) throw new Error(`Could not store the bundle: ${error.message}`);
  const { data, error: signErr } = await supabaseAdmin.storage
    .from("evidence")
    .createSignedUrl(path, 3600);
  if (signErr || !data) throw new Error("Could not create a download link for the bundle.");
  return { path, signedUrl: data.signedUrl };
}
