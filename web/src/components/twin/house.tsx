"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Edges, Sparkles } from "@react-three/drei";
import * as THREE from "three";
import type { Element, Geometry } from "@/lib/twin/types";

export type ViewMode = "normal" | "thermal";

export const STOREY_H = 2.7;
export const PLINTH_H = 0.35;

const CLAY = new THREE.Color("#e9e6df");
const CLAY_ROOF = new THREE.Color("#3a3d44");
const THERMAL_BASE = new THREE.Color("#0d1117");
const FROST = new THREE.Color("#2f8cff");
const AMBER = new THREE.Color("#ffb020");
const EMBER = new THREE.Color("#ff3b1f");
const WARM_WINDOW = new THREE.Color("#ffcf8a");
const GLASS = new THREE.Color("#121a26");
const DOOR = new THREE.Color("#2b3f3a");
const VOLT = new THREE.Color("#3dffb0");

/** Heat share (relative to the leakiest element) -> frost blue -> amber -> ember red. */
export function thermalColor(t: number, out = new THREE.Color()) {
  const x = THREE.MathUtils.clamp(t, 0, 1);
  return x < 0.5 ? out.copy(FROST).lerp(AMBER, x / 0.5) : out.copy(AMBER).lerp(EMBER, (x - 0.5) / 0.5);
}

type SurfaceProps = {
  mode: ViewMode;
  heat: number; // 0-1, relative heat loss
  base: THREE.Color;
  highlighted?: boolean;
  glass?: boolean;
};

/** A material that eases between the clay look and the thermal look every frame. */
function useSurfaceMaterial({ mode, heat, base, highlighted, glass }: SurfaceProps) {
  const material = useMemo(
    () =>
      glass
        ? new THREE.MeshPhysicalMaterial({ roughness: 0.08, metalness: 0.2, clearcoat: 1, color: "#1b2330" })
        : new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0.02, color: base }),
    [glass, base],
  );
  // three.js materials are mutable by design; keep it in a ref so per-frame easing stays outside React.
  const ref = useRef(material);
  useEffect(() => {
    ref.current = material;
  }, [material]);
  const targetColor = useMemo(() => new THREE.Color(), []);
  const targetEmissive = useMemo(() => new THREE.Color(), []);

  useFrame((state, delta) => {
    const k = 1 - Math.exp(-delta * 6);
    const pulse = highlighted ? 0.5 + 0.5 * Math.sin(state.clock.elapsedTime * 4) : 0;
    let intensity: number;
    if (mode === "thermal") {
      // Tint the diffuse too so lighting still reads the shape, like a real thermal camera.
      thermalColor(heat, targetEmissive);
      targetColor.copy(THERMAL_BASE).lerp(targetEmissive, 0.35);
      intensity = 0.18 + heat * 0.75 + pulse * 0.6;
    } else {
      targetColor.copy(glass ? GLASS : base);
      if (glass) {
        targetEmissive.copy(WARM_WINDOW);
        intensity = 0.07 + pulse * 0.6;
      } else {
        targetEmissive.copy(VOLT);
        intensity = pulse * 0.45;
      }
    }
    const m = ref.current;
    m.color.lerp(targetColor, k);
    m.emissive.lerp(targetEmissive, k);
    m.emissiveIntensity += (intensity - m.emissiveIntensity) * k;
  });
  return material;
}

function Surface({
  children,
  ...props
}: SurfaceProps & { children: React.ReactNode } & Omit<React.ComponentProps<"mesh">, "material">) {
  const { mode, heat, base, highlighted, glass, ...meshProps } = props;
  const material = useSurfaceMaterial({ mode, heat, base, highlighted, glass });
  return (
    <mesh material={material} castShadow receiveShadow {...meshProps}>
      {children}
    </mesh>
  );
}

