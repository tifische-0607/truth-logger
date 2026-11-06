import { useQuery } from "@tanstack/react-query";
import { artefactLocation } from "@/lib/evidence-read";
import { NOT_YET_MOVED } from "@/lib/darknight";

/** Says where an artefact is read from: "Not yet moved" (cloud) or "DarkNight" (moved and verified). */
export function MoveTag({ path }: { path: string }) {
  const q = useQuery({ queryKey: ["artefact-location", path], queryFn: () => artefactLocation(path), staleTime: 60_000, retry: false });
  if (!q.data) return null;
  return (
    <span className="bg-secondary text-secondary-foreground ml-2 inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-sans text-[11px] font-semibold">
      <span aria-hidden className="size-1.5 rounded-full bg-current" />
      {q.data.moved ? "DarkNight" : NOT_YET_MOVED}
    </span>
  );
}
