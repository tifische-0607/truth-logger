import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type CaseSummary = {
  summary: string;
  allegations: Array<{ allegation: string; quote: string; note: string }>;
  caveats: string;
};

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "allegations", "caveats"],
  properties: {
    summary: {
      type: "string",
      description: "3-5 sentence factual, case-ready summary of the evidence text.",
    },
    allegations: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["allegation", "quote", "note"],
        properties: {
          allegation: { type: "string" },
          quote: { type: "string", description: "Verbatim extract supporting it, or empty." },
          note: { type: "string", description: "Why it may matter to an investigator." },
        },
      },
    },
    caveats: { type: "string" },
  },
} as const;

const SYSTEM = [
  "You assist a Malaysian evidence analyst preparing police reports and MCMC / CMA s.233 complaints.",
  "Summarise ONLY what the supplied text says. Never invent facts, names, dates or context.",
  "Quote verbatim where you cite. Keep the tone neutral, factual and case-ready.",
  "Do not infer or mention ethnicity, religion, political leaning or age of any person.",
  "Do not state legal conclusions of guilt; describe the alleged conduct and what it may indicate.",
  "If the text is too short or unclear, say so plainly in caveats.",
].join(" ");

export const summariseEvidenceText = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { text: string; context?: string }) => {
    const text = String(data?.text ?? "").trim();
    if (text.length < 10) throw new Error("Provide at least a sentence of evidence text.");
    return { text: text.slice(0, 20000), context: String(data?.context ?? "").slice(0, 500) };
  })
  .handler(async ({ data }): Promise<CaseSummary> => {
    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey) throw new Error("AI is not configured for this project.");

    const res = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Lovable-API-Key": apiKey,
        "X-Lovable-AIG-SDK": "fetch",
      },
      body: JSON.stringify({
        model: "openai/gpt-6-astra",
        stream: true,
        store: false,
        reasoning: { effort: "low" },
        instructions: SYSTEM,
        input: [
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: `${data.context ? `Context: ${data.context}\n\n` : ""}Evidence text:\n"""\n${data.text}\n"""`,
              },
            ],
          },
        ],
        text: {
          format: {
            type: "json_schema",
            name: "case_summary",
            strict: true,
            schema: SCHEMA,
          },
        },
      }),
    });

    if (!res.ok || !res.body) {
      const detail = await res.text().catch(() => "");
      if (res.status === 429) throw new Error("AI is busy right now — try again in a moment.");
      if (res.status === 402)
        throw new Error("AI credits are exhausted. Add credits in workspace settings.");
      throw new Error(`AI request failed (${res.status}). ${detail.slice(0, 300)}`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let out = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split("\n\n");
      buffer = parts.pop() ?? "";
      for (const part of parts) {
        for (const line of part.split("\n")) {
          if (!line.startsWith("data:")) continue;
          const payload = line.slice(5).trim();
          if (!payload || payload === "[DONE]") continue;
          try {
            const evt = JSON.parse(payload) as {
              type?: string;
              delta?: string;
              response?: { output_text?: string };
            };
            if (evt.type === "response.output_text.delta" && typeof evt.delta === "string") {
              out += evt.delta;
            } else if (evt.type === "response.completed" && evt.response?.output_text) {
              if (!out) out = evt.response.output_text;
            }
          } catch {
            // ignore keep-alive / non-JSON frames
          }
        }
      }
    }

    const trimmed = out.trim();
    if (!trimmed) throw new Error("The model returned no summary. Try again.");
    try {
      const parsed = JSON.parse(trimmed) as CaseSummary;
      return {
        summary: parsed.summary ?? "",
        allegations: Array.isArray(parsed.allegations) ? parsed.allegations : [],
        caveats: parsed.caveats ?? "",
      };
    } catch {
      return { summary: trimmed, allegations: [], caveats: "" };
    }
  });
