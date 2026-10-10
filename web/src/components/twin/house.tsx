"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Edges, Sparkles } from "@react-three/drei";
import * as THREE from "three";
import { GlazingSection, HeatingUnit, LoftLayer, Scaffold, WallSection } from "./cutaways";
import type { Element, Geometry } from "@/lib/twin/types";

export type ViewMode = "normal" | "thermal";
export type Highlight = Element | "system" | "roof_pv" | null;
/** Which parts are built, for the assembly animation. Missing keys count as built. */
export type Parts = Partial<Record<"body" | "roof" | "windows" | "system" | "solar", boolean>>;
/** Record fields that only change the cutaway callouts, not the house shape. */
export type HouseDetail = { wallType?: string; wallInsulation?: string; loftInsulationMm?: number; glazing?: string; heating?: string };

export const STOREY_H = 2.7;
export const PLINTH_H = 0.35;
const ROOF_OVERHANG = 0.35;

/**
 * Vertical layout of the home. Houses stand on the ground; a flat is `storeys` tall, starts on
 * `floorIndex` and sits in a block of `blockStoreys` (drawn as ghosts above and below).
 */
export function houseLayout(g: Geometry) {
  const isFlat = g.builtForm === "flat";
  const storeys = Math.max(1, Math.min(4, Math.round(g.storeys) || 1));
  // Tall blocks are drawn at most 8 floors high; the home keeps its relative place (top stays top).
  const rawBlock = Math.max(storeys, Math.round(g.blockStoreys ?? 3));
  const rawFloor = g.floorIndex ?? (g.isTopFloor ? rawBlock - storeys : Math.min(1, rawBlock - storeys));
  const blockStoreys = isFlat ? Math.min(8, rawBlock) : storeys;
  const top = rawFloor + storeys >= rawBlock;
  const floorIndex = !isFlat ? 0 : top ? blockStoreys - storeys : Math.max(0, Math.min(blockStoreys - storeys - 1, Math.round((rawFloor * blockStoreys) / rawBlock)));
  const baseY = PLINTH_H + floorIndex * STOREY_H;
  const bodyH = storeys * STOREY_H;
  const topY = baseY + bodyH;
  const hasRoofAbove = !isFlat || floorIndex + storeys >= blockStoreys;
  const roofRise = !hasRoofAbove || g.roof === "flat" ? 0 : (g.depth / 2 + ROOF_OVERHANG) * 0.72;
  return { isFlat, storeys, blockStoreys, floorIndex, baseY, bodyH, topY, blockTopY: PLINTH_H + blockStoreys * STOREY_H, hasRoofAbove, roofRise };
}

const FROST = new THREE.Color("#2f8cff");
const AMBER = new THREE.Color("#ffb020");
const EMBER = new THREE.Color("#ff3b1f");
const THERMAL_BASE = new THREE.Color("#0d1117");
const VOLT = new THREE.Color("#3dffb0");
const WARM_WINDOW = new THREE.Color("#ffcf8a");
const FADED = 0.12;

let reducedMotion: boolean | undefined;
/** Animations snap instead of easing when the user asks for reduced motion. */
function easeFactor(delta: number, rate: number) {
  reducedMotion ??= window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  return reducedMotion ? 1 : 1 - Math.exp(-delta * rate);
}

/** Heat share (relative to the leakiest element) -> frost blue -> amber -> ember red. */
function thermalColor(t: number, out: THREE.Color) {
  const x = THREE.MathUtils.clamp(t, 0, 1);
  return x < 0.5 ? out.copy(FROST).lerp(AMBER, x / 0.5) : out.copy(AMBER).lerp(EMBER, (x - 0.5) / 0.5);
}

type Slot = "walls" | "roof" | "floor" | "windows" | "frames" | "door" | "chimney";