/** Eases a group's scale between 0 and 1 so retrofits "grow" into place. */
function Appear({ show, children, ...props }: { show: boolean; children: React.ReactNode } & React.ComponentProps<"group">) {
  const ref = useRef<THREE.Group>(null);
  useFrame((_, delta) => {
    const g = ref.current;
    if (!g) return;
    const target = show ? 1 : 0.0001;
    const s = g.scale.x + (target - g.scale.x) * (1 - Math.exp(-delta * 7));
    g.scale.setScalar(s);
    g.visible = s > 0.01;
  });
  return (
    <group ref={ref} scale={show ? 1 : 0.0001} {...props}>
      {children}
    </group>
  );
}

function Ghost({ size, position }: { size: [number, number, number]; position: [number, number, number] }) {
  return (
    <mesh position={position}>
      <boxGeometry args={size} />
      <meshBasicMaterial color="#9aa4b2" transparent opacity={0.035} depthWrite={false} />
      <Edges color="#5b6573" />
    </mesh>
  );
}

type HouseProps = {
  geometry: Geometry;
  heatLoss: Record<Element, number>;
  mode: ViewMode;
  highlight?: Element | "system" | "roof_pv" | null;
  /** Normalise heat against this share instead of the current maximum (to compare before/after). */
  heatRef?: number;
};

