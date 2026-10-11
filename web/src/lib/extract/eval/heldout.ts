import type { EvalCase } from "./cases";

/**
 * Held-out descriptions, written separately from the rules and never used to tune them, in the varied way people
 * actually describe homes. Report extraction accuracy on these; `cases.ts` is the development set.
 */
export const HELDOUT: EvalCase[] = [
  {
    id: "ho-ex-council-semi",
    text: "We bought our ex-council semi in 2019. It was built around 1952, has cavity walls (we had them injected with foam a few years back) and the windows are all uPVC double glazed. Worcester boiler, put in 2016, with a Nest. 3 bedrooms plus a through lounge.",
    gold: { propertyType: "house", builtForm: "semi", ageBand: "1950_1966", wallType: "cavity", wallInsulation: "full", glazing: "double", heating: "gas_boiler", boilerAge: "from_2005", controls: "smart", rooms: 4 },
  },
  {
    id: "ho-georgian-townhouse",
    text: "Grade II listed Georgian townhouse, four storeys, stone walls, original single glazed windows throughout. Heated by an old gas boiler from the 90s, just a timer on it.",
    gold: { propertyType: "house", ageBand: "pre1900", storeys: 4, wallType: "stone", glazing: "single", heating: "gas_boiler", boilerAge: "before_2005", controls: "programmer" },
    open: ["solarPv"],
  },
  {
    id: "ho-newbuild-flat-heat-pump",
    text: "2nd floor flat in a 6 storey block finished in 2023. Air source heat pump, triple glazing, about 58m2, one bed with an open-plan living room.",
    gold: { propertyType: "flat", flatLevel: "mid", blockStoreys: 6, ageBand: "2022_plus", heating: "heat_pump_air", glazing: "triple", floorAreaM2: 58, rooms: 2 },
  },
  {
    id: "ho-bungalow-oil",
    text: "Detached bungalow in rural Norfolk, 1970-ish. Oil fired boiler, no mains gas out here. Loft insulation is about 150mm. Some of the windows are still single glazed but most are double.",
    gold: { propertyType: "bungalow", builtForm: "detached", ageBand: "1967_1975", heating: "oil_boiler", loftInsulation: "some", glazing: "mostly_double" },
  },
  {
    id: "ho-top-floor-electric",
    text: "Top floor flat (the building has 4 floors), electric storage heaters, double glazing. Built in the late 80s. Flat roof above us, no idea about insulation.",
    gold: { propertyType: "flat", flatLevel: "top", blockStoreys: 4, heating: "electric_storage", glazing: "double", ageBand: "1983_1990", roofType: "flat" },
    open: ["flatRoofInsulation"],
  },
  {
    id: "ho-edwardian-end",
    text: "Edwardian end of terrace, 1908. Solid brick, internal wall insulation in the back bedroom only. Suspended timber floors downstairs, not insulated. 16 solar panels on the roof.",
    gold: { propertyType: "house", builtForm: "end_terrace", ageBand: "1900_1929", wallType: "solid_brick", wallInsulation: "partial", floorType: "suspended", floorInsulation: "none", solarPv: "yes", solarKw: 6.4 },
  },
  {
    id: "ho-epc-quoted",
    text: "Our EPC says D, score 63. Semi-detached, cavity walls unfilled, 1960s, gas combi.",
    gold: { epcBand: "D", sapScore: 63, propertyType: "house", builtForm: "semi", wallType: "cavity", wallInsulation: "none", ageBand: "1950_1966", heating: "gas_boiler" },
  },
  {
    id: "ho-maisonette-ground",
    text: "Ground floor maisonette over two levels in a 1930s building. Gas boiler replaced last year. No loft — there's another flat on top.",
    gold: { propertyType: "maisonette", flatLevel: "ground", ageBand: "1930_1949", heating: "gas_boiler", boilerAge: "from_2005", storeys: 2 },
  },
  {
    id: "ho-detached-90s",
    text: "Four bedroom detached built in 1994 by Barratt, cavity walls filled when built, 200mm of loft insulation, double glazing, gas boiler with a room thermostat and TRVs, conservatory on the back. About 140 square metres.",
    gold: { propertyType: "house", builtForm: "detached", ageBand: "1991_1995", wallType: "cavity", wallInsulation: "full", loftInsulation: "thick", glazing: "double", heating: "gas_boiler", controls: "thermostat_trvs", floorAreaM2: 140 },
  },
  {
    id: "ho-no-solar-negation",
    text: "Mid-terrace from about 1920, no solar, no wall insulation, loft is basically bare.",
    gold: { propertyType: "house", builtForm: "mid_terrace", ageBand: "1900_1929", solarPv: "no", wallInsulation: "none", loftInsulation: "none" },
  },
  {
    id: "ho-district-heating",
    text: "Flat on the 9th floor of a 1972 tower block (20 floors), heated by the estate's district heating system, double glazed.",
    gold: { propertyType: "flat", flatLevel: "mid", blockStoreys: 20, ageBand: "1967_1975", heating: "heat_network", glazing: "double" },
  },
  {
    id: "ho-voice-style",
    text: "um so it's a semi, two up two down, built nineteen thirty something, gas boiler that's ancient, single glazing in the front, double at the back",
    gold: { propertyType: "house", builtForm: "semi", rooms: 4, ageBand: "1930_1949", heating: "gas_boiler", boilerAge: "before_2005", glazing: "partial_double" },
  },
  {
    id: "ho-ground-source",
    text: "Self-build timber frame house from 2010 with a ground source heat pump and underfloor heating, 4kW of solar PV, smart zoned controls.",
    gold: { propertyType: "house", ageBand: "2007_2011", wallType: "timber", heating: "heat_pump_ground", solarPv: "yes", solarKw: 4, controls: "smart" },
  },
  {
    id: "ho-stone-cottage",
    text: "Stone cottage, probably 1850s, solid floors, the loft has maybe 50mm of old fibreglass. Wood burner and electric heaters, no gas.",
    gold: { propertyType: "house", ageBand: "pre1900", wallType: "stone", floorType: "solid", loftInsulation: "thin" },
  },
];
