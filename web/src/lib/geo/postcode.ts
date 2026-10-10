import { cache } from "react";
import { prisma } from "@/lib/prisma";

const UK_POSTCODE = /^[A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2}$/;

export function normalisePostcode(s: string): string {
  const compact = s.toUpperCase().replace(/\s+/g, "");
  return compact.length > 3 ? `${compact.slice(0, -3)} ${compact.slice(-3)}` : compact;
}

export function isUkPostcode(s: string): boolean {
  return UK_POSTCODE.test(s.trim().toUpperCase());
}

export const findPostcode = cache((pc: string) =>
  prisma.postcode.findUnique({ where: { postcode: normalisePostcode(pc) } }),
);
