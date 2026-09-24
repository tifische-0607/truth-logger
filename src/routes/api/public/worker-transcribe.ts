import { createFileRoute } from "@tanstack/react-router";

import { checkWorkerToken, jsonResponse, readJson } from "@/lib/worker-shared";

type Body = { job_id?: string; audio_base64?: string; format?: string };

const MODEL = "google/gemini-2.5-flash";
const MAX_BASE64 = 28_000_000; // ~20 MB of audio

const PROMPT = `You are a forensic transcriber. Transcribe the speech in this audio VERBATIM, in the language(s) actually spoken (Malay, English, Chinese, Tamil, Manglish etc.). Do not correct grammar, censor, summarise or add anything. Put a [mm:ss] timestamp at the start of each utterance. Mark unclear words as [inaudible] and non-speech as [music], [laughter] etc. Never guess who is speaking or their ethnicity, religion, age or politics.
Return ONLY JSON: {"language": "<languages spoken>", "transcript_original": "<verbatim transcript>", "transcript_en": "<faithful English translation with the same timestamps, or the same text if already English>", "has_speech": true|false}`;

export const Route = createFileRoute("/api/public/worker-transcribe")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = checkWorkerToken(request);
        if (denied) return denied;

        const body = await readJson<Body>(request);
        if (!body.job_id || !body.audio_base64) {
          return jsonResponse({ error: "job_id and audio_base64 are required" }, 400);
        }
        if (body.audio_base64.length > MAX_BASE64) {
          return jsonResponse({ error: "Audio too large (max ~20 MB)" }, 413);
        }
        const format = body.format === "wav" ? "wav" : "mp3";
        const key = process.env["LOVABLE_API_KEY"];
        if (!key) return jsonResponse({ error: "AI is not configured" }, 500);

        const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: MODEL,
            response_format: { type: "json_object" },
            messages: [
              {
                role: "user",
                content: [
                  { type: "text", text: PROMPT },
                  { type: "input_audio", input_audio: { data: body.audio_base64, format } },
                ],
              },
            ],
          }),
        });
        if (res.status === 429) return jsonResponse({ error: "AI rate limited, try later" }, 429);
        if (res.status === 402) return jsonResponse({ error: "AI credits exhausted" }, 402);
        if (!res.ok) {
          return jsonResponse({ error: `AI error ${res.status}: ${(await res.text()).slice(0, 300)}` }, 502);
        }
        const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
        const raw = data.choices?.[0]?.message?.content ?? "";
        let parsed: Record<string, unknown> = {};
        try {
          parsed = JSON.parse(raw.replace(/^```(?:json)?\s*|\s*```$/g, ""));
        } catch {
          parsed = { transcript_original: raw, transcript_en: "", language: "unknown", has_speech: true };
        }
        return jsonResponse({
          model: MODEL,
          language: String(parsed["language"] ?? "unknown"),
          has_speech: parsed["has_speech"] !== false,
          transcript_original: String(parsed["transcript_original"] ?? ""),
          transcript_en: String(parsed["transcript_en"] ?? ""),
        });
      },
    },
  },
});
