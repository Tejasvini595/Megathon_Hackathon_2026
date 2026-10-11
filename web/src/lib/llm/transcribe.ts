"use server";

import { generateText } from "ai";
import { requireUser } from "@/lib/dal";
import { llmEnabled, model } from "./provider";

// 16 kHz mono 16-bit WAV is ~1.9 MB a minute; the recorder stops itself at 90 s.
const MAX_BYTES = 4 * 1024 * 1024;

export type Transcript = { ok: true; text: string } | { ok: false; error: string };

/** Speech to text with an audio-input LLM (LLM_TRANSCRIBE_MODEL); the prompt carries the retrofit vocabulary. */
export async function transcribe(form: FormData): Promise<Transcript> {
  await requireUser();
  if (!llmEnabled()) return { ok: false, error: "Voice needs the AI service, which isn't configured. Type your question instead." };
  const audio = form.get("audio");
  if (!(audio instanceof Blob) || audio.type !== "audio/wav" || !audio.size) return { ok: false, error: "That recording couldn't be read." };
  if (audio.size > MAX_BYTES) return { ok: false, error: "That recording is too long. Keep it under a minute and a half." };
  try {
    const { text } = await generateText({
      model: model("transcribe"),
      maxOutputTokens: 600,
      temperature: 0,
      instructions:
        "Transcribe the speaker's words verbatim in their own language, with normal punctuation. They are a homeowner talking about their " +
        "home's energy use: expect words like loft, cavity wall, solid wall, double glazing, heat pump, solar panels, boiler, thermostat, " +
        "EPC, kWh, insulation, radiators, terraced, semi-detached, and amounts in pounds. Output only the transcript, with no notes. If " +
        "there is no speech, output nothing.",
      messages: [{ role: "user", content: [{ type: "file", mediaType: "audio/wav", data: new Uint8Array(await audio.arrayBuffer()) }] }],
    });
    return { ok: true, text: text.trim() };
  } catch (e) {
    console.error("Transcription failed", e instanceof Error ? e.message : e);
    return { ok: false, error: "Couldn't transcribe that. Try again, or type instead." };
  }
}
