import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { ImageOff } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { blobStore } from "@/lib/offline-db";

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
      const { data, error } = await supabase.storage
        .from("evidence")
        .createSignedUrl(path as string, expiresIn);
      if (error) throw error;
      return data.signedUrl;
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
    data: query.data ?? objectUrl ?? undefined,
    isError: query.isError && !objectUrl,
    fromCache: Boolean(!query.data && objectUrl),
  };
}

export function EvidenceThumb({ path }: { path?: string | null }) {
  const signed = useSignedUrl(path);

  if (!path || signed.isError || (!signed.isLoading && !signed.data)) {
    return (
      <div className="bg-muted text-muted-foreground flex aspect-4/3 items-center justify-center rounded-lg border">
        <ImageOff className="size-5" />
      </div>
    );
  }

  return (
    <div className="bg-muted aspect-4/3 overflow-hidden rounded-lg border">
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