export function House({ geometry: g, heatLoss, mode, highlight, heatRef }: HouseProps) {
  const isFlat = g.builtForm === "flat";
  const storeys = isFlat ? 1 : Math.max(1, Math.min(4, g.storeys));
  const W = g.width;
  const D = g.depth;
  const bodyH = storeys * STOREY_H;
  const baseY = isFlat ? STOREY_H + PLINTH_H : PLINTH_H; // flats sit on a ghost floor below
  const topY = baseY + bodyH;
  const over = 0.35;
  const roofRise = g.roof === "flat" || isFlat ? 0 : (D / 2 + over) * 0.72;

  const maxShare = heatRef ?? Math.max(...Object.values(heatLoss), 0.0001);
  const heat = (e: Element) => heatLoss[e] / maxShare;
  const hl = (e: Element | "system" | "roof_pv") => highlight === e;

  const gableGeom = useMemo(() => {
    const shape = new THREE.Shape();
    shape.moveTo(-(D / 2 + over), 0);
    shape.lineTo(D / 2 + over, 0);
    shape.lineTo(0, roofRise);
    shape.closePath();
    const geom = new THREE.ExtrudeGeometry(shape, { depth: W + over * 2, bevelEnabled: false });
    geom.translate(0, 0, -(W + over * 2) / 2);
    return geom;
  }, [D, W, roofRise]);

  const hipGeom = useMemo(() => {
    const geom = new THREE.ConeGeometry(1, roofRise, 4, 1);
    geom.rotateY(Math.PI / 4);
    geom.scale((W / 2 + over) / Math.SQRT1_2, 1, (D / 2 + over) / Math.SQRT1_2);
    geom.translate(0, roofRise / 2, 0);
    return geom;
  }, [D, W, roofRise]);

  // Windows: front and back on every floor; the door takes one front slot on the ground floor.
  const windows = useMemo(() => {
    const out: { pos: [number, number, number]; rotY: number; w: number; h: number }[] = [];
    const n = Math.max(1, g.windowsPerFloor);
    for (let f = 0; f < storeys; f++) {
      const y = baseY + f * STOREY_H + STOREY_H * 0.55;
      for (let i = 0; i < n; i++) {
        const x = -W / 2 + ((i + 0.5) * W) / n;
        const isDoorSlot = f === 0 && !isFlat && i === n - 1;
        if (!isDoorSlot) out.push({ pos: [x, y, D / 2 + 0.02], rotY: 0, w: Math.min(1.25, (W / n) * 0.6), h: 1.3 });
        out.push({ pos: [x, y, -D / 2 - 0.02], rotY: Math.PI, w: Math.min(1.25, (W / n) * 0.6), h: 1.3 });
      }
      if (g.builtForm === "detached") {
        out.push({ pos: [W / 2 + 0.02, y, 0], rotY: Math.PI / 2, w: 1.0, h: 1.2 });
        out.push({ pos: [-W / 2 - 0.02, y, 0], rotY: -Math.PI / 2, w: 1.0, h: 1.2 });
      }
    }
    return out;
  }, [g.windowsPerFloor, g.builtForm, storeys, baseY, W, D, isFlat]);

  const doorX = -W / 2 + ((Math.max(1, g.windowsPerFloor) - 0.5) * W) / Math.max(1, g.windowsPerFloor);

  // Neighbours: attached homes and the rest of a block of flats are drawn as ghosts.
  const neighbourH = (isFlat ? 3 * STOREY_H : bodyH) + PLINTH_H;
  const ghosts: { size: [number, number, number]; position: [number, number, number] }[] = [];
  if (g.builtForm === "semi" || g.builtForm === "end_terrace" || g.builtForm === "mid_terrace")
    ghosts.push({ size: [W, neighbourH + roofRise * 0.6, D], position: [-W - 0.01, (neighbourH + roofRise * 0.6) / 2, 0] });
  if (g.builtForm === "mid_terrace")
    ghosts.push({ size: [W, neighbourH + roofRise * 0.6, D], position: [W + 0.01, (neighbourH + roofRise * 0.6) / 2, 0] });
  if (g.builtForm === "end_terrace")
    ghosts.push({ size: [W, neighbourH + roofRise * 0.6, D], position: [-2 * W - 0.02, (neighbourH + roofRise * 0.6) / 2, 0] });
  if (isFlat) {
    ghosts.push({ size: [W + 0.02, STOREY_H + PLINTH_H, D + 0.02], position: [0, (STOREY_H + PLINTH_H) / 2, 0] });
    ghosts.push({ size: [W + 0.02, STOREY_H, D + 0.02], position: [0, topY + STOREY_H / 2, 0] });
  }

  const heatPumpPos: [number, number, number] =
    g.builtForm === "mid_terrace" || g.builtForm === "flat" ? [0, 0.45, -D / 2 - 0.7] : [W / 2 + 0.9, 0.45, D * 0.15];

  const slope = Math.atan2(roofRise, D / 2 + over);
  const panelRows = 2;
  const panelCols = Math.max(2, Math.floor((W - 0.8) / 1.05));

  return (
    <group>
      {/* floor slab / plinth */}
      <Surface mode={mode} heat={heat("floor")} base={CLAY_ROOF} highlighted={hl("floor")} position={[0, baseY - PLINTH_H / 2, 0]}>
        <boxGeometry args={[W + 0.12, PLINTH_H, D + 0.12]} />
      </Surface>

      {/* walls */}
      <Surface mode={mode} heat={heat("walls")} base={CLAY} highlighted={hl("walls")} position={[0, baseY + bodyH / 2, 0]}>
        <boxGeometry args={[W, bodyH, D]} />
        <Edges threshold={30} color={mode === "thermal" ? "#ffffff" : "#8a8f98"} transparent opacity={0.18} />
      </Surface>

      {/* roof */}
      {!isFlat && g.roof === "gable" && (
        <Surface mode={mode} heat={heat("roof")} base={CLAY_ROOF} highlighted={hl("roof")} geometry={gableGeom} position={[0, topY, 0]} rotation={[0, -Math.PI / 2, 0]}>
          {null}
        </Surface>
      )}
      {!isFlat && g.roof === "hip" && (
        <Surface mode={mode} heat={heat("roof")} base={CLAY_ROOF} highlighted={hl("roof")} geometry={hipGeom} position={[0, topY, 0]}>
          {null}
        </Surface>
      )}
      {(isFlat || g.roof === "flat") && (
        <Surface mode={mode} heat={heat("roof")} base={CLAY_ROOF} highlighted={hl("roof")} position={[0, topY + 0.12, 0]}>
          <boxGeometry args={[W + 0.2, 0.24, D + 0.2]} />
        </Surface>
      )}

      {/* chimney */}
      {g.chimney && !isFlat && g.roof !== "flat" && (
        <Surface mode={mode} heat={heat("roof") * 0.6} base={CLAY} position={[-W * 0.28, topY + roofRise * 0.75, -D * 0.12]}>
          <boxGeometry args={[0.6, roofRise * 0.9 + 0.6, 0.6]} />
        </Surface>
      )}

      {/* windows */}
      {windows.map((w, i) => (
        <group key={i} position={w.pos} rotation={[0, w.rotY, 0]}>
          <mesh position={[0, 0, -0.005]}>
            <planeGeometry args={[w.w + 0.16, w.h + 0.16]} />
            <meshStandardMaterial color={mode === "thermal" ? "#0a0d12" : "#f6f4ef"} roughness={0.6} />
          </mesh>
          <Surface mode={mode} heat={heat("windows")} base={CLAY} glass highlighted={hl("windows")} position={[0, 0, 0.005]}>
            <planeGeometry args={[w.w, w.h]} />
          </Surface>
        </group>
      ))}

      {/* front door: draughts leak around it */}
      {!isFlat && (
        <Surface mode={mode} heat={heat("draughts")} base={DOOR} highlighted={hl("draughts")} position={[doorX, baseY + 1.05, D / 2 + 0.03]}>
          <boxGeometry args={[0.95, 2.1, 0.06]} />
        </Surface>
      )}

      {/* draughts as rising embers in thermal view */}
      {mode === "thermal" && (
        <Sparkles
          count={Math.round(10 + heat("draughts") * 50)}
          scale={[W + 1.2, bodyH + roofRise, D + 1.2]}
          position={[0, baseY + (bodyH + roofRise) / 2, 0]}
          size={3.5}
          speed={0.45}
          color="#ff7a3d"
          opacity={0.9}
        />
      )}

      {/* solar panels on the front slope */}
      <Appear show={g.hasSolar && !isFlat && g.roof !== "flat"}>
        <group
          position={[0, topY + roofRise / 2 + 0.06, (D / 2 + over) / 2]}
          rotation={[slope, 0, 0]}
        >
          {Array.from({ length: panelRows * panelCols }, (_, i) => {
            const r = Math.floor(i / panelCols);
            const c = i % panelCols;
            const x = (c - (panelCols - 1) / 2) * 1.05;
            const z = (r - (panelRows - 1) / 2) * 1.7;
            return (
              <mesh key={i} position={[x, 0, z]} castShadow>
                <boxGeometry args={[1.0, 0.05, 1.65]} />
                <meshPhysicalMaterial color="#0f1d3a" metalness={0.6} roughness={0.15} clearcoat={1} emissive={hl("roof_pv") ? "#3dffb0" : "#000"} emissiveIntensity={0.4} />
              </mesh>
            );
          })}
        </group>
      </Appear>

      {/* heat pump unit */}
      <Appear show={g.hasHeatPump} position={heatPumpPos}>
        <mesh castShadow>
          <boxGeometry args={[1.0, 0.8, 0.42]} />
          <meshStandardMaterial color="#d9dde3" roughness={0.4} metalness={0.3} emissive={hl("system") ? "#3dffb0" : "#000"} emissiveIntensity={0.5} />
        </mesh>
        <mesh position={[0.18, 0, 0.215]} rotation={[0, 0, 0]}>
          <circleGeometry args={[0.28, 32]} />
          <meshStandardMaterial color="#20252c" roughness={0.9} />
        </mesh>
      </Appear>

      {ghosts.map((gh, i) => (
        <Ghost key={i} {...gh} />
      ))}
    </group>
  );
}

/** Where the camera goes when an element is in focus. [camera xyz, target xyz] */
export function focusFor(el: Element | "system" | "roof_pv" | null | undefined, g: Geometry): [number, number, number, number, number, number] {
  const H = (g.builtForm === "flat" ? 2 : g.storeys) * STOREY_H;
  switch (el) {
    case "roof":
    case "roof_pv":
      return [5, H + 10, 11, 0, H, 0];
    case "walls":
      return [13, H * 0.55, 7, 0, H * 0.45, 0];
    case "windows":
      return [1.5, H * 0.55, 14, 0, H * 0.5, 0];
    case "floor":
      return [9, 1.2, 10, 0, 0.4, 0];
    case "draughts":
      return [-3, 2.5, 11, 0, 1.4, 0];
    case "system":
      return [10, 3, 4, 2, 1, 0];
    default:
      return [11, H * 0.9 + 3, 14, 0, H * 0.45, 0];
  }
}
