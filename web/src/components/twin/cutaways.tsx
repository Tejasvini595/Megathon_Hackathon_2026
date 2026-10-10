"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Edges } from "@react-three/drei";
import * as THREE from "three";

// Layer thicknesses are drawn 3x real size so a 70 mm cavity still reads on a phone.
const EXAGGERATE = 3;
const mm = (v: number) => (v / 1000) * EXAGGERATE;

const brick = new THREE.MeshStandardMaterial({ color: "#b4613c", roughness: 0.9 });
const block = new THREE.MeshStandardMaterial({ color: "#bdb8ae", roughness: 0.9 });
const concrete = new THREE.MeshStandardMaterial({ color: "#9a9ea6", roughness: 0.8 });
const timber = new THREE.MeshStandardMaterial({ color: "#a67c52", roughness: 0.8 });
const board = new THREE.MeshStandardMaterial({ color: "#d9d4c9", roughness: 0.9 });
const insulation = new THREE.MeshStandardMaterial({ color: "#f2c94c", roughness: 1, emissive: "#f2c94c", emissiveIntensity: 0.25 });
const emptyGap = new THREE.MeshBasicMaterial({ color: "#ff5a2a", transparent: true, opacity: 0.12, depthWrite: false });
const glass = new THREE.MeshStandardMaterial({ color: "#9fd3ff", transparent: true, opacity: 0.32, roughness: 0.05, metalness: 0.2, depthWrite: false });
const frame = new THREE.MeshStandardMaterial({ color: "#f6f4ef", roughness: 0.6 });
const appliance = new THREE.MeshStandardMaterial({ color: "#e7e9ec", roughness: 0.5 });
const flame = new THREE.MeshBasicMaterial({ color: "#ff8a3d", toneMapped: false });
const heater = new THREE.MeshStandardMaterial({ color: "#d9dde3", roughness: 0.5, emissive: "#ff5a2a", emissiveIntensity: 0.35 });
const tank = new THREE.MeshStandardMaterial({ color: "#2f5d3a", roughness: 0.6 });
const pipe = new THREE.MeshStandardMaterial({ color: "#c27c48", metalness: 0.6, roughness: 0.35 });
const scanLine = new THREE.MeshBasicMaterial({ color: "#3dffb0", transparent: true, opacity: 0.18, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });

const H = 1.8;
const LEN = 1.4;

type Layer = { t: number; material: THREE.Material; fill?: number };

function wallLayers(wallType = "cavity", ins = "none"): Layer[] {
  const insulated = ins === "full" ? 1 : ins === "partial" ? 0.5 : 0;
  const external: Layer[] = insulated ? [{ t: mm(100), material: insulation, fill: insulated }] : [];
  switch (wallType) {
    case "solid":
      return [...external, { t: mm(220), material: brick }];
    case "system":
      return [...external, { t: mm(200), material: concrete }];
    case "timber":
      return [{ t: mm(30), material: board }, { t: mm(140), material: insulated ? insulation : emptyGap, fill: insulated || 1 }, { t: mm(20), material: timber }];
    default:
      return [{ t: mm(100), material: brick }, { t: mm(80), material: insulated ? insulation : emptyGap, fill: insulated || 1 }, { t: mm(100), material: block }];
  }
}

/** Exploded slice of the wall build-up, outside face first. */
export function WallSection({ wallType, insulation: ins }: { wallType?: string; insulation?: string }) {
  const layers = wallLayers(wallType, ins);
  // Each layer's centre, stacked inward from the outside face at x = 0.
  const centres = layers.map((l, i) => -layers.slice(0, i).reduce((sum, p) => sum + p.t, 0) - l.t / 2);
  return (
    <group rotation={[0, 0.75, 0]}>
      {layers.map((l, i) => {
        const cx = centres[i];
        const h = H * (l.fill ?? 1);
        return (
          <mesh key={i} material={l.material} position={[cx, h / 2, 0]}>
            <boxGeometry args={[l.t, h, LEN]} />
            <Edges color="#000000" transparent opacity={0.25} />
          </mesh>
        );
      })}
    </group>
  );
}

