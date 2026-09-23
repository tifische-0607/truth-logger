import { useQuery } from "@tanstack/react-query";
import { ImageOff } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";

export function useSignedUrl(path?: string | null, expiresIn = 300) {
  return useQuery({
    queryKey: ["signed-url", path],
    enabled: Boolean(path),
    staleTime: (expiresIn - 30) * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.storage
        .from("evidence")
        .createSignedUrl(path as string, expiresIn);
      if (error) throw error;
      return data.signedUrl;
    },
  });
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
