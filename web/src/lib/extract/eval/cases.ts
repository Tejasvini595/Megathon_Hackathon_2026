import type { FieldKey, FieldValue } from "../fields";

export type EvalCase = {
  id: string;
  text: string;
  /** Only fields the text states or clearly implies. */
  gold: Partial<Record<FieldKey, FieldValue>>;
  /** Fields the text deliberately leaves open; filling one from the text is a false fill. */
  open?: FieldKey[];
};

export const CASES: EvalCase[] = [
  {
    id: "victorian-terrace-leeds",
    text: "Two-bed Victorian mid terrace in Leeds, solid brick walls with no insulation, single glazed sash windows, gas combi boiler with a Hive thermostat. Roughly 70 square metres. Loft has about 100mm of insulation.",
    gold: { propertyType: "house", builtForm: "mid_terrace", bedrooms: 2, ageBand: "pre1900", wallType: "solid", wallInsulation: "none", glazing: "single", heating: "gas_boiler", controls: "smart", floorAreaM2: 70, loftInsulationMm: 100 },
  },
  {
    id: "1930s-semi-filled-cavity",
    text: "1930s semi-detached, three bedrooms, cavity walls that were filled in 2015, double glazing throughout, gas central heating with a programmer and TRVs on every radiator. Loft is topped up to 270mm. Hipped roof.",
    gold: { propertyType: "house", builtForm: "semi", bedrooms: 3, ageBand: "1930_1949", wallType: "cavity", wallInsulation: "full", glazing: "double", heating: "gas_boiler", controls: "thermostat_trvs", loftInsulationMm: 270, roofType: "hip" },
  },
  {
    id: "1970s-detached-oil",
    text: "Detached four bedroom house built in the 1970s out in the countryside. Oil boiler, no gas here. Cavity walls, never been insulated as far as I know. Windows are a mix, some double glazed some original single. About 160 m2. Open fire in the lounge.",
    gold: { propertyType: "house", builtForm: "detached", bedrooms: 4, ageBand: "1967_1982", heating: "oil_boiler", wallType: "cavity", wallInsulation: "none", glazing: "partial_double", floorAreaM2: 160, secondaryHeating: ["open_fire"] },
  },
  {
    id: "1960s-bungalow-single-glazed",
    text: "Retired couple's 1960s detached bungalow, 2 bed. Gas boiler, thermostat in the hall but no radiator valves. Single glazing still, pitched roof, loft has 50mm of insulation. Cavity walls with no fill.",
    gold: { propertyType: "bungalow", builtForm: "detached", bedrooms: 2, ageBand: "1950_1966", heating: "gas_boiler", glazing: "single", roofType: "gable", loftInsulationMm: 50, wallType: "cavity", wallInsulation: "none" },
  },
  {
    id: "ground-flat-victorian-conversion",
    text: "Ground floor flat in a converted Victorian house, 3 storey building, one bedroom. Solid walls, double glazing fitted by the landlord, electric panel heaters in each room, no gas. 45m2.",
    gold: { propertyType: "flat", builtForm: "flat", flatLevel: "ground", blockStoreys: 3, bedrooms: 1, ageBand: "pre1900", wallType: "solid", glazing: "double", heating: "electric_room", floorAreaM2: 45 },
  },
  {
    id: "top-flat-tower-block",
    text: "Top floor flat in a 1960s tower block, 12 floors in total. Two bedrooms, communal heating from the building's boiler house, double glazed, flat roof above us.",
    gold: { propertyType: "flat", builtForm: "flat", flatLevel: "top", blockStoreys: 12, bedrooms: 2, ageBand: "1950_1966", heating: "heat_network", glazing: "double", roofType: "flat" },
  },
  {
    id: "newbuild-flat-district-heating",
    text: "New-build apartment, fifth floor of an eight storey block, finished 2019. One bed, 48m2. Heated by the development's district heating, triple glazing, MVHR.",
    gold: { propertyType: "flat", builtForm: "flat", flatLevel: "mid", blockStoreys: 8, ageBand: "2012_plus", bedrooms: 1, floorAreaM2: 48, heating: "heat_network", glazing: "triple" },
  },
  {
    id: "maisonette-over-shop",
    text: "Maisonette over a shop, built in the 1980s. We have the top two floors of a three storey building. Electric storage heaters, double glazing, 3 bedrooms.",
    gold: { propertyType: "maisonette", builtForm: "flat", flatLevel: "top", blockStoreys: 3, storeys: 2, ageBand: "1967_1982", heating: "electric_storage", glazing: "double", bedrooms: 3 },
  },
  {
    id: "newbuild-detached-heat-pump",
    text: "Brand new detached 4 bed built last year (2025). Air source heat pump with underfloor heating, triple glazing, 14 solar panels on the roof, smart thermostat. Fully insulated timber frame walls. 190 square metres over three storeys.",
    gold: { propertyType: "house", builtForm: "detached", bedrooms: 4, ageBand: "2012_plus", heating: "heat_pump", glazing: "triple", solarPv: "yes", controls: "smart", wallType: "timber", wallInsulation: "full", floorAreaM2: 190, storeys: 3 },
  },
  {
    id: "edwardian-end-terrace-stove",
    text: "End of terrace Edwardian house, 3 beds, solid brick, we've had internal wall insulation done on the front rooms only. Double glazed apart from the bathroom. Gas boiler, plus a wood burner in the front room.",
    gold: { propertyType: "house", builtForm: "end_terrace", bedrooms: 3, ageBand: "1900_1929", wallType: "solid", wallInsulation: "partial", glazing: "partial_double", heating: "gas_boiler", secondaryHeating: ["wood_stove"] },
  },
  {
    id: "messy-semi-fifties",
    text: "its a normal 3 bed semi i think, built round the 50s?? boiler is gas, windows were replaced like 10 yrs ago so double. no idea about walls. loft got some insulation but dunno how much",
    gold: { propertyType: "house", builtForm: "semi", bedrooms: 3, ageBand: "1950_1966", heating: "gas_boiler", glazing: "double" },
    open: ["wallType", "wallInsulation", "loftInsulationMm"],
  },
  {
    id: "messy-flat-above-chippy",
    text: "Flat above the chippy. ground floor is the shop, I'm on first. 2 bed. Heating is just those old night storage things plus I use a plug in heater when it's cold. windows are plastic double",
    gold: { propertyType: "flat", builtForm: "flat", bedrooms: 2, heating: "electric_storage", secondaryHeating: ["electric_heaters"], glazing: "double" },
  },
  {
    id: "contradiction-detached-then-semi",
    text: "Detached house, well actually it's semi-detached, joined to the neighbour on one side. 4 bedrooms. Double glazing. Gas boiler.",
    gold: { propertyType: "house", builtForm: "semi", bedrooms: 4, glazing: "double", heating: "gas_boiler" },
  },
  {
    id: "loft-topped-up-last-winter",
    text: "We had the loft insulated to 300mm last winter, before that it had nothing. Mid-terrace, 2 up 2 down, Victorian, gas combi.",
    gold: { propertyType: "house", builtForm: "mid_terrace", bedrooms: 2, ageBand: "pre1900", heating: "gas_boiler", loftInsulationMm: 300 },
  },
  {
    id: "almost-nothing-house",
    text: "Just a house, I'm not sure about much. Three bedrooms.",
    gold: { propertyType: "house", bedrooms: 3 },
    open: ["ageBand", "heating", "glazing", "wallType"],
  },
  {
    id: "almost-nothing-bought-2021",
    text: "Home in Manchester, bought it in 2021.",
    gold: {},
    open: ["ageBand", "bedrooms", "heating"],
  },
  {
    id: "heat-pump-single-glazing",
    text: "Heated by a heat pump but honestly the windows are all original single glazing and it's drafty. Detached 5 bed house built in 1992.",
    gold: { propertyType: "house", builtForm: "detached", bedrooms: 5, ageBand: "1983_1995", heating: "heat_pump", glazing: "single" },
  },
  {
    id: "retrofitted-semi-solar-nest",
    text: "Semi-detached 3 bed, 1950s. Had external wall insulation fitted in 2022 over the cavity walls, so fully insulated. Gas boiler with Nest learning thermostat, 4kW solar PV on the south roof, double glazing, 300mm loft.",
    gold: { propertyType: "house", builtForm: "semi", bedrooms: 3, ageBand: "1950_1966", wallType: "cavity", wallInsulation: "full", heating: "gas_boiler", controls: "smart", solarPv: "yes", glazing: "double", loftInsulationMm: 300 },
  },
  {
    id: "third-floor-flat-1930s-block",
    text: "Third floor flat in a 5 storey 1930s block, 2 bedrooms, gas central heating from our own combi boiler, double glazed, cavity brick walls.",
    gold: { propertyType: "flat", builtForm: "flat", flatLevel: "mid", blockStoreys: 5, bedrooms: 2, ageBand: "1930_1949", heating: "gas_boiler", glazing: "double", wallType: "cavity" },
  },
  {
    id: "basement-flat-georgian",
    text: "Lower ground floor flat, 1 bed, in a 4 storey Georgian terrace building. Solid stone walls, single glazing, electric radiators.",
    gold: { propertyType: "flat", builtForm: "flat", flatLevel: "ground", blockStoreys: 4, bedrooms: 1, ageBand: "pre1900", wallType: "solid", glazing: "single", heating: "electric_room" },
  },
  {
    id: "rural-bungalow-stove",
    text: "Detached bungalow in rural Wales, 3 bed, about 110 m2, oil central heating, a multi-fuel stove in the lounge, solid stone walls, double glazing, 200mm in the loft, no solar.",
    gold: { propertyType: "bungalow", builtForm: "detached", bedrooms: 3, floorAreaM2: 110, heating: "oil_boiler", secondaryHeating: ["wood_stove"], wallType: "solid", glazing: "double", loftInsulationMm: 200, solarPv: "no" },
  },
  {
    id: "townhouse-heat-network",
    text: "Mid terrace townhouse over three storeys, 2014 build, 3 bed. Communal heat network from the estate's energy centre, double glazing, cavity walls fully insulated as per building regs.",
    gold: { propertyType: "house", builtForm: "mid_terrace", storeys: 3, ageBand: "2012_plus", bedrooms: 3, heating: "heat_network", glazing: "double", wallType: "cavity", wallInsulation: "full" },
  },
  {
    id: "1980s-terrace-storage-gas-fire",
    text: "1980s end terrace, 2 bed, all electric with storage heaters upstairs and down. There's a gas fire in the living room but we never use it. Double glazed. Flat roof extension at the back but main roof is pitched.",
    gold: { propertyType: "house", builtForm: "end_terrace", bedrooms: 2, ageBand: "1967_1982", heating: "electric_storage", secondaryHeating: ["gas_fire"], glazing: "double", roofType: "gable" },
  },
  {
    id: "cold-cottage-open-fire",
    text: "Cold old cottage, built in the 1890s, detached, solid stone, no insulation anywhere, single glazed with wooden frames. There's an open fire and a couple of plug-in electric heaters, no central heating.",
    gold: { propertyType: "house", builtForm: "detached", ageBand: "pre1900", wallType: "solid", wallInsulation: "none", glazing: "single", secondaryHeating: ["open_fire", "electric_heaters"] },
  },
  {
    id: "2000s-detached-no-solar",
    text: "Bought a 2000s detached, 4 bed, 2 storeys, gas boiler, cavity walls insulated, double glazing, a normal thermostat but nothing smart, no solar.",
    gold: { propertyType: "house", builtForm: "detached", bedrooms: 4, storeys: 2, ageBand: "1996_2011", heating: "gas_boiler", wallType: "cavity", wallInsulation: "full", glazing: "double", solarPv: "no" },
  },
  {
    id: "council-flat-communal",
    text: "Council flat, 2nd floor, 4 floors, 1950s, 2 bed. heating's from the communal boiler. UPVC double glazing.",
    gold: { propertyType: "flat", builtForm: "flat", flatLevel: "mid", blockStoreys: 4, ageBand: "1950_1966", bedrooms: 2, heating: "heat_network", glazing: "double" },
  },
];
