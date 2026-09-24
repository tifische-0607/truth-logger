// Machine translation of evidence text into English (Lovable AI).
// Originals are never touched; the translation always carries a statement.

export const MACHINE_TRANSLATION_STATEMENT =
  "MACHINE TRANSLATION – produced automatically by Lovable AI (openai/gpt-6-astra); not verified by a human. Must be checked against the original text by a qualified translator before use in any report.";

type Row = { id: string; text: string };

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["translations"],
  properties: {
    translations: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "english"],
        properties: { id: { type: "string" }, english: { type: "string" } },
      },
    },
  },
} as const;

const SYSTEM = [
  "You translate Facebook posts and comments (mostly Malay, Manglish, Chinese, Tamil) into English for a legal evidence file.",
  "Translate faithfully and literally. Keep slang, insults, emojis, names, hashtags and URLs as they are; do not soften or add anything.",
  "If a text is already English, return it unchanged. Mark words you cannot translate as [untranslatable: original].",
  "Return one entry per supplied id.",
].join(" ");

async function translateChunk(rows: Row[], apiKey: string): Promise<Map<string, string>> {
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
          content: [{ type: "input_text", text: JSON.stringify(rows) }],
        },
      ],
      text: { format: { type: "json_schema", name: "translations", strict: true, schema: SCHEMA } },
    }),
  });
  if (!res.ok || !res.body) {
    if (res.status === 429) throw new Error("AI is busy right now — try again in a moment.");
    if (res.status === 402) throw new Error("AI credits are exhausted. Add credits in workspace settings.");
    const detail = await res.text().catch(() => "");
    throw new Error(`Translation failed (${res.status}). ${detail.slice(0, 200)}`);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let out = "";
  let finalText = "";
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
          const evt = JSON.parse(payload);
          if (evt.type === "response.output_text.delta" && typeof evt.delta === "string") out += evt.delta;
          else if (evt.type === "response.completed" && evt.response?.output_text)
            finalText = evt.response.output_text;
        } catch {
          /* ignore */
        }
      }
    }
  }
  const text = (out || finalText).trim();
  const map = new Map<string, string>();
  if (!text) return map;
  const parsed = JSON.parse(text) as { translations: { id: string; english: string }[] };
  for (const t of parsed.translations ?? []) if (t.id && t.english) map.set(t.id, t.english);
  return map;
}

export async function translateRows(rows: Row[], apiKey: string): Promise<Map<string, string>> {
  const clean = rows
    .filter((r) => r.text && r.text.trim())
    .map((r) => ({ id: r.id, text: r.text.slice(0, 4000) }));
  const chunks: Row[][] = [];
  for (let i = 0; i < clean.length; i += 25) chunks.push(clean.slice(i, i + 25));
  const all = new Map<string, string>();
  // Sequential, to stay within the shared rate-limit budget.
  for (const c of chunks) {
    const m = await translateChunk(c, apiKey);
    m.forEach((v, k) => all.set(k, v));
  }
  return all;
}
