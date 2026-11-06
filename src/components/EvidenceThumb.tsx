import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { ImageOff } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { blobStore } from "@/lib/offline-db";
import { artefactLocation, readArtefact } from "@/lib/evidence-read";
import { NOT_YET_MOVED } from "@/lib/darknight";

/** Signed URL when online; the on-device copy when the network is unavailable. */
export function useSignedUrl(path?: string | null, expiresIn = 300) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ["signed-url", path],
    enabled: Boolean(path),
    staleTime: (expiresIn - 30) * 1000,
    retry: false,
    queryFn: async () => {
      if (typeof navigator !== "undefined" && !navigator.onLine) throw new Error("offline");
      // U3: moved artefacts are read live from DarkNight and re-hashed; others keep their cloud link.
      const loc = await artefactLocation(path as string).catch(() => null);
      if (loc?.moved) {
        const r = await readArtefact(path as string);
        if (!r.ok) throw new Error(r.message);
        return { url: URL.createObjectURL(new Blob([r.bytes])), moved: true };
      }
      const { data, error } = await supabase.storage
        .from("evidence")
        .createSignedUrl(path as string, expiresIn);
      if (error) throw error;
      return { url: data.signedUrl, moved: false };
    },
  });

  const needsFallback = Boolean(path) && query.isError;

  useEffect(() => {
    let url: string | null = null;
    let cancelled = false;
    if (needsFallback && path) {
      void blobStore.get(path).then((blob) => {
        if (!blob || cancelled) return;
        url = URL.createObjectURL(blob);
        setObjectUrl(url);
      });
    } else {
      setObjectUrl(null);
    }
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [needsFallback, path]);

  return {
    ...query,
    data: query.data?.url ?? objectUrl ?? undefined,
    moved: query.data?.moved,
    message: query.error instanceof Error ? query.error.message : null,
    isError: query.isError && !objectUrl,
    fromCache: Boolean(!query.data && objectUrl),
  };
}

export function EvidenceThumb({ path }: { path?: string | null }) {
  const signed = useSignedUrl(path);

  if (!path || signed.isError || (!signed.isLoading && !signed.data)) {
    return (
      <div className="bg-muted text-muted-foreground flex aspect-4/3 flex-col items-center justify-center gap-1 rounded-lg border p-2 text-center text-xs">
        <ImageOff className="size-5" />
        {signed.message && signed.message !== "offline" ? <span>{signed.message}</span> : null}
      </div>
    );
  }

  return (
    <div className="bg-muted relative aspect-4/3 overflow-hidden rounded-lg border">
      {signed.moved === false ? (
        <span className="bg-background/90 text-foreground absolute top-1 left-1 rounded px-1.5 py-0.5 text-[11px] font-semibold">{NOT_YET_MOVED}</span>
      ) : null}
      {signed.data ? (
        <img
          src={signed.data}
          alt=""
          loading="lazy"
          className="size-full object-cover transition-transform group-hover:scale-[1.02]"
        />
      ) : null}
    </div>
  );
}
