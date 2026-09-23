import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Copy, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { summariseEvidenceText, type CaseSummary } from "@/lib/summarise.functions";

function asPlainText(s: CaseSummary): string {
  return [
    "AI-ASSISTED DRAFT — analyst must verify against the captured evidence.",
    "",
    "SUMMARY",
    s.summary,
    "",
    "KEY ALLEGATIONS",
    ...(s.allegations.length
      ? s.allegations.map(
          (a, i) =>
            `${i + 1}. ${a.allegation}${a.quote ? `\n   Quote: "${a.quote}"` : ""}${a.note ? `\n   Note: ${a.note}` : ""}`,
        )
      : ["  none identified"]),
    "",
    "CAVEATS",
    s.caveats || "—",
  ].join("\n");
}

export function CaseSummaryPanel({
  initialText,
  context,
}: {
  initialText?: string | null;
  context?: string;
}) {
  const [text, setText] = useState(initialText ?? "");
  const run = useServerFn(summariseEvidenceText);
  const mutation = useMutation({
    mutationFn: () => run({ data: { text, context: context ?? "" } }),
    onError: (e: Error) => toast.error(e.message),
  });
  const result = mutation.data;

  return (
    <section className="panel xl:col-span-3">
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-5">
        <h2 className="flex items-center gap-2 font-semibold">
          <Sparkles className="size-4" /> Case-ready summary (AI draft)
        </h2>
        {result ? (
          <Button
            variant="secondary"
            className="h-11"
            onClick={async () => {
              await navigator.clipboard.writeText(asPlainText(result));
              toast.success("Draft copied");
            }}
          >
            <Copy className="size-4" /> Copy draft
          </Button>
        ) : null}
      </div>

      <div className="space-y-4 px-5 pt-3 pb-5">
        <div className="space-y-2">
          <Label htmlFor="ai-text">Evidence text to analyse</Label>
          <Textarea
            id="ai-text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={6}
            placeholder="Paste or edit the post / comment text…"
            className="text-base"
          />
          <p className="text-muted-foreground text-xs">
            The draft is generated from this text only and is never stored as evidence. It is an
            analyst aid, not a capture artefact.
          </p>
        </div>

        <Button
          className="h-12 w-full sm:w-auto"
          disabled={mutation.isPending || text.trim().length < 10}
          onClick={() => mutation.mutate()}
        >
          <Sparkles className={`size-4 ${mutation.isPending ? "animate-pulse" : ""}`} />
          {mutation.isPending ? "Drafting…" : result ? "Draft again" : "Draft summary"}
        </Button>

        {result ? (
          <div className="space-y-4">
            <div className="bg-warn/20 text-warn-foreground rounded-lg border px-3 py-2 text-xs font-semibold uppercase">
              AI-assisted draft — verify against the captured evidence before use
            </div>
            <div>
              <h3 className="text-muted-foreground text-xs font-semibold uppercase">Summary</h3>
              <p className="bg-muted/60 mt-2 rounded-lg border p-4 text-sm whitespace-pre-wrap">
                {result.summary}
              </p>
            </div>
            <div>
              <h3 className="text-muted-foreground text-xs font-semibold uppercase">
                Key allegations
              </h3>
              {result.allegations.length === 0 ? (
                <p className="text-muted-foreground mt-2 text-sm">None identified.</p>
              ) : (
                <ol className="mt-2 space-y-3">
                  {result.allegations.map((a, i) => (
                    <li key={i} className="bg-muted/60 rounded-lg border p-4 text-sm">
                      <div className="font-medium">
                        {i + 1}. {a.allegation}
                      </div>
                      {a.quote ? (
                        <blockquote className="border-border text-muted-foreground mt-2 border-l-2 pl-3 italic">
                          “{a.quote}”
                        </blockquote>
                      ) : null}
                      {a.note ? <div className="mt-2 text-xs">{a.note}</div> : null}
                    </li>
                  ))}
                </ol>
              )}
            </div>
            {result.caveats ? (
              <div>
                <h3 className="text-muted-foreground text-xs font-semibold uppercase">Caveats</h3>
                <p className="mt-2 text-sm">{result.caveats}</p>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}