const SLOTS: { slot: Slot; element: Element; base: string; glass?: boolean; heatScale?: number }[] = [
  { slot: "walls", element: "walls", base: "#e9e6df" },
  { slot: "roof", element: "roof", base: "#3a3d44" },
  { slot: "floor", element: "floor", base: "#3a3d44" },
  { slot: "windows", element: "windows", base: "#121a26", glass: true },
  { slot: "frames", element: "windows", base: "#f6f4ef" },
  { slot: "door", element: "draughts", base: "#2b3f3a" },
  { slot: "chimney", element: "roof", base: "#e9e6df", heatScale: 0.6 },
];

/** Opacity of an element while `isolate` is in focus. The roof turns glassy for its own step so the loft shows. */
function opacityFor(isolate: Highlight, element: Element) {
  if (!isolate) return 1;
  if (isolate === "roof" && element === "roof") return 0.35;
  return isolate === element || (isolate === "roof_pv" && element === "roof") ? 1 : FADED;
}

/**
 * One material per house part (not per mesh), eased toward the clay or thermal look in a single
 * frame callback. Requests a new frame only while something is still changing, so the canvas can
 * run on demand. Parts outside `isolate` fade to a ghost so the one being edited stands out.
 */
function useHouseMaterials(mode: ViewMode, heat: (e: Element) => number, highlight: Highlight, isolate: Highlight) {
  const materials = useMemo(() => {
    const out = {} as Record<Slot, THREE.MeshStandardMaterial>;
    for (const s of SLOTS)
      out[s.slot] = new THREE.MeshStandardMaterial({
        color: s.base,
        roughness: s.glass ? 0.1 : 0.85,
        metalness: s.glass ? 0.4 : 0.02,
        envMapIntensity: s.glass ? 1.6 : 1,
        // Always blended so parts can fade without a shader recompile (three.js compiles opaque materials separately).
        transparent: true,
      });
    return out;
  }, []);
  const tmp = useMemo(() => ({ color: new THREE.Color(), emissive: new THREE.Color(), base: new THREE.Color() }), []);
  // Own time accumulator for the highlight pulse rather than R3F's clock (THREE.Clock is deprecated).
  const time = useRef(0);

  /* eslint-disable react-hooks/immutability -- three.js materials are meant to be mutated per frame (R3F pattern) */
  useFrame((state, delta) => {
    const k = easeFactor(delta, 6);
    time.current += delta;
    let moving = false;
    for (const s of SLOTS) {
      const m = materials[s.slot];
      const lit = highlight === s.element;
      const pulse = lit ? 0.5 + 0.5 * Math.sin(time.current * 4) : 0;
      const h = heat(s.element) * (s.heatScale ?? 1);
      tmp.base.set(s.base);
      let intensity: number;
      if (mode === "thermal") {
        // Tint the diffuse too so lighting still reads the shape, like a real thermal camera.
        thermalColor(h, tmp.emissive);
        tmp.color.copy(THERMAL_BASE).lerp(tmp.emissive, 0.35);
        intensity = 0.18 + h * 0.75 + pulse * 0.6;
      } else {
        tmp.color.copy(tmp.base);
        tmp.emissive.copy(s.glass ? WARM_WINDOW : VOLT);
        intensity = (s.glass ? 0.07 : 0) + pulse * 0.5;
      }
      const before = m.emissiveIntensity;
      const opacity = opacityFor(isolate, s.element);
      if (Math.abs(m.opacity - opacity) > 0.002) {
        m.opacity += (opacity - m.opacity) * k;
        moving = true;
      } else m.opacity = opacity;
      m.depthWrite = m.opacity > 0.5;
      m.color.lerp(tmp.color, k);
      m.emissive.lerp(tmp.emissive, k);
      m.emissiveIntensity += (intensity - m.emissiveIntensity) * k;
      if (lit || Math.abs(before - intensity) > 0.002 || !m.color.equals(tmp.color)) moving = true;
      if (Math.abs(m.color.r - tmp.color.r) + Math.abs(m.color.g - tmp.color.g) + Math.abs(m.color.b - tmp.color.b) < 0.002) m.color.copy(tmp.color);
    }
    if (moving) state.invalidate();
  });
  /* eslint-enable react-hooks/immutability */
  return materials;
}

