/**
 * Builds project outputs on the analyst's device.
 *
 * - dataset: CSV of included items, criteria results and file hashes
 * - report: Markdown skeleton from the brief, criteria and current numbers
 * - evidence bundle: ZIP of every file, each re-hashed against the hash recorded at
 *   capture or linking; home-vault files come straight from the gateway and the
 *   bundle is then never uploaded to the cloud
 * - dashboard: JSON snapshot of the live numbers at the moment of building
 *
 * Every output gets a SHA-256 the hub records against the output and the brief
 * version it answers.
 */
import { strToU8, zipSync, type Zippable } from "fflate";

import { supabase } from "@/integrations/supabase/client";
import { fetchDarkNightFile, sha256Hex } from "@/lib/darknight";
import {
  CRITERION_KIND_LABEL,
  RESULT_LABEL,
  itemVerdict,
  outputKindLabel,
  projectStats,
  safeName,
  type AssessmentResult,
  type CriterionKind,
  type OutputKind,
  type Workspace,
} from "@/lib/projects";

export type BuiltOutput = {
  blob: Blob;
  fileName: string;
  sha256: string;
  sizeBytes: number;
  itemCount: number;
  /** false when the file contains home-vault content and must not be uploaded */
  uploadable: boolean;
  params: Record<string, unknown>;
};

export type BuildProblem = { code: string; filename: string | null; reason: string };

export class BuildBlocked extends Error {
  constructor(readonly problems: BuildProblem[]) {
    super(`${problems.length} file${problems.length === 1 ? "" : "s"} could not be verified`);
  }
}

