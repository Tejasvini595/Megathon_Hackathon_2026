"use server";

import { z } from "zod";
import { requireUser } from "@/lib/dal";
import { isUkPostcode } from "./postcode";
import { describeStreet, type StreetResult } from "./street";

const input = z.string().trim().min(1).max(12);

export async function lookupStreet(postcode: string): Promise<StreetResult> {
  await requireUser();
  const parsed = input.safeParse(postcode);
  if (!parsed.success || !isUkPostcode(parsed.data)) return { ok: false, error: "Enter a valid UK postcode." };
  return describeStreet(parsed.data);
}
