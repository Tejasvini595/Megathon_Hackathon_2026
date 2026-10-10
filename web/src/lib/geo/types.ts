export type LonLat = [number, number];
/** Metres from the origin: x east, z south (three.js: -z is north). */
export type Xz = [number, number];

export type BuildingTags = {
  building?: string;
  levels?: number;
  roofShape?: string;
  houseNumber?: string;
  street?: string;
  name?: string;
};

export type Building = { osmId: number; polygon: LonLat[]; tags: BuildingTags };

export type Origin = { lat: number; lon: number };
