import { z } from "zod";
import { FIELDS } from "./fields";

export const recordSchema = z.object(
  Object.fromEntries(
    FIELDS.map((f) => [
      f.key,
      f.kind === "number"
        ? z.coerce.number().min(f.min).max(f.max)
        : f.kind === "multi"
          ? z.array(z.enum(f.options.map((o) => o.value) as [string, ...string[]])).max(f.options.length)
          : z.enum(f.options.map((o) => o.value) as [string, ...string[]]),
    ]),
  ),
);

export const confirmSchema = z.object({ nickname: z.string().trim().min(1).max(60), record: recordSchema });
