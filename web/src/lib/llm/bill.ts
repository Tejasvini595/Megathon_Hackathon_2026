import { generateText, Output } from "ai";
import { z } from "zod";
import type { BillReading } from "../extract/bill-checks";
import { model } from "./provider";

/**
 * Reads the numbers printed on an energy bill or annual statement. The model only transcribes (it never estimates,
 * converts units or fills gaps); everything it returns is then checked in extract/bill-checks.ts. Files are processed
 * in memory and never stored.
 */
const date = z.string().describe("YYYY-MM-DD, exactly as the bill states it (UK dates are day/month/year)");
const schema = z.object({
  fuels: z.array(
    z.object({
      fuel: z.enum(["electricity", "gas"]),
      unit: z.enum(["kWh", "m3"]).describe("The unit the consumption is printed in; gas is sometimes in cubic metres (m3) or units"),
      periods: z.array(z.object({ start: date, end: date, consumption: z.number().describe("Energy used in the period, as printed") })).describe("One entry per billing period or month printed, including any history table"),
      annualTotal: z.number().nullable().describe("A yearly or 12-month total if one is printed, else null"),
      calorificValue: z.number().nullable().describe("The gas calorific value in MJ/m3 if printed, else null"),
    }),
  ),
  statement: z.object({ start: date, end: date }).nullable().describe("The period the whole statement covers, if printed"),
});

const SYSTEM = `You transcribe numbers from UK household energy bills and annual statements.
Copy only what is printed. Never estimate, convert units, add up, or fill in missing periods. Ignore estimated-vs-actual labels: report the consumption shown.
Report electricity and gas separately. Use the consumption (kWh or m3), not the cost in pounds, and not meter readings themselves unless consumption is printed.
If the image is not an energy bill, return no fuels.`;

export const BILL_MEDIA_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif", "application/pdf"] as const;

async function readOne(file: { data: Uint8Array; mediaType: string }) {
  const { output } = await generateText({
    model: model("vision"),
    output: Output.object({ schema }),
    instructions: SYSTEM,
    messages: [{ role: "user", content: [{ type: "text", text: "Transcribe the energy consumption on this bill." }, { type: "file", data: file.data, mediaType: file.mediaType }] }],
  });
  return output;
}

/** Reads each file separately, then pools the fuels so the checks can join the periods up. */
export async function readBills(files: { data: Uint8Array; mediaType: string }[]): Promise<BillReading> {
  const results = await Promise.all(files.map(readOne));
  return { fuels: results.flatMap((r) => r.fuels), statements: results.flatMap((r) => (r.statement ? [r.statement] : [])) };
}
