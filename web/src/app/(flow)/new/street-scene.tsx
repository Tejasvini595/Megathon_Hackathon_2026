"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { CameraControls, CameraControlsImpl } from "@react-three/drei";
import * as THREE from "three";
import type { StreetBuilding } from "@/lib/geo/street";

const { ACTION } = CameraControlsImpl;
const REACH_M = 170;
const MAX_LABELS = 12;
const LABEL_RANGE_M = 200;
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

type View = { x: number; z: number; distance: number };

/** Starts as a tilted map view over the postcode, then glides to the building the user picks. */
function Rig({ focus, onView }: { focus: [number, number] | null; onView: (v: View) => void }) {
  const controls = useRef<CameraControls>(null);
  const size = useThree((s) => s.size);
  useEffect(() => {
    const c = controls.current;
    if (!c) return;
    c.setBoundary(new THREE.Box3(new THREE.Vector3(-REACH_M, 0, -REACH_M), new THREE.Vector3(REACH_M, 6, REACH_M)));
    const report = () => {
      const t = c.getTarget(new THREE.Vector3());
      onView({ x: Math.round(t.x), z: Math.round(t.z), distance: Math.round(c.distance) });
    };
    c.addEventListener("rest", report);
    return () => c.removeEventListener("rest", report);
  }, [onView]);
  useEffect(() => {
    const c = controls.current;
    if (!c) return;
    // Portrait screens see less sideways, so start further back.
    const back = size.width < size.height ? 1.5 : 1;
    if (focus) c.setLookAt(focus[0] + 18, 32, focus[1] + 34, focus[0], 2, focus[1], true);
    else c.setLookAt(0, 95 * back, 85 * back, 0, 0, 0, true);
  }, [focus, size.width, size.height]);
  return (
    <CameraControls
      ref={controls}
      minDistance={20}
      maxDistance={260}
      minPolarAngle={0.3}
      maxPolarAngle={1.25}
      smoothTime={0.5}
      draggingSmoothTime={0.12}
      boundaryFriction={0.4}
      dollyToCursor
      mouseButtons={{ left: ACTION.SCREEN_PAN, right: ACTION.ROTATE, middle: ACTION.DOLLY, wheel: ACTION.DOLLY }}
      touches={{ one: ACTION.TOUCH_SCREEN_PAN, two: ACTION.TOUCH_DOLLY_ROTATE, three: ACTION.TOUCH_DOLLY_TRUCK }}
    />
  );
}

const labelMaterials = new Map<string, THREE.SpriteMaterial>();

/** One shared sprite material per house number, drawn once to a tiny canvas. */
function labelMaterial(text: string) {
  let m = labelMaterials.get(text);
  if (!m) {
    const canvas = document.createElement("canvas");
    canvas.width = 128;
    canvas.height = 64;
    const g = canvas.getContext("2d")!;
    g.fillStyle = "rgba(0,0,0,0.65)";
    g.beginPath();
    g.roundRect(4, 8, 120, 48, 14);
    g.fill();
    g.fillStyle = "#fff";
    g.font = "600 34px sans-serif";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(text, 64, 33, 108);
    const map = new THREE.CanvasTexture(canvas);
    map.colorSpace = THREE.SRGBColorSpace;
    m = new THREE.SpriteMaterial({ map, depthTest: false, transparent: true, toneMapped: false, fog: false });
    labelMaterials.set(text, m);
  }
  return m;
}

/** House numbers for the few numbered buildings nearest the view centre, to tell neighbours apart. */
function Numbers({ buildings, view }: { buildings: StreetBuilding[]; view: View }) {
  const shown = useMemo(() => {
    if (view.distance > LABEL_RANGE_M) return [];
    const d = (b: StreetBuilding) => Math.hypot(b.centre[0] - view.x, b.centre[1] - view.z);
    return buildings
      .filter((b) => b.tags.houseNumber)
      .sort((a, b) => d(a) - d(b))
      .slice(0, MAX_LABELS);
  }, [buildings, view]);
  return shown.map((b) => (
    <sprite key={b.osmId} material={labelMaterial(b.tags.houseNumber!)} position={[b.centre[0], heightOf(b) + 2, b.centre[1]]} scale={[6, 3, 1]} renderOrder={10} raycast={() => null} />
  ));
}

export default function StreetScene({ buildings, selected, onSelect }: { buildings: StreetBuilding[]; selected: number | null; onSelect: (id: number) => void }) {
  const [view, setView] = useState<View>({ x: 0, z: 0, distance: 100 });
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
      <Numbers buildings={buildings} view={view} />
      <Rig focus={focus} onView={setView} />
    </Canvas>
  );
}
