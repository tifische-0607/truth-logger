import { useEffect, useState } from "react";

import { supabase } from "@/integrations/supabase/client";
import {
  blobStore,
  cacheStore,
  offlineSupported,
  outbox,
  sha256OfBlob,
  type CachedArtefact,
  type CachedCase,
} from "@/lib/offline-db";
import { LIVE_KINDS, RENDER_KINDS } from "@/lib/format";

const MAX_BLOB_BYTES = 40 * 1024 * 1024;

export function useOnline() {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    setOnline(navigator.onLine);
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);
  return online;
}

function cacheable(kind: string) {
  return LIVE_KINDS.has(kind) || RENDER_KINDS.has(kind) || kind === "media";
}

export type SyncProgress = { label: string; done: number; total: number };

/** Download one case (records + artefact files) into the on-device cache. */
export async function syncCase(caseId: string, onProgress?: (p: SyncProgress) => void) {
  if (!offlineSupported()) throw new Error("This browser cannot store an offline copy.");

  onProgress?.({ label: "Case records", done: 0, total: 1 });

  const caseRow = await supabase.from("cases").select("*").eq("id", caseId).maybeSingle();
  if (caseRow.error) throw caseRow.error;
  if (!caseRow.data) throw new Error("Case not found");

  const incidents = await supabase
    .from("incidents")
    .select(
      "*, accounts(id, handle, display_name, platform, profile_url, account_snapshots(id, captured_at, followers, following, verified, display_name, bio_verbatim), items(id, item_code, item_type, author_name, captured_at, parent_item_id))",
    )
    .eq("case_id", caseId)
    .order("incident_id");
  if (incidents.error) throw incidents.error;

  const items = await supabase
    .from("items")
    .select(
      "*, artefacts(*), accounts!inner(id, handle, display_name, platform, incident_uuid, incidents!inner(incident_id, case_id))",
    )
    .eq("accounts.incidents.case_id", caseId);
  if (items.error) throw items.error;

  const itemRows = (items.data ?? []) as unknown as Record<string, unknown>[];
  const itemIds = itemRows.map((i) => i["id"] as string);

  const custody: Record<string, Record<string, unknown>[]> = {};
  if (itemIds.length) {
    const events = await supabase
      .from("custody_events")
      .select("*")
      .in("item_id", itemIds)
      .order("created_at", { ascending: false });
    if (events.error) throw events.error;
    for (const ev of events.data ?? []) {
      const key = ev.item_id as string;
      (custody[key] ??= []).push(ev as unknown as Record<string, unknown>);
    }
  }

  const artefactRows = itemRows.flatMap(
    (i) => (i["artefacts"] ?? []) as Record<string, unknown>[],
  );
  const toDownload = artefactRows.filter((a) => cacheable(a["kind"] as string));

  const artefacts: CachedArtefact[] = [];
  let bytes = 0;
  let done = 0;

  for (const a of toDownload) {
    const path = a["storage_path"] as string;
    const filename = a["filename"] as string;
    onProgress?.({ label: filename, done, total: toDownload.length });
    let hash_state: CachedArtefact["hash_state"] = "unverified";
    try {
      const size = (a["size_bytes"] as number | null) ?? 0;
      if (size > MAX_BLOB_BYTES) throw new Error("too large for offline copy");
      const signed = await supabase.storage.from("evidence").createSignedUrl(path, 300);
      if (signed.error || !signed.data) throw signed.error ?? new Error("no signed url");
      const res = await fetch(signed.data.signedUrl);
      if (!res.ok) throw new Error(`download failed (${res.status})`);
      const blob = await res.blob();
      const recorded = a["sha256"] as string | null;
      const actual = await sha256OfBlob(blob);
      hash_state = recorded ? (recorded === actual ? "match" : "mismatch") : "unverified";
      if (hash_state !== "mismatch") {
        await blobStore.put(path, blob);
        bytes += blob.size;
      }
    } catch {
      hash_state = "unverified";
    }
    artefacts.push({
      path,
      filename,
      sha256: (a["sha256"] as string | null) ?? null,
      mime_type: (a["mime_type"] as string | null) ?? null,
      size_bytes: (a["size_bytes"] as number | null) ?? null,
      hash_state,
    });
    done += 1;
    onProgress?.({ label: filename, done, total: toDownload.length });
  }

  const record: CachedCase = {
    caseId,
    syncedAt: new Date().toISOString(),
    case: caseRow.data as unknown as Record<string, unknown>,
    incidents: (incidents.data ?? []) as unknown as Record<string, unknown>[],
    items: itemRows,
    custody,
    artefacts,
    bytes,
  };
  await cacheStore.put(record);
  return record;
}

export async function removeCachedCase(caseId: string) {
  const record = await cacheStore.get(caseId);
  for (const a of record?.artefacts ?? []) await blobStore.remove(a.path);
  await cacheStore.remove(caseId);
}

export async function listCachedCases() {
  const all = (await cacheStore.all()) ?? [];
  return all.sort((a, b) => a.caseId.localeCompare(b.caseId));
}

export async function getCachedCase(caseId: string) {
  return (await cacheStore.get(caseId)) ?? null;
}

export async function findCachedItem(itemId: string) {
  const all = (await cacheStore.all()) ?? [];
  for (const record of all) {
    const item = record.items.find((i) => i["id"] === itemId);
    if (item) {
      return {
        item,
        custody: record.custody[itemId] ?? [],
        children: record.items.filter((i) => i["parent_item_id"] === itemId),
        syncedAt: record.syncedAt,
        caseId: record.caseId,
      };
    }
  }
  return null;
}

/** Custody events written while offline are queued and sent on the next sync. */
export async function queueCustodyEvent(payload: Record<string, unknown>) {
  await outbox.add({ ...payload, notes: `${payload["notes"] ?? ""} (recorded offline)`.trim() });
}

export async function flushOutbox() {
  const pending = (await outbox.all()) ?? [];
  let sent = 0;
  for (const ev of pending) {
    const { error } = await supabase
      .from("custody_events")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .insert(ev.payload as any);
    if (!error) {
      await outbox.remove(ev.id);
      sent += 1;
    }
  }
  return { sent, pending: pending.length };
}

export async function pendingOutboxCount() {
  return ((await outbox.all()) ?? []).length;
}

/** Try the network first; fall back to the on-device copy when it fails. */
export async function offlineFirst<T>(live: () => Promise<T>, cached: () => Promise<T | null>) {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    const fallback = await cached();
    if (fallback) return fallback;
  }
  try {
    return await live();
  } catch (err) {
    const fallback = await cached();
    if (fallback) return fallback;
    throw err;
  }
}