const csvCell = (v: unknown) => {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const csv = (rows: unknown[][]) => rows.map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";

function stamp(ws: Workspace, kind: OutputKind, ext: string, at: string) {
  return `${safeName(ws.project.code)}_${kind}_v${ws.current?.version ?? 0}_${at.slice(0, 10)}.${ext}`;
}

function baseParams(ws: Workspace, at: string) {
  return {
    built_at: at,
    brief_version: ws.current?.version ?? null,
    criteria: ws.criteria.map((c) => c.id),
  };
}

function includedItems(ws: Workspace, onlyIncluded: boolean) {
  const { latest } = projectStats(ws);
  return ws.items
    .filter((i) => i.linkId)
    .map((i) => ({ item: i, verdict: itemVerdict(i.linkId!, ws.criteria, latest) }))
    .filter((r) => !onlyIncluded || r.verdict === "included");
}

// ---- dataset ---------------------------------------------------------------------------
export function datasetRows(ws: Workspace, onlyIncluded: boolean) {
  const { latest } = projectStats(ws);
  const header = [
    "project",
    "brief_version",
    "verdict",
    "source",
    "case_id",
    "code",
    "platform",
    "item_type",
    "published_at",
    "author_handle",
    "file_sha256",
    ...ws.criteria.map((c) => `criterion_${c.position}_${safeName(c.label).toLowerCase()}`),
  ];
  const rows = includedItems(ws, onlyIncluded).map(({ item, verdict }) => [
    ws.project.code,
    ws.current?.version ?? "",
    verdict,
    item.sourceId,
    item.caseId ?? "",
    item.code,
    item.platform ?? "",
    item.itemType ?? "",
    item.publishedAt ?? "",
    item.author ?? "",
    [
      ...item.artefacts.map((a) => `${a.filename}:${a.sha256 ?? "none"}`),
      ...item.homeFiles.map((f) => `${f.filename ?? f.file_id}:${f.sha256 ?? "none"}`),
    ].join(" "),
    ...ws.criteria.map((c) => latest.get(`${item.linkId}:${c.id}`)?.result ?? "unassessed"),
  ]);
  return [header, ...rows];
}

export async function buildDataset(ws: Workspace, onlyIncluded = true): Promise<BuiltOutput> {
  const at = new Date().toISOString();
  const rows = datasetRows(ws, onlyIncluded);
  const bytes = strToU8(csv(rows));
  return {
    blob: new Blob([bytes], { type: "text/csv" }),
    fileName: stamp(ws, "dataset", "csv", at),
    sha256: await sha256Hex(bytes.buffer as ArrayBuffer),
    sizeBytes: bytes.byteLength,
    itemCount: rows.length - 1,
    uploadable: true,
    params: { ...baseParams(ws, at), only_included: onlyIncluded, columns: rows[0] },
  };
}

// ---- report skeleton -------------------------------------------------------------------
export function reportMarkdown(ws: Workspace, at: string) {
  const b = ws.current;
  const s = projectStats(ws);
  const lines: string[] = [
    `# ${ws.project.name}`,
    "",
    `**Client:** ${ws.client?.name ?? "—"}  `,
    `**Project:** ${ws.project.code}  `,
    `**Brief:** version ${b?.version ?? "—"}${b ? ` (${b.authored_at.slice(0, 10)})` : ""}  `,
    `**Prepared:** ${at.slice(0, 10)} — DRAFT built from the Evidence Hub`,
    "",
    "## Question",
    "",
    b?.question ?? "_No brief yet._",
    "",
  ];
  if (b?.background) lines.push("## Background", "", b.background, "");
  lines.push("## Scope", "");
  lines.push(b?.scope || "_Scope not set in the brief._", "");
  if (b?.out_of_scope) lines.push("**Out of scope:** " + b.out_of_scope, "");
  if (b?.period_from || b?.period_to)
    lines.push(`**Period:** ${b.period_from ?? "…"} to ${b.period_to ?? "…"}`, "");
  if (b?.platforms?.length) lines.push(`**Platforms:** ${b.platforms.join(", ")}`, "");
  lines.push("## Criteria", "", "| # | Type | Criterion | Required |", "| --- | --- | --- | --- |");
  for (const c of ws.criteria)
    lines.push(
      `| ${c.position} | ${CRITERION_KIND_LABEL[c.kind as CriterionKind] ?? c.kind} | ${c.label.replace(/\|/g, "/")} | ${c.required ? "Yes" : "No"} |`,
    );
  lines.push(
    "",
    "## Evidence reviewed",
    "",
    `${s.linkedCount} items linked from ${ws.cases.length} case${ws.cases.length === 1 ? "" : "s"} ` +
      `(${s.cloudCount} cloud vault, ${s.homeCount} home vault). ` +
      `${s.verdicts.included} meet the brief, ${s.verdicts.excluded} do not, ${s.verdicts.pending} still to assess.`,
    "",
    "| Criterion | Meets | Does not meet | Unclear | N/A | Not assessed |",
    "| --- | --- | --- | --- | --- | --- |",
    ...s.byCriterion.map(
      ({ criterion, counts }) =>
        `| ${criterion.label.replace(/\|/g, "/")} | ${counts.meets} | ${counts.does_not_meet} | ${counts.unclear} | ${counts.not_applicable} | ${counts.unassessed} |`,
    ),
    "",
    "## Findings",
    "",
    "_Write the findings here, one section per question or criterion. Cite items by code (e.g. DN-MF-000418, or the cloud item code) so every statement traces to evidence in the bundle._",
    "",
    "## Items that meet the brief",
    "",
    "| Code | Source | Platform | Published | Case |",
    "| --- | --- | --- | --- | --- |",
    ...includedItems(ws, true).map(
      ({ item }) =>
        `| ${item.code} | ${item.sourceId} | ${item.platform ?? "—"} | ${item.publishedAt?.slice(0, 10) ?? "—"} | ${item.caseId ?? "—"} |`,
    ),
    "",
    "## Method and integrity",
    "",
    "Evidence was captured and preserved in the Evidence Hub. Each file carries a SHA-256 hash recorded at capture (cloud vault) or at linking (home vault, DarkNight). Items were assessed against the criteria above; every assessment is kept, with the analyst and time, in the project log.",
    "",
    "## Limitations",
    "",
    "_State what was not covered, translation caveats, and any element crops relied on (these are not proof by themselves)._",
    "",
  );
  return lines.join("\n");
}

export async function buildReportSkeleton(ws: Workspace): Promise<BuiltOutput> {
  const at = new Date().toISOString();
  const bytes = strToU8(reportMarkdown(ws, at));
  return {
    blob: new Blob([bytes], { type: "text/markdown" }),
    fileName: stamp(ws, "report", "md", at),
    sha256: await sha256Hex(bytes.buffer as ArrayBuffer),
    sizeBytes: bytes.byteLength,
    itemCount: includedItems(ws, true).length,
    uploadable: true,
    params: { ...baseParams(ws, at), source: "skeleton" },
  };
}

// ---- dashboard snapshot ------------------------------------------------------------------
export async function buildDashboardSnapshot(ws: Workspace): Promise<BuiltOutput> {
  const at = new Date().toISOString();
  const s = projectStats(ws);
  const snapshot = {
    project: ws.project.code,
    brief_version: ws.current?.version ?? null,
    taken_at: at,
    items: { linked: s.linkedCount, cloud: s.cloudCount, home: s.homeCount, ...s.verdicts },
    by_criterion: s.byCriterion.map(({ criterion, counts }) => ({
      criterion: criterion.label,
      ...counts,
    })),
    by_platform: Object.fromEntries(s.byPlatform),
    by_month: Object.fromEntries(s.byMonth),
  };
  const bytes = strToU8(JSON.stringify(snapshot, null, 2));
  return {
    blob: new Blob([bytes], { type: "application/json" }),
    fileName: stamp(ws, "dashboard", "json", at),
    sha256: await sha256Hex(bytes.buffer as ArrayBuffer),
    sizeBytes: bytes.byteLength,
    itemCount: s.linkedCount,
    uploadable: true,
    params: { ...baseParams(ws, at), snapshot },
  };
}

// ---- evidence bundle --------------------------------------------------------------------
export async function buildEvidenceBundle(
  ws: Workspace,
  opts: { gatewayBase: string | null; onlyIncluded: boolean; handler: string },
  onProgress?: (done: number, total: number) => void,
): Promise<BuiltOutput> {
  const at = new Date().toISOString();
  const rows = includedItems(ws, opts.onlyIncluded);
  const root = `${safeName(ws.project.code)}_bundle_v${ws.current?.version ?? 0}`;
  const files: Zippable = {};
  const manifest: string[] = [];
  const problems: BuildProblem[] = [];
  const total = rows.reduce((n, r) => n + r.item.artefacts.length + r.item.homeFiles.length, 0);
  let done = 0;
  let homeFiles = 0;

  for (const { item } of rows) {
    const folder = `${root}/files/${safeName(item.caseId ?? "no-case")}/${safeName(item.code)}`;
    for (const a of item.artefacts) {
      try {
        const { data, error } = await supabase.storage.from("evidence").download(a.storage_path);
        if (error || !data) throw error ?? new Error("not found in storage");
        const buf = await data.arrayBuffer();
        const got = await sha256Hex(buf);
        if (!a.sha256)
          problems.push({
            code: item.code,
            filename: a.filename,
            reason: "no hash recorded at capture",
          });
        else if (got !== a.sha256)
          problems.push({
            code: item.code,
            filename: a.filename,
            reason: "hash does not match the capture record",
          });
        else {
          const path = `${folder}/${safeName(a.filename)}`;
          files[path] = new Uint8Array(buf);
          manifest.push(`${got}  ${path.slice(root.length + 1)}  source=cloud item=${item.code}`);
        }
      } catch (e) {
        problems.push({
          code: item.code,
          filename: a.filename,
          reason: e instanceof Error ? e.message : "could not be fetched",
        });
      }
      onProgress?.(++done, total);
    }
    for (const f of item.homeFiles) {
      if (!opts.gatewayBase) {
        problems.push({
          code: item.code,
          filename: f.filename,
          reason: "the home vault is offline",
        });
        onProgress?.(++done, total);
        continue;
      }
      try {
        const got = await fetchDarkNightFile(opts.gatewayBase, item.recordId!, f.file_id);
        if (!f.sha256 || got.sha256 !== f.sha256) {
          problems.push({
            code: item.code,
            filename: f.filename,
            reason: f.sha256
              ? "hash does not match the case record"
              : "no hash recorded at linking",
          });
        } else {
          const path = `${folder}/${safeName(f.filename ?? f.file_id)}`;
          files[path] = new Uint8Array(await got.blob.arrayBuffer());
          manifest.push(
            `${got.sha256}  ${path.slice(root.length + 1)}  source=${item.sourceId} record=${item.recordId}`,
          );
          homeFiles++;
        }
      } catch (e) {
        problems.push({
          code: item.code,
          filename: f.filename,
          reason: e instanceof Error ? e.message : "could not be fetched",
        });
      }
      onProgress?.(++done, total);
    }
  }
  if (problems.length) throw new BuildBlocked(problems);

  const b = ws.current;
  files[`${root}/brief.json`] = strToU8(
    JSON.stringify({ project: ws.project.code, client: ws.client?.name, brief: b }, null, 2),
  );
  files[`${root}/criteria.csv`] = strToU8(
    csv([
      ["position", "kind", "label", "description", "required", "weight"],
      ...ws.criteria.map((c) => [
        c.position,
        c.kind,
        c.label,
        c.description ?? "",
        c.required,
        c.weight ?? "",
      ]),
    ]),
  );
  files[`${root}/items.csv`] = strToU8(csv(datasetRows(ws, opts.onlyIncluded)));
  const linkIds = new Set(rows.map((r) => r.item.linkId));
  const critById = new Map(ws.allCriteria.map((c) => [c.id, c]));
  const codeByLink = new Map(ws.items.map((i) => [i.linkId, i.code]));
  files[`${root}/assessments.csv`] = strToU8(
    csv([
      ["assessed_at", "item", "criterion", "result", "note", "assessed_by"],
      ...ws.assessments
        .filter((a) => linkIds.has(a.project_item_id))
        .map((a) => [
          a.assessed_at,
          codeByLink.get(a.project_item_id) ?? a.project_item_id,
          critById.get(a.criterion_id)?.label ?? a.criterion_id,
          RESULT_LABEL[a.result as AssessmentResult] ?? a.result,
          a.note ?? "",
          a.assessed_by_name ?? a.assessed_by ?? "",
        ]),
    ]),
  );
  const manifestText = ["SHA-256  path  origin", ...manifest, ""].join("\n");
  files[`${root}/manifest.sha256`] = strToU8(manifestText);
  files[`${root}/README.md`] = strToU8(
    [
      `# Evidence bundle — ${ws.project.name}`,
      "",
      `Client: ${ws.client?.name ?? "—"}  `,
      `Project: ${ws.project.code}  `,
      `Brief: version ${b?.version ?? "—"}  `,
      `Built: ${at} (UTC) on the analyst's device by ${opts.handler}  `,
      `Items: ${rows.length}${opts.onlyIncluded ? " (those that meet the brief)" : " (all linked)"}; files: ${manifest.length}`,
      "",
      "Every file was fetched and re-hashed before packing; its SHA-256 matched the hash recorded when it was captured (cloud vault) or linked to its case (home vault). `manifest.sha256` lists every file. Check with:",
      "",
      "    sha256sum -c <(awk 'NR>1 && NF {print $1\"  \"$2}' manifest.sha256)",
      "",
      "`items.csv` has one row per item with its criteria results; `assessments.csv` has every assessment ever made, with who and when; `brief.json` and `criteria.csv` are the brief version this bundle answers.",
      "",
      "Files from the home vault were streamed from DarkNight to this device; the Evidence Hub keeps only this bundle's hash.",
      "",
      `Output type: ${outputKindLabel("evidence_bundle")}`,
      "",
    ].join("\n"),
  );
  const zip = zipSync(files, { level: 0, mtime: new Date(at) });
  return {
    blob: new Blob([zip], { type: "application/zip" }),
    fileName: stamp(ws, "evidence_bundle", "zip", at),
    sha256: await sha256Hex(zip.buffer as ArrayBuffer),
    sizeBytes: zip.byteLength,
    itemCount: rows.length,
    uploadable: homeFiles === 0,
    params: {
      ...baseParams(ws, at),
      only_included: opts.onlyIncluded,
      files: manifest.length,
      home_vault_files: homeFiles,
      manifest_sha256: await sha256Hex(strToU8(manifestText).buffer as ArrayBuffer),
    },
  };
}

export async function buildOutput(
  kind: OutputKind,
  ws: Workspace,
  opts: { gatewayBase: string | null; onlyIncluded: boolean; handler: string },
  onProgress?: (done: number, total: number) => void,
): Promise<BuiltOutput> {
  switch (kind) {
    case "dataset":
      return buildDataset(ws, opts.onlyIncluded);
    case "report":
      return buildReportSkeleton(ws);
    case "dashboard":
      return buildDashboardSnapshot(ws);
    case "evidence_bundle":
      return buildEvidenceBundle(ws, opts, onProgress);
  }
}

/** A file chosen by the analyst (e.g. the finished report) as the output's file. */
export async function attachFile(ws: Workspace, file: File): Promise<BuiltOutput> {
  const buf = await file.arrayBuffer();
  return {
    blob: file,
    fileName: file.name,
    sha256: await sha256Hex(buf),
    sizeBytes: file.size,
    itemCount: includedItems(ws, true).length,
    uploadable: true,
    params: { ...baseParams(ws, new Date().toISOString()), source: "attached" },
  };
}

export function outputStoragePath(ws: Workspace, outputId: string, fileName: string) {
  return `projects/${safeName(ws.project.code)}/outputs/${outputId}/${safeName(fileName)}`;
}

export function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