type AppearVariant = "scale" | "grow" | "drop";

function applyAppear(g: THREE.Group, variant: AppearVariant, p: number) {
  const s = Math.max(p, 0.0001);
  if (variant === "scale") g.scale.setScalar(s);
  else if (variant === "grow") g.scale.set(1, s, 1);
  else g.position.y = (1 - p) * 5;
  g.visible = p > 0.01;
}

/**
 * Eases a part in or out: "scale" pops it from its origin (retrofits), "grow" raises it from the
 * ground (walls), "drop" lowers it from above (roof). Starts settled, so only changes animate.
 */
function Appear({ show, variant = "scale", children, ...props }: { show: boolean; variant?: AppearVariant; children: React.ReactNode } & React.ComponentProps<"group">) {
  const ref = useRef<THREE.Group>(null);
  const progress = useRef(show ? 1 : 0);
  useEffect(() => {
    if (ref.current) applyAppear(ref.current, variant, progress.current);
  }, [variant]);
  useFrame((state, delta) => {
    const g = ref.current;
    if (!g) return;
    const target = show ? 1 : 0;
    if (progress.current === target) return;
    const p = progress.current + (target - progress.current) * easeFactor(delta, variant === "scale" ? 7 : 5);
    progress.current = Math.abs(target - p) < 0.002 ? target : p;
    applyAppear(g, variant, progress.current);
    state.invalidate();
  });
  return (
    <group {...props}>
      <group ref={ref}>{children}</group>
    </group>
  );
}

const ghostMaterial = new THREE.MeshBasicMaterial({ color: "#9aa4b2", transparent: true, opacity: 0.035, depthWrite: false });
const panelMaterial = new THREE.MeshStandardMaterial({ color: "#0f1d3a", metalness: 0.7, roughness: 0.2 });
const pumpMaterial = new THREE.MeshStandardMaterial({ color: "#d9dde3", roughness: 0.4, metalness: 0.3 });
const fanMaterial = new THREE.MeshStandardMaterial({ color: "#20252c", roughness: 0.9 });

function Ghost({ size, position }: { size: [number, number, number]; position: [number, number, number] }) {
  return (
    <mesh position={position} material={ghostMaterial}>
      <boxGeometry args={size} />
      <Edges color="#5b6573" />
    </mesh>
  );
}

type HouseProps = {
  geometry: Geometry;
  heatLoss: Record<Element, number>;
  mode: ViewMode;
  highlight?: Highlight;
  /** Normalise heat against this share instead of the current maximum (to compare before/after). */
  heatRef?: number;
  /** Fade every other part and show this part's cutaway callout. */
  isolate?: Highlight;
  parts?: Parts;
  /** Show a scanning wireframe while the body isn't built yet. */
  scan?: boolean;
  detail?: HouseDetail;
};