/** Insulation blanket on top of the ceiling; its height follows the depth in mm. */
export function LoftLayer({ width, depth, mm: depthMm }: { width: number; depth: number; mm: number }) {
  if (depthMm <= 0)
    return (
      <mesh material={emptyGap} position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[width - 0.1, depth - 0.1]} />
      </mesh>
    );
  const t = Math.max(0.04, (depthMm / 1000) * 2.5);
  return (
    <mesh material={insulation} position={[0, t / 2, 0]}>
      <boxGeometry args={[width - 0.1, t, depth - 0.1]} />
      <Edges color="#000000" transparent opacity={0.2} />
    </mesh>
  );
}

/** A window pulled out of the wall, showing one, two or three panes. */
export function GlazingSection({ glazing = "double" }: { glazing?: string }) {
  const panes = glazing === "single" ? 1 : glazing === "triple" ? 3 : 2;
  const gap = 0.16;
  const W = 1.1;
  const Hh = 1.3;
  const depth = (panes - 1) * gap + 0.12;
  return (
    <group>
      {[
        [0, Hh / 2, W + 0.1, 0.06],
        [0, -Hh / 2, W + 0.1, 0.06],
        [W / 2, 0, 0.06, Hh],
        [-W / 2, 0, 0.06, Hh],
      ].map(([x, y, w, h], i) => (
        <mesh key={i} material={frame} position={[x, y, 0]}>
          <boxGeometry args={[w, h, depth]} />
        </mesh>
      ))}
      {Array.from({ length: panes }, (_, i) => (
        <mesh key={i} material={glass} position={[0, 0, (i - (panes - 1) / 2) * gap]} scale={glazing === "partial_double" && i === 1 ? [1, 0.5, 1] : 1}>
          <planeGeometry args={[W - 0.02, Hh - 0.02]} />
        </mesh>
      ))}
    </group>
  );
}

/** The non-heat-pump systems (the heat pump has its own model in the house). */
export function HeatingUnit({ heating }: { heating?: string }) {
  if (heating === "electric_storage" || heating === "electric_room")
    return (
      <mesh material={heater} position={[0, 0.1, 0]}>
        <boxGeometry args={[1.1, 0.7, 0.16]} />
      </mesh>
    );
  if (heating === "heat_network")
    return (
      <group>
        <mesh material={pipe} position={[-0.2, 0, 0]}>
          <cylinderGeometry args={[0.07, 0.07, 1.4, 12]} />
        </mesh>
        <mesh material={pipe} position={[0.2, 0, 0]}>
          <cylinderGeometry args={[0.07, 0.07, 1.4, 12]} />
        </mesh>
        <mesh material={appliance} position={[0, 0.5, 0]}>
          <boxGeometry args={[0.7, 0.45, 0.3]} />
        </mesh>
      </group>
    );
  return (
    <group>
      <mesh material={appliance} position={[0, 0.2, 0]}>
        <boxGeometry args={[0.6, 0.85, 0.36]} />
      </mesh>
      <mesh material={flame} position={[0, 0.05, 0.185]}>
        <circleGeometry args={[0.06, 16]} />
      </mesh>
      <mesh material={pipe} position={[0, 0.85, 0]}>
        <cylinderGeometry args={[0.06, 0.06, 0.5, 12]} />
      </mesh>
      {heating === "oil_boiler" && (
        <mesh material={tank} position={[0.9, 0.1, 0]} rotation={[0, 0, Math.PI / 2]}>
          <capsuleGeometry args={[0.32, 0.6, 4, 12]} />
        </mesh>
      )}
    </group>
  );
}

/** Wireframe of the house volume with a sweeping scan plane, shown before the walls are built. */
export function Scaffold({ width, depth, height, baseY }: { width: number; depth: number; height: number; baseY: number }) {
  const edges = useMemo(() => new THREE.EdgesGeometry(new THREE.BoxGeometry(width, height, depth)), [width, height, depth]);
  const plane = useRef<THREE.Mesh>(null);
  const t = useRef(0);
  useFrame((state, delta) => {
    t.current += delta;
    if (plane.current) plane.current.position.y = baseY + (0.5 - 0.5 * Math.cos(t.current * 1.6)) * height;
    state.invalidate();
  });
  return (
    <group>
      <lineSegments geometry={edges} position={[0, baseY + height / 2, 0]}>
        <lineBasicMaterial color="#3dffb0" transparent opacity={0.55} toneMapped={false} />
      </lineSegments>
      <mesh ref={plane} material={scanLine} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[width + 0.6, depth + 0.6]} />
      </mesh>
    </group>
  );
}
