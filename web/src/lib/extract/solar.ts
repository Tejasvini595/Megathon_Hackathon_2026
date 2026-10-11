/** Typical modern panel, about 400 W. Only converts the user's own panel count into kW. */
export const SOLAR_KW_PER_PANEL = 0.4;

export const panelsToKw = (panels: number) => Math.round(panels * SOLAR_KW_PER_PANEL * 10) / 10;

export const kwToPanels = (kw: number) => Math.max(1, Math.round(kw / SOLAR_KW_PER_PANEL));