export function House({ geometry: g, heatLoss, mode, highlight = null, heatRef, isolate = null, parts = {}, scan = false, detail }: HouseProps) {
  const { isFlat, storeys, floorIndex, baseY, bodyH, topY, blockTopY, hasRoofAbove, roofRise } = houseLayout(g);
  const W = g.width;
  const D = g.depth;


  const maxShare = heatRef ?? Math.max(...Object.values(heatLoss), 0.0001);
  const heat = (e: Element) => heatLoss[e] / maxShare;
  const mat = useHouseMaterials(mode, heat, highlight, isolate);
  // On-demand canvas: kick a frame whenever inputs change; the easing then keeps itself going.
  const invalidate = useThree((st) => st.invalidate);
  useEffect(() => invalidate(), [invalidate, mode, highlight, heatLoss, heatRef, g, isolate, parts, detail]);
  const built = { body: true, roof: true, windows: true, system: true, solar: true, ...parts };

  const gableGeom = useMemo(() => {
    const shape = new THREE.Shape();
    shape.moveTo(-(D / 2 + ROOF_OVERHANG), 0);
    shape.lineTo(D / 2 + ROOF_OVERHANG, 0);
    shape.lineTo(0, roofRise);
    shape.closePath();
    const geom = new THREE.ExtrudeGeometry(shape, { depth: W + ROOF_OVERHANG * 2, bevelEnabled: false });
    geom.translate(0, 0, -(W + ROOF_OVERHANG * 2) / 2);
    return geom;
  }, [D, W, roofRise]);

  const hipGeom = useMemo(() => {
    const geom = new THREE.ConeGeometry(1, roofRise, 4, 1);
    geom.rotateY(Math.PI / 4);
    geom.scale((W / 2 + ROOF_OVERHANG) / Math.SQRT1_2, 1, (D / 2 + ROOF_OVERHANG) / Math.SQRT1_2);
    geom.translate(0, roofRise / 2, 0);
    return geom;
  }, [D, W, roofRise]);

  // Windows: front and back on every floor; the door takes one front slot on the ground floor.
  const windows = useMemo(() => {
    const out: { pos: [number, number, number]; rotY: number; w: number; h: number }[] = [];
    const n = Math.max(1, g.windowsPerFloor);
    const ww = Math.min(1.25, (W / n) * 0.6);
    for (let f = 0; f < storeys; f++) {
      const y = baseY + f * STOREY_H + STOREY_H * 0.55;
      for (let i = 0; i < n; i++) {
        const x = -W / 2 + ((i + 0.5) * W) / n;
        if (!(f === 0 && floorIndex === 0 && i === n - 1)) out.push({ pos: [x, y, D / 2 + 0.02], rotY: 0, w: ww, h: 1.3 });
        out.push({ pos: [x, y, -D / 2 - 0.02], rotY: Math.PI, w: ww, h: 1.3 });
      }
      if (g.builtForm === "detached") {
        out.push({ pos: [W / 2 + 0.02, y, 0], rotY: Math.PI / 2, w: 1.0, h: 1.2 });
        out.push({ pos: [-W / 2 - 0.02, y, 0], rotY: -Math.PI / 2, w: 1.0, h: 1.2 });
      }
    }
    return out;
  }, [g.windowsPerFloor, g.builtForm, storeys, baseY, W, D, floorIndex]);

  const n = Math.max(1, g.windowsPerFloor);
  const doorX = -W / 2 + ((n - 0.5) * W) / n;

  // Neighbours: attached homes and the rest of a block of flats are drawn as ghosts.
  const ghostH = (isFlat ? blockTopY : bodyH + PLINTH_H) + roofRise * 0.6;
  const ghosts: { size: [number, number, number]; position: [number, number, number] }[] = [];
  if (g.builtForm === "semi" || g.builtForm === "end_terrace" || g.builtForm === "mid_terrace")
    ghosts.push({ size: [W, ghostH, D], position: [-W - 0.01, ghostH / 2, 0] });
  if (g.builtForm === "mid_terrace") ghosts.push({ size: [W, ghostH, D], position: [W + 0.01, ghostH / 2, 0] });
  if (g.builtForm === "end_terrace") ghosts.push({ size: [W, ghostH, D], position: [-2 * W - 0.02, ghostH / 2, 0] });
  if (isFlat) {
    const lowerH = baseY - PLINTH_H;
    if (lowerH > 0) ghosts.push({ size: [W + 0.02, lowerH, D + 0.02], position: [0, lowerH / 2, 0] });
    if (blockTopY > topY) ghosts.push({ size: [W + 0.02, blockTopY - topY, D + 0.02], position: [0, (topY + blockTopY) / 2, 0] });
  }

  const heatPumpPos = systemAnchor(g);

  const slope = Math.atan2(roofRise, D / 2 + ROOF_OVERHANG);
  const panelCols = Math.max(2, Math.floor((W - 0.8) / 1.05));
  const pitched = hasRoofAbove && g.roof !== "flat";

  return (
    <group>
      {scan && !built.body && <Scaffold width={W} depth={D} baseY={baseY} height={bodyH + roofRise} />}

      <Appear show={built.body} variant="grow">
        <mesh material={mat.floor} position={[0, baseY - PLINTH_H / 2, 0]}>
          <boxGeometry args={[W + 0.12, PLINTH_H, D + 0.12]} />
        </mesh>

        <mesh material={mat.walls} position={[0, baseY + bodyH / 2, 0]}>
          <boxGeometry args={[W, bodyH, D]} />
          <Edges threshold={30} color={mode === "thermal" ? "#ffffff" : "#8a8f98"} transparent opacity={0.18} />
        </mesh>

        {floorIndex === 0 && (
          <mesh material={mat.door} position={[doorX, baseY + 1.05, D / 2 + 0.03]}>
            <boxGeometry args={[0.95, 2.1, 0.06]} />
          </mesh>
        )}
      </Appear>

      <Appear show={built.roof} variant="drop">
        {pitched && g.roof === "gable" && <mesh material={mat.roof} geometry={gableGeom} position={[0, topY, 0]} rotation={[0, -Math.PI / 2, 0]} />}
        {pitched && g.roof === "hip" && <mesh material={mat.roof} geometry={hipGeom} position={[0, topY, 0]} />}
        {hasRoofAbove && !pitched && (
          <mesh material={mat.roof} position={[0, topY + 0.12, 0]}>
            <boxGeometry args={[W + 0.2, 0.24, D + 0.2]} />
          </mesh>
        )}

        {g.chimney && pitched && (
          <mesh material={mat.chimney} position={[-W * 0.28, topY + roofRise * 0.75, -D * 0.12]}>
            <boxGeometry args={[0.6, roofRise * 0.9 + 0.6, 0.6]} />
          </mesh>
        )}
      </Appear>

      <Appear show={built.windows}>
        {windows.map((w, i) => (
          <group key={i} position={w.pos} rotation={[0, w.rotY, 0]}>
            <mesh material={mat.frames} position={[0, 0, -0.005]} visible={mode === "normal"}>
              <planeGeometry args={[w.w + 0.16, w.h + 0.16]} />
            </mesh>
            <mesh material={mat.windows} position={[0, 0, 0.005]}>
              <planeGeometry args={[w.w, w.h]} />
            </mesh>
          </group>
        ))}
      </Appear>

      {detail && (
        <>
          <Appear show={isolate === "walls"} position={[W / 2 + 1.6, baseY + 0.3, D / 2 + 0.2]}>
            <WallSection wallType={detail.wallType} insulation={detail.wallInsulation} />
          </Appear>
          <Appear show={isolate === "roof" && hasRoofAbove} position={[0, topY, 0]}>
            <LoftLayer width={W} depth={D} mm={Number(detail.loftInsulationMm ?? 0)} />
          </Appear>
          <Appear show={isolate === "windows"} position={[W / 2 + 1.3, baseY + STOREY_H * 0.55, D / 2 + 1.2]} rotation={[0, -0.7, 0]}>
            <GlazingSection glazing={detail.glazing} />
          </Appear>
          <Appear show={built.system && !g.hasHeatPump && Boolean(detail.heating)} position={heatPumpPos}>
            <HeatingUnit heating={detail.heating} />
          </Appear>
        </>
      )}

      {/* draughts as rising embers in thermal view */}
      {mode === "thermal" && (
        <Sparkles
          count={Math.round(10 + heat("draughts") * 40)}
          scale={[W + 1.2, bodyH + roofRise, D + 1.2]}
          position={[0, baseY + (bodyH + roofRise) / 2, 0]}
          size={3.5}
          speed={0.45}
          color="#ff7a3d"
          opacity={0.9}
        />
      )}

      <Appear show={built.solar && g.hasSolar && pitched}>
        <group position={[0, topY + roofRise / 2 + 0.06, (D / 2 + ROOF_OVERHANG) / 2]} rotation={[slope, 0, 0]}>
          {Array.from({ length: 2 * panelCols }, (_, i) => {
            const r = Math.floor(i / panelCols);
            const c = i % panelCols;
            return (
              <mesh key={i} material={panelMaterial} position={[(c - (panelCols - 1) / 2) * 1.05, 0, (r - 0.5) * 1.7]}>
                <boxGeometry args={[1.0, 0.05, 1.65]} />
              </mesh>
            );
          })}
        </group>
      </Appear>

      {/* Flat roofs, including the block's roof above a flat (shared panels). */}
      <Appear show={built.solar && g.hasSolar && !pitched}>
        <group position={[0, (hasRoofAbove ? topY : blockTopY) + 0.35, 0]} rotation={[0.22, 0, 0]}>
          {Array.from({ length: 2 * panelCols }, (_, i) => {
            const r = Math.floor(i / panelCols);
            const c = i % panelCols;
            return (
              <mesh key={i} material={panelMaterial} position={[(c - (panelCols - 1) / 2) * 1.05, 0, (r - 0.5) * 1.7]}>
                <boxGeometry args={[1.0, 0.05, 1.65]} />
              </mesh>
            );
          })}
        </group>
      </Appear>

      <Appear show={built.system && g.hasHeatPump} position={heatPumpPos}>
        <mesh material={pumpMaterial}>
          <boxGeometry args={[1.0, 0.8, 0.42]} />
        </mesh>
        <mesh material={fanMaterial} position={[0.18, 0, 0.215]}>
          <circleGeometry args={[0.28, 24]} />
        </mesh>
      </Appear>

      {ghosts.map((gh, i) => (
        <Ghost key={i} {...gh} />
      ))}
    </group>
  );
}

