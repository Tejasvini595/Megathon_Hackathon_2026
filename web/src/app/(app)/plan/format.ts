import { formatGbp } from "@/lib/score";

export function billText(n: number) {
  return n > 0 ? `saves about ${formatGbp(n)} a year` : n < 0 ? `adds about ${formatGbp(-n)} a year` : "no change to your bill";
}
