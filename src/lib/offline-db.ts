/* Local, device-only cache for offline review.
 * Cached copies are working copies for reading on the go — the evidence of
 * record always stays in the encrypted evidence store. Every cached artefact
 * keeps its SHA-256 and is re-hashed on download so a bad copy is flagged. */

const DB_NAME = "fbem-offline";
const DB_VERSION = 1;

export type CachedArtefact = {
  path: string;
  filename: string;
  sha256: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  hash_state: "match" | "mismatch" | "unverified";
};

export type CachedCase = {
  caseId: string;
  syncedAt: string;
  case: Record<string, unknown>;
  incidents: Record<string, unknown>[];
  items: Record<string, unknown>[];
  custody: Record<string, Record<string, unknown>[]>;
  artefacts: CachedArtefact[];
  bytes: number;
};

export type OutboxEvent = {
  id: string;
  createdAt: string;
  payload: Record<string, unknown>;
};

export function offlineSupported() {
  return typeof window !== "undefined" && typeof indexedDB !== "undefined";
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("cases")) db.createObjectStore("cases", { keyPath: "caseId" });
      if (!db.objectStoreNames.contains("blobs")) db.createObjectStore("blobs", { keyPath: "path" });
      if (!db.objectStoreNames.contains("outbox")) db.createObjectStore("outbox", { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(store: string, mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    if (!offlineSupported()) {
      resolve(undefined as T);
      return;
    }
    openDb().then((db) => {
      const t = db.transaction(store, mode);
      const req = run(t.objectStore(store));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
      t.oncomplete = () => db.close();
    }, reject);
  });
}

export const cacheStore = {
  put: (record: CachedCase) => tx("cases", "readwrite", (s) => s.put(record) as IDBRequest<IDBValidKey>),
  get: (caseId: string) => tx<CachedCase | undefined>("cases", "readonly", (s) => s.get(caseId)),
  all: () => tx<CachedCase[]>("cases", "readonly", (s) => s.getAll()),
  remove: (caseId: string) => tx("cases", "readwrite", (s) => s.delete(caseId) as IDBRequest<undefined>),
};

export const blobStore = {
  put: (path: string, blob: Blob) =>
    tx("blobs", "readwrite", (s) => s.put({ path, blob }) as IDBRequest<IDBValidKey>),
  get: async (path: string) => {
    const row = await tx<{ path: string; blob: Blob } | undefined>("blobs", "readonly", (s) =>
      s.get(path),
    );
    return row?.blob ?? null;
  },
  remove: (path: string) =>
    tx("blobs", "readwrite", (s) => s.delete(path) as IDBRequest<undefined>),
};

export const outbox = {
  add: (payload: Record<string, unknown>) =>
    tx("outbox", "readwrite", (s) =>
      s.put({
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        payload,
      }) as IDBRequest<IDBValidKey>,
    ),
  all: () => tx<OutboxEvent[]>("outbox", "readonly", (s) => s.getAll()),
  remove: (id: string) => tx("outbox", "readwrite", (s) => s.delete(id) as IDBRequest<undefined>),
};

export async function sha256OfBlob(blob: Blob) {
  const buf = await blob.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