/** Where the camera goes when an element is in focus. [camera xyz, target xyz] */
export function focusFor(el: Highlight | undefined, g: Geometry): [number, number, number, number, number, number] {
  const { baseY, bodyH, topY, isFlat, hasRoofAbove, blockTopY } = houseLayout(g);
  const centerY = baseY + bodyH / 2;
  // A flat below the top floor has no roof of its own; the block's roof is where panels would go.
  const roofY = isFlat && !hasRoofAbove ? blockTopY : topY;

  switch (el) {
    case "roof":
    case "roof_pv":
      return [5, roofY + 7, 11, 0, roofY, 0];
    case "walls":
      return [13, centerY, 7, 0, centerY, 0];
    case "windows":
      return [1.5, centerY, 14, 0, centerY, 0];
    case "floor":
      return [9, baseY + 0.8, 10, 0, baseY, 0];
    case "draughts":
      return [-3, baseY + 1.5, 11, 0, baseY + 1, 0];
    case "system": {
      const [x, , z] = systemAnchor(g);
      return z < 0 ? [x + 4, 3, z - 8, x, 1, z] : [x + 7, 3, z + 5, x, 1, z];
    }
    default:
      return [11, centerY + 3.2, 14, 0, centerY, 0];
  }
}

/** Radius of the sphere the default camera fits: the home, attached neighbours, and a floor of block either side of a flat. */
export function frameRadius(g: Geometry) {
  const { isFlat, bodyH } = houseLayout(g);
  const H = isFlat ? bodyH + 2 * STOREY_H : bodyH + 2;
  const attached = g.builtForm === "detached" || isFlat ? 0 : g.width * 0.6;
  return 0.5 * Math.hypot(g.width + attached, g.depth, H);
}

/** Where the heating system sits: beside the house, or behind it when there is no free side wall. */
export function systemAnchor(g: Geometry): [number, number, number] {
  return g.builtForm === "mid_terrace" || g.builtForm === "flat" ? [0, 0.45, -g.depth / 2 - 0.7] : [g.width / 2 + 0.9, 0.45, g.depth * 0.15];
}
