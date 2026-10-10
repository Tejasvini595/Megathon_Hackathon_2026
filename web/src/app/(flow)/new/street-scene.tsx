"use client";

import { useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { CameraControls } from "@react-three/drei";
import * as THREE from "three";
import type { StreetBuilding } from "@/lib/geo/street";

const BG = "#0b0d10";
const clay = new THREE.MeshStandardMaterial({ color: "#3a404a", roughness: 0.9 });
const chosen = new THREE.MeshStandardMaterial({ color: "#3dffb0", emissive: "#3dffb0", emissiveIntensity: 0.55, roughness: 0.6 });
const ground = new THREE.MeshStandardMaterial({ color: "#11151a", roughness: 1 });
const pin = new THREE.MeshBasicMaterial({ color: "#3dffb0", transparent: true, opacity: 0.35, depthWrite: false, toneMapped: false });

/** Height from OSM levels when tagged, else a typical two-storey house with a little variation. */
function heightOf(b: StreetBuilding) {
  const levels = b.suggestions.storeys?.value;
  return levels ? levels * 2.8 : 5.5 + (b.osmId % 7) * 0.25;
}

/** The footprint extruded upward; shape y is -z so the rotation lands it the right way round. */
function extrude(b: StreetBuilding) {
  const shape = new THREE.Shape(b.outline.map(([x, z]) => new THREE.Vector2(x, -z)));
  const geom = new THREE.ExtrudeGeometry(shape, { depth: heightOf(b), bevelEnabled: false });
  geom.rotateX(-Math.PI / 2);
  return geom;
}

function Building({ b, selected, onSelect }: { b: StreetBuilding; selected: boolean; onSelect: (id: number) => void }) {
  const geom = useMemo(() => extrude(b), [b]);
  const ref = useRef<THREE.Mesh>(null);
  useFrame((state, dt) => {
    const m = ref.current;
    if (!m) return;
    const target = selected ? 1.18 : 1;
    if (Math.abs(m.scale.y - target) < 0.002) return;
    m.scale.y += (target - m.scale.y) * (1 - Math.exp(-dt * 8));
    state.invalidate();
  });
  return (
    <mesh
      ref={ref}
      geometry={geom}
      material={selected ? chosen : clay}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(b.osmId);
      }}
    />
  );
}

/** Starts as a tilted map view over the postcode, then glides to the building the user picks. */
function Rig({ focus }: { focus: [number, number] | null }) {
  const controls = useRef<CameraControls>(null);
  const size = useThree((s) => s.size);
  useEffect(() => {
    const c = controls.current;
    if (!c) return;
    // Portrait screens see less sideways, so start further back.
    const back = size.width < size.height ? 1.5 : 1;
    if (focus) c.setLookAt(focus[0] + 18, 32, focus[1] + 34, focus[0], 2, focus[1], true);
    else c.setLookAt(0, 95 * back, 85 * back, 0, 0, 0, true);
  }, [focus, size.width, size.height]);
  return <CameraControls ref={controls} minDistance={20} maxDistance={260} maxPolarAngle={1.25} smoothTime={0.5} draggingSmoothTime={0.12} />;
}

export default function StreetScene({ buildings, selected, onSelect }: { buildings: StreetBuilding[]; selected: number | null; onSelect: (id: number) => void }) {
  const focus = buildings.find((b) => b.osmId === selected)?.centre ?? null;
  return (
    <Canvas frameloop="demand" dpr={[1, 1.75]} camera={{ position: [0, 140, 120], fov: 35, near: 1, far: 800 }} gl={{ antialias: true, stencil: false }} style={{ touchAction: "none" }}>
      <color attach="background" args={[BG]} />
      <fog attach="fog" args={[BG, 160, 420]} />
      <hemisphereLight args={["#cfe3ff", "#0b0d10", 0.9]} />
      <directionalLight position={[60, 120, 40]} intensity={1.6} />
      <mesh material={ground} rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]}>
        <planeGeometry args={[1200, 1200]} />
      </mesh>
      {/* the postcode centre: "you're somewhere around here" */}
      <mesh material={pin} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.05, 0]}>
        <ringGeometry args={[14, 16, 64]} />
      </mesh>
      {buildings.map((b) => (
        <Building key={b.osmId} b={b} selected={b.osmId === selected} onSelect={onSelect} />
      ))}
      <Rig focus={focus} />
    </Canvas>
  );
}
