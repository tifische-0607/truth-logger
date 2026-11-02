/**
 * Builds engagement outputs on the analyst's device and records their hashes.
 * Every document carries the attribution line. Findings are counts, verbatim quotes and
 * limits from FA's own data: no inference, no single sentiment score.
 */
import { strToU8, zipSync, type Zippable } from "fflate";

import { supabase } from "@/integrations/supabase/client";
import { fetchDarkNightFile, sha256Hex } from "@/lib/darknight";
import {
  ATTRIBUTION,
  CATEGORIES,
  SEVERITIES,
  countsFor,
  formatDay,
  safeName,
  tierLabel,
  type Candidate,
  type OutputKind,
  type Workspace,
} from "@/lib/projects";

export type Built = {
  blob: Blob;
  fileName: string;
  sha256: string;
  sizeBytes: number;
  itemCount: number;
  uploadable: boolean;
  params: Record<string, unknown>;
};
export class BuildBlocked extends Error {
  constructor(readonly problems: { code: string; filename: string | null; reason: string }[]) {
    super(`${problems.length} file(s) could not be verified`);
  }
}

const csvCell = (v: unknown) => {
  const t = v == null ? "" : String(v);
  return /[",\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
};
const csv = (rows: unknown[][]) => rows.map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
const stamp = (ws: Workspace, kind: string, ext: string, at: string) =>
  `${safeName(ws.project.code)}_${kind}_${at.slice(0, 10)}.${ext}`;
const reportAs = (cat: string | null) => CATEGORIES.find((c) => c.id === cat)?.reportAs ?? "—";
const flagged = (ws: Workspace, cycles?: number[]) =>
  ws.candidates.filter(
    (c) =>
      !c.voided &&
      ws.decisions.get(c.id)?.decision === "flag" &&
      (!cycles?.length || cycles.includes(c.cycleNo)),
  );

async function done(
  ws: Workspace,
  kind: OutputKind,
  ext: string,
  mime: string,
  text: string,
  items: number,
  params: Record<string, unknown> = {},
): Promise<Built> {
  const at = new Date().toISOString();
  const bytes = strToU8(text);
  return {
    blob: new Blob([bytes], { type: mime }),
    fileName: stamp(ws, kind, ext, at),
    sha256: await sha256Hex(bytes.buffer as ArrayBuffer),
    sizeBytes: bytes.byteLength,
    itemCount: items,
    uploadable: true,
    params: { built_at: at, brief_version: ws.briefInForce?.version ?? null, ...params },
  };
}

export function datasetRows(ws: Workspace, cycles?: number[]) {
  const head = [
    "project",
    "brief_version",
    "cycle",
    "source",
    "case_id",
    "code",
    "platform",
    "published_at",
    "author_handle",
    "category",
    "report_as",
    "severity",
    "target_group",
    "note",
    "second_reader_confirmed",
    "evidence_tier",
    "proof",
    "file_sha256",
  ];
  const rows = flagged(ws, cycles).map((c) => {
    const d = ws.decisions.get(c.id)!;
    const t = ws.tiers.get(c.id);
    return [
      ws.project.code,
      ws.briefInForce?.version ?? "",
      c.cycleNo,
      c.sourceId,
      c.caseId ?? "",
      c.code,
      c.platform ?? "",
      c.publishedAt ?? "",
      c.author ?? "",
      d.category,
      reportAs(d.category),
      d.severity,
      d.target_group,
      d.note,
      d.needs_second_reader ? (d.second_reader_confirmed ? "yes" : "NO") : "n/a",
      t?.tier ?? "none",
      t?.tier === "FA_STD_001_V2" ? "yes" : "no",
      [
        ...c.artefacts.map((a) => `${a.filename}:${a.sha256 ?? "none"}`),
        ...c.homeFiles.map((f) => `${f.filename ?? f.file_id}:${f.sha256 ?? "none"}`),
      ].join(" "),
    ];
  });
  return [head, ...rows];
}

export const buildDataset = (ws: Workspace, cycles?: number[]) =>
  done(ws, "dataset", "csv", "text/csv", csv(datasetRows(ws, cycles)), flagged(ws, cycles).length, {
    cycles,
  });

export function findingsCsv(ws: Workspace, cycles?: number[]) {
  const f = flagged(ws, cycles);
  const out: unknown[][] = [];
  const grid = (
    title: string,
    rowKey: (c: Candidate) => string,
    colKey: (c: Candidate) => string,
    cols: string[],
  ) => {
    out.push([title]);
    out.push(["", ...cols, "Total"]);
    const rows = [...new Set(f.map(rowKey))].sort();
    for (const r of rows) {
      const row = f.filter((c) => rowKey(c) === r);
      out.push([r, ...cols.map((k) => row.filter((c) => colKey(c) === k).length), row.length]);
    }
    out.push([]);
  };
  const sev = (c: Candidate) => ws.decisions.get(c.id)!.severity ?? "";
  const cat = (c: Candidate) => ws.decisions.get(c.id)!.category ?? "";
  const sevs = SEVERITIES.map((s) => s.id);
  grid(
    "Category by severity (incitement to violence kept apart from harassment)",
    (c) => `${reportAs(cat(c))} · ${cat(c)}`,
    sev,
    sevs,
  );
  grid("Target group by severity", (c) => ws.decisions.get(c.id)!.target_group ?? "—", sev, sevs);
  grid("Account by severity", (c) => c.author ?? "—", sev, sevs);
  const months = [...new Set(f.map((c) => (c.publishedAt ?? "undated").slice(0, 7)))].sort();
  grid(
    "Over time (month published) by severity",
    (c) => (c.publishedAt ?? "undated").slice(0, 7),
    sev,
    sevs,
  );
  out.push([
    "Note",
    "No single sentiment score is published. Counts are of items an analyst flagged; hostile comments are quoted verbatim in the executive brief.",
    months.length ? "" : "",
  ]);
  return csv(out);
}
export const buildFindingsTables = (ws: Workspace, cycles?: number[]) =>
  done(
    ws,
    "findings_tables",
    "csv",
    "text/csv",
    findingsCsv(ws, cycles),
    flagged(ws, cycles).length,
    { cycles },
  );

export function limitsMd(ws: Workspace, cycles?: number[]) {
  const live = ws.candidates.filter(
    (c) => !c.voided && (!cycles?.length || cycles.includes(c.cycleNo)),
  );
  const f = flagged(ws, cycles);
  const tierCount = (t: string) => f.filter((c) => ws.tiers.get(c.id)?.tier === t).length;
  const noTier = f.filter((c) => !ws.tiers.get(c.id)).length;
  const held = live.filter(
    (c) => ws.decisions.get(c.id)?.exclusion_code === "OUT_OF_MANDATE_HELD",
  ).length;
  const mt = live.filter((c) => c.translation).length;
  const d = ws.design;
  return [
    `# Limits statement — ${ws.project.name}`,
    "",
    `Engagement ${ws.project.code}. Brief v${ws.briefInForce?.version ?? "—"}.`,
    "",
    "## Sampling",
    `- Sample rule: ${d?.sample_rule ?? "not set"}.`,
    `- Comment cap: ${d ? `${d.comment_cap} per post, ${d.comment_order}` : "not set"}. Comments beyond the cap on a busy post were not seen.`,
    `- Lexicon ${d?.lexicon_version ?? "—"}; items outside it were not screened.`,
    "",
    "## Evidence",
    `- Flagged items: ${f.length}. At FA-STD-001 V2 (proof): ${tierCount("FA_STD_001_V2")}.`,
    `- Still at API raw only: ${tierCount("API_RAW_ONLY")}; browser DOM only: ${tierCount("BROWSER_DOM_ONLY")}; element crop: ${tierCount("ELEMENT_CROP")}; no tier yet: ${noTier}. These are not proof.`,
    `- Flagged items not yet captured: ${f.filter((c) => !ws.captures.some((x) => x.project_item_id === c.id)).length}.`,
    "",
    "## Reading",
    `- Candidates read: ${live.filter((c) => ws.decisions.has(c.id)).length} of ${live.length}.`,
    `- CRITICAL or HIGH flags confirmed by a second reader: ${
      f.filter((c) => {
        const x = ws.decisions.get(c.id)!;
        return x.needs_second_reader && x.second_reader_confirmed;
      }).length
    } of ${f.filter((c) => ws.decisions.get(c.id)!.needs_second_reader).length}.`,
    `- Items held as out-of-mandate for the Curator: ${held}.`,
    "",
    "## Translation",
    `- ${mt} comment(s) carry a machine translation that no person has reviewed. The verbatim original is the record.`,
    "",
    "## Other gaps",
    "- API gaps, uncaptured posts and targets that could not be reached: list them here before release.",
    "- Private-group content and anything outside the mandate was not collected.",
    "",
    "---",
    ATTRIBUTION,
    "",
  ].join("\n");
}
export const buildLimits = (ws: Workspace, cycles?: number[]) =>
  done(ws, "limits_statement", "md", "text/markdown", limitsMd(ws, cycles), 0, { cycles });

export function briefMd(ws: Workspace, cycles?: number[]) {
  const b = ws.briefInForce;
  const c = countsFor(ws);
  const f = flagged(ws, cycles);
  const top = f
    .filter((x) => ["CRITICAL", "HIGH"].includes(ws.decisions.get(x.id)!.severity ?? ""))
    .slice(0, 10);
  const rq = (k: string) =>
    ws.entries.filter((e) => e.entry_kind === "research_question" && e.ref_key === k).pop();
  return [
    `# Executive brief — ${ws.project.name}`,
    "",
    `${ws.client?.name ?? ""} · ${ws.project.code} · brief v${b?.version ?? "—"} · ${formatDay(new Date().toISOString())} · DRAFT`,
    "",
    "## Scope",
    `- Platforms: ${b?.platforms.join(", ") || "—"}; languages: ${b?.languages.join(", ") || "—"}.`,
    `- Window: ${formatDay(b?.window_from)} to ${formatDay(b?.window_to)}. Sample: ${b?.sample_rule ?? "—"}; caps: ${b?.caps ?? "—"}.`,
    "",
    "## Volumes",
    `- Candidates read: ${c.decided} of ${c.candidates}. Flagged: ${c.flagged}. Excluded with a reason: ${c.excluded}.`,
    "",
    "## Flagged items by severity and category",
    "| | " + SEVERITIES.map((s) => s.id).join(" | ") + " |",
    "| --- |" + SEVERITIES.map(() => " --- |").join(""),
    ...CATEGORIES.map(
      (cat) =>
        `| ${cat.id} (${cat.reportAs}) | ` +
        SEVERITIES.map(
          (s) =>
            f.filter((x) => {
              const d = ws.decisions.get(x.id)!;
              return d.category === cat.id && d.severity === s.id;
            }).length,
        ).join(" | ") +
        " |",
    ),
    "",
    "## Top items, quoted verbatim",
    ...top.map((x) => {
      const d = ws.decisions.get(x.id)!;
      return `- **${x.code}** (${d.severity}, ${d.category}; ${x.platform ?? "—"}; ${formatDay(x.publishedAt)}; tier: ${tierLabel(ws.tiers.get(x.id)?.tier)}) — “${(x.text ?? "").replace(/\n/g, " ")}”${x.url ? ` — ${x.url}` : ""}`;
    }),
    top.length ? "" : "_None at CRITICAL or HIGH._",
    "",
    "## Research questions",
    ...ws.rqs.map(
      (r) =>
        `- **${r.rq_no}** ${r.question}\n  ${rq(r.rq_no)?.finding ?? "_Answer from FA's own data._"}`,
    ),
    "",
    "## Success measures",
    ...ws.measures.map(
      (m) =>
        `- **${m.measure_no}** (${m.level}) ${m.measure}${m.observable ? ` — baseline ${m.baseline}; target ${m.target}` : " — out of reach, not estimated"}${m.client_figure ? " [client figure]" : ""}`,
    ),
    "",
    "## Scenario watch",
    ...ws.scenarios.map(
      (s) =>
        `- **${s.scenario_no} ${s.name}** — triggers: ${s.trigger_indicators}; threshold: ${s.threshold}. _State whether met, with counts and the evidence tier._`,
    ),
    "",
    "## Limits",
    "See the limits statement.",
    "",
    "---",
    ATTRIBUTION,
    "",
  ].join("\n");
}
export const buildBrief = (ws: Workspace, cycles?: number[]) =>
  done(
    ws,
    "executive_brief",
    "md",
    "text/markdown",
    briefMd(ws, cycles),
    flagged(ws, cycles).length,
    { cycles, source: "skeleton" },
  );

export async function buildDashboard(ws: Workspace) {
  const c = countsFor(ws);
  const snap = {
    project: ws.project.code,
    taken_at: new Date().toISOString(),
    brief_version: ws.briefInForce?.version ?? null,
    candidates: c.candidates,
    decided: c.decided,
    flagged: c.flagged,
    excluded: c.excluded,
    by_severity: c.bySeverity,
    by_category: c.byCategory,
    by_group: Object.fromEntries(c.byGroup),
    attribution: ATTRIBUTION,
  };
  return done(
    ws,
    "dashboard",
    "json",
    "application/json",
    JSON.stringify(snap, null, 2),
    c.flagged,
    { snapshot: snap },
  );
}

export async function buildBundle(
  ws: Workspace,
  gatewayBase: string | null,
  handler: string,
  cycles?: number[],
  progress?: (d: number, t: number) => void,
): Promise<Built> {
  const at = new Date().toISOString();
  const items = flagged(ws, cycles);
  const root = `${safeName(ws.project.code)}_evidence`;
  const files: Zippable = {};
  const manifest: string[] = [];
  const problems: { code: string; filename: string | null; reason: string }[] = [];
  const total = items.reduce((n, i) => n + i.artefacts.length + i.homeFiles.length, 0);
  let n = 0;
  let home = 0;
  for (const it of items) {
    const dir = `${root}/files/${safeName(it.caseId ?? "no-case")}/${safeName(it.code)}`;
    for (const a of it.artefacts) {
      try {
        const { data, error } = await supabase.storage.from("evidence").download(a.storage_path);
        if (error || !data) throw error ?? new Error("not found");
        const buf = await data.arrayBuffer();
        const got = await sha256Hex(buf);
        if (!a.sha256)
          problems.push({
            code: it.code,
            filename: a.filename,
            reason: "no hash recorded at capture",
          });
        else if (got !== a.sha256)
          problems.push({
            code: it.code,
            filename: a.filename,
            reason: "hash does not match the capture record",
          });
        else {
          const p = `${dir}/${safeName(a.filename)}`;
          files[p] = new Uint8Array(buf);
          manifest.push(`${got}  ${p.slice(root.length + 1)}  source=cloud item=${it.code}`);
        }
      } catch (e) {
        problems.push({
          code: it.code,
          filename: a.filename,
          reason: e instanceof Error ? e.message : "could not be fetched",
        });
      }
      progress?.(++n, total);
    }
    for (const f of it.homeFiles) {
      if (!gatewayBase)
        problems.push({ code: it.code, filename: f.filename, reason: "the home vault is offline" });
      else
        try {
          const got = await fetchDarkNightFile(gatewayBase, it.recordId!, f.file_id);
          if (!f.sha256 || got.sha256 !== f.sha256)
            problems.push({
              code: it.code,
              filename: f.filename,
              reason: f.sha256
                ? "hash does not match the case record"
                : "no hash recorded at linking",
            });
          else {
            const p = `${dir}/${safeName(f.filename ?? f.file_id)}`;
            files[p] = new Uint8Array(await got.blob.arrayBuffer());
            manifest.push(
              `${got.sha256}  ${p.slice(root.length + 1)}  source=${it.sourceId} record=${it.recordId}`,
            );
            home++;
          }
        } catch (e) {
          problems.push({
            code: it.code,
            filename: f.filename,
            reason: e instanceof Error ? e.message : "could not be fetched",
          });
        }
      progress?.(++n, total);
    }
  }
  if (problems.length) throw new BuildBlocked(problems);
  const mtext = ["SHA-256  path  origin", ...manifest, ""].join("\n");
  files[`${root}/manifest.sha256`] = strToU8(mtext);
  files[`${root}/decisions.csv`] = strToU8(csv(datasetRows(ws, cycles)));
  files[`${root}/README.md`] = strToU8(
    [
      `# Evidence bundle — ${ws.project.name}`,
      "",
      `Engagement ${ws.project.code}, brief v${ws.briefInForce?.version ?? "—"}. Built ${at} (UTC) on the analyst's device by ${handler}.`,
      `Flagged items: ${items.length}; files: ${manifest.length}.`,
      "",
      "Every file was fetched and re-hashed before packing and matched the hash recorded at capture or linking. `manifest.sha256` lists every file; `decisions.csv` gives each item's category, severity, target group, second-reader status and evidence tier. Only items at FA-STD-001 V2 are proof; other tiers are not.",
      "",
      "Home-vault files were streamed from DarkNight to this device; the hub keeps only this bundle's hash.",
      "",
      ATTRIBUTION,
      "",
    ].join("\n"),
  );
  const zip = zipSync(files, { level: 0, mtime: new Date(at) });
  return {
    blob: new Blob([zip], { type: "application/zip" }),
    fileName: stamp(ws, "evidence_bundle", "zip", at),
    sha256: await sha256Hex(zip.buffer as ArrayBuffer),
    sizeBytes: zip.byteLength,
    itemCount: items.length,
    uploadable: home === 0,
    params: { built_at: at, files: manifest.length, home_vault_files: home, cycles },
  };
}

/** Release pack: every HELD output with its stored file, re-hashed, plus the release log. */
export async function buildReleasePack(ws: Workspace): Promise<Built> {
  const at = new Date().toISOString();
  const held = ws.outputs.filter((o) => o.status === "held" && o.kind !== "release_pack");
  const root = `${safeName(ws.project.code)}_release`;
  const files: Zippable = {};
  const log: string[] = [];
  const problems: { code: string; filename: string | null; reason: string }[] = [];
  for (const o of held) {
    if (!o.location || !o.sha256) {
      problems.push({
        code: o.title,
        filename: o.file_name,
        reason:
          "this output's file is not stored in the cloud (home-vault content stays on the device)",
      });
      continue;
    }
    const { data, error } = await supabase.storage.from("evidence").download(o.location);
    if (error || !data) {
      problems.push({ code: o.title, filename: o.file_name, reason: "file not found in storage" });
      continue;
    }
    const buf = await data.arrayBuffer();
    const got = await sha256Hex(buf);
    if (got !== o.sha256) {
      problems.push({
        code: o.title,
        filename: o.file_name,
        reason: "stored file does not match its recorded hash",
      });
      continue;
    }
    files[`${root}/${safeName(o.kind)}/${safeName(o.file_name ?? o.id)}`] = new Uint8Array(buf);
    log.push(`${got}  ${o.kind}/${o.file_name}  "${o.title}"`);
  }
  if (!held.length)
    problems.push({ code: "pack", filename: null, reason: "no output has passed QA (HELD) yet" });
  if (problems.length) throw new BuildBlocked(problems);
  files[`${root}/release-log.txt`] = strToU8(["SHA-256  file  title", ...log, ""].join("\n"));
  files[`${root}/README.md`] = strToU8(
    [
      `# Release pack — ${ws.project.name}`,
      "",
      `Assembled ${at} (UTC) from outputs that passed QA. Held until the Curator approves release in writing (G5).`,
      "",
      ATTRIBUTION,
      "",
    ].join("\n"),
  );
  const zip = zipSync(files, { level: 0, mtime: new Date(at) });
  return {
    blob: new Blob([zip], { type: "application/zip" }),
    fileName: stamp(ws, "release_pack", "zip", at),
    sha256: await sha256Hex(zip.buffer as ArrayBuffer),
    sizeBytes: zip.byteLength,
    itemCount: held.length,
    uploadable: true,
    params: { built_at: at, outputs: held.map((o) => o.id) },
  };
}

export async function attachFile(ws: Workspace, file: File): Promise<Built> {
  const buf = await file.arrayBuffer();
  return {
    blob: file,
    fileName: file.name,
    sha256: await sha256Hex(buf),
    sizeBytes: file.size,
    itemCount: flagged(ws).length,
    uploadable: true,
    params: { built_at: new Date().toISOString(), source: "attached" },
  };
}

export function build(
  kind: OutputKind,
  ws: Workspace,
  o: {
    gatewayBase: string | null;
    handler: string;
    cycles: number[];
    progress?: (d: number, t: number) => void;
  },
): Promise<Built> {
  const cy = o.cycles.length ? o.cycles : undefined;
  switch (kind) {
    case "executive_brief":
      return buildBrief(ws, cy);
    case "findings_tables":
      return buildFindingsTables(ws, cy);
    case "limits_statement":
      return buildLimits(ws, cy);
    case "dataset":
      return buildDataset(ws, cy);
    case "dashboard":
      return buildDashboard(ws);
    case "evidence_bundle":
      return buildBundle(ws, o.gatewayBase, o.handler, cy, o.progress);
    case "release_pack":
      return buildReleasePack(ws);
    default:
      return Promise.reject(new Error("Attach the finished file for this output."));
  }
}
export const storagePath = (ws: Workspace, id: string, name: string) =>
  `projects/${safeName(ws.project.code)}/outputs/${id}/${safeName(name)}`;
export function saveBlob(blob: Blob, name: string) {
  const u = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = u;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(u), 30_000);
}
