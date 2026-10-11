import { generateText, Output } from "ai";
import { z } from "zod";
import { FIELDS, type ExtractedField, type FieldKey, type FieldSource } from "./fields";
import { rulesExtractor, type Extractor } from "./index";
import { config, decisionModelId, llmEnabled, model } from "../llm/provider";
import { decideFields } from "./decide-fields";

/**
 * LLM reading of free-text and voice descriptions into the record's categories. The LLM only extracts what the user
 * said (never a score or estimate); it answers in each field's own options, must quote the user's words, and its
 * confidence is set by whether the value was stated or only implied, not by the model's self-report. It layers on
 * the rules baseline, so unstated fields keep the typical-home default and are marked for the user to check.
 *   bun run eval:extract src/lib/extract/llm.ts     compares it with the rules on the labelled cases
 */
const CONFIDENCE = { stated: 0.92, implied: 0.7 } as const;

const answer = <T extends z.ZodType>(value: T) =>
  z.object({ value, basis: z.enum(["stated", "implied"]), quote: z.string().describe("The user's exact words that support it") }).nullable();

const schema = z.object(
  Object.fromEntries(
    FIELDS.map((f) => [
      f.key,
      answer(f.kind === "number" ? z.number().min(f.min).max(f.max) : z.enum(f.options.map((o) => o.value) as [string, ...string[]])).describe(
        `${f.label}${"hint" in f && f.hint ? ` (${f.hint})` : ""}${"unit" in f && f.unit ? `, in ${f.unit}` : ""}`,
      ),
    ]),
  ),
);

const SYSTEM = `You read a homeowner's description of their home and fill a UK home-energy record.
Fill a field only if the text states it or clearly implies it; otherwise null. Never guess typical values.
Answer in each field's own categories. "rooms" counts bedrooms plus living/reception rooms, not kitchens or bathrooms.
Loft insulation: under 100 mm thin, 100-199 mm some, 200 mm or more thick. A boiler fitted from April 2005 is "from_2005".
For solar, give kW; if only panels are counted, use 0.4 kW per panel. Negations ("no solar", "never insulated") are answers too.
quote must be copied exactly from the text.`;

async function readText(text: string) {
  const { output } = await generateText({ model: model("extract"), output: Output.object({ schema }), instructions: SYSTEM, prompt: text });
  return output as Record<string, { value: string | number; basis: "stated" | "implied"; quote: string } | null>;
}

export const llmExtractor: Extractor = async (inputs) => {
  const base = await rulesExtractor(inputs);
  const fields = { ...base.fields } as Record<FieldKey, ExtractedField>;
  for (const input of inputs) {
    if (!input.text || (input.kind !== "TEXT" && input.kind !== "VOICE")) continue;
    const source: FieldSource = input.kind === "VOICE" ? "voice" : "text";
    const found = await readText(input.text);
    for (const f of FIELDS) {
      const a = found[f.key];
      if (!a) continue;
      const quoted = a.quote && input.text.toLowerCase().includes(a.quote.toLowerCase());
      const confidence = quoted ? CONFIDENCE[a.basis] : CONFIDENCE.implied - 0.1;
      const prior = fields[f.key as FieldKey];
      if (prior && prior.source !== "default" && prior.confidence > confidence) continue;
      fields[f.key as FieldKey] = {
        value: a.value,
        confidence,
        source,
        evidence: `${source === "voice" ? "Voice note" : "Your description"}${a.basis === "implied" ? " suggests this" : ""}`,
        quote: quoted ? a.quote : undefined,
      };
    }
  }
  return { ...base, fields, models: [...base.models.filter((m) => m !== "rules-v0"), "rules-v0", `llm:${config("extract").model}`] };
};

/** LLM reader plus the decision model's probabilities for choice fields when a key is configured, else the rules alone. */
export const autoExtractor: Extractor = async (inputs) => {
  if (!llmEnabled()) return rulesExtractor(inputs);
  const result = await llmExtractor(inputs).catch(() => rulesExtractor(inputs));
  const text = inputs.filter((i) => i.text && (i.kind === "TEXT" || i.kind === "VOICE")).map((i) => i.text).join("\n");
  if (text && (await decideFields(text, result.fields, inputs.some((i) => i.kind === "TEXT") ? "text" : "voice"))) result.models.push(`decide:${decisionModelId()}`);
  return result;
};

export default llmExtractor;
