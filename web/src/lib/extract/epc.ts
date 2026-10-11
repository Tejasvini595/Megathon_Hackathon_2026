import type { EpcBand } from "@/lib/twin/types";

/** SAP points range of each EPC band (the official bands). */
export const EPC_RANGES: Record<EpcBand, [number, number]> = { A: [92, 100], B: [81, 91], C: [69, 80], D: [55, 68], E: [39, 54], F: [21, 38], G: [1, 20] };

export const EPC_BANDS = Object.keys(EPC_RANGES) as EpcBand[];

export function bandOfSap(sap: number): EpcBand {
  return EPC_BANDS.find((b) => sap >= EPC_RANGES[b][0]) ?? "G";
}

/** A score is valid for a band when it lies in the band's range (A has no upper limit on a real certificate). */
export function sapInBand(sap: number, band: EpcBand) {
  const [lo, hi] = EPC_RANGES[band];
  return sap >= lo && (band === "A" ? sap <= 150 : sap <= hi);
}
