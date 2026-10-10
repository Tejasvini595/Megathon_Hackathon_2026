"use client";

import { useEffect, useMemo, useRef, type RefObject } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { ContactShadows, Environment, Lightformer } from "@react-three/drei";
import * as THREE from "three";
import { House, focusFor, frameRadius } from "@/components/twin/house";
import type { Element, Geometry } from "@/lib/twin/types";
import { createHoloMaterial } from "./holo-material";

export type HoloSceneProps = {
  geometry: Geometry;
  heatLoss: Record<Element, number>;
  tilt: RefObject<{ x: number; y: number }>;
  reduced: boolean;
  active: boolean;
  onContextLost: () => void;
};

const MAX_TILT = THREE.MathUtils.degToRad(8);
const Y_AXIS = new THREE.Vector3(0, 1, 0);
const X_AXIS = new THREE.Vector3(1, 0, 0);

/** Copies the visible solid meshes once and draws them again with the hologram shader. */
function HoloOverlay({ source, material }: { source: RefObject<THREE.Group | null>; material: THREE.ShaderMaterial }) {
  const holder = useRef<THREE.Group>(null);
  useEffect(() => {
    const src = source.current;
    const out = holder.current;
    if (!src || !out) return;
    src.updateMatrixWorld(true);
    const inverse = src.matrixWorld.clone().invert();
    src.traverseVisible((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh || (mesh.material as THREE.Material).transparent) return;
      const copy = new THREE.Mesh(mesh.geometry, material);
      copy.matrixAutoUpdate = false;
      copy.matrix.multiplyMatrices(inverse, mesh.matrixWorld);
      out.add(copy);
    });
    return () => void out.clear();
  }, [source, material]);
  return <group ref={holder} />;
}

/** Slow idle spin, damped tilt parallax on the camera, shader clock. All per-frame work stays off React state. */
function Rig({ geometry, heatLoss, tilt, reduced, active, material }: Pick<HoloSceneProps, "geometry" | "heatLoss" | "tilt" | "reduced" | "active"> & { material: THREE.ShaderMaterial }) {
  const pivot = useRef<THREE.Group>(null);
  const house = useRef<THREE.Group>(null);
  const camera = useThree((st) => st.camera as THREE.PerspectiveCamera);
  const size = useThree((st) => st.size);
  const invalidate = useThree((st) => st.invalidate);
  const time = useRef(0);
  const current = useRef({ x: 0, y: 0 });
  const scratch = useMemo(() => new THREE.Vector3(), []);

  const { offset, target } = useMemo(() => {
    const [x, y, z, tx, ty, tz] = focusFor(null, geometry);
    const r = frameRadius(geometry);
    const vHalf = THREE.MathUtils.degToRad(camera.fov / 2);
    const hHalf = Math.atan(Math.tan(vHalf) * (size.width / Math.max(1, size.height)));
    const offset = new THREE.Vector3(x - tx, y - ty, z - tz).setLength((r / Math.sin(Math.min(vHalf, hHalf))) * 1.2);
    return { offset, target: new THREE.Vector3(tx, ty, tz) };
  }, [geometry, camera, size.width, size.height]);

  useEffect(() => invalidate(), [invalidate, active, offset]);

  /* eslint-disable react-hooks/immutability -- three.js objects are mutated per frame (R3F pattern) */
  useFrame((state, delta) => {
    time.current += delta;
    material.uniforms.uTime.value = reduced ? 0 : time.current;
    if (pivot.current && !reduced) pivot.current.rotation.y += delta * 0.28;
    const k = 1 - Math.exp(-delta * 5);
    current.current.x += (tilt.current.x - current.current.x) * k;
    current.current.y += (tilt.current.y - current.current.y) * k;
    scratch.copy(offset).applyAxisAngle(Y_AXIS, -current.current.x * MAX_TILT).applyAxisAngle(X_AXIS, current.current.y * MAX_TILT);
    camera.position.copy(target).add(scratch);
    camera.lookAt(target);
  });
  /* eslint-enable react-hooks/immutability */

  return (
    <group ref={pivot}>
      <group ref={house}>
        <House geometry={geometry} heatLoss={heatLoss} mode="normal" highlight={null} />
      </group>
      <HoloOverlay source={house} material={material} />
    </group>
  );
}

/**
 * Transparent canvas over the card. No shadow maps (one baked contact shadow), DPR capped at 1.75.
 * Runs every frame only while visible and motion is allowed; stops entirely in a hidden tab.
 */
export default function HoloScene({ geometry, heatLoss, tilt, reduced, active, onContextLost }: HoloSceneProps) {
  const material = useMemo(() => createHoloMaterial(), []);
  useEffect(() => () => material.dispose(), [material]);
  const [x, y, z] = focusFor(null, geometry);

  return (
    <Canvas
      frameloop={!active ? "never" : reduced ? "demand" : "always"}
      dpr={[1, 1.75]}
      camera={{ position: [x, y, z], fov: 32, near: 0.1, far: 200 }}
      gl={{ antialias: true, alpha: true, powerPreference: "high-performance", stencil: false }}
      onCreated={({ gl }) => {
        gl.domElement.addEventListener("webglcontextlost", (e) => {
          e.preventDefault();
          onContextLost();
        });
      }}
    >
      <ambientLight intensity={0.35} />
      <directionalLight position={[8, 14, 6]} intensity={2} />
      <directionalLight position={[-10, 6, -8]} intensity={0.6} color="#9fc3ff" />
      <Environment resolution={64} frames={1}>
        <Lightformer form="rect" intensity={2} position={[0, 6, 8]} scale={[12, 4, 1]} />
        <Lightformer form="rect" intensity={1} position={[-8, 3, 0]} rotation-y={Math.PI / 2} scale={[8, 3, 1]} color="#bcd4ff" />
      </Environment>
      <Rig geometry={geometry} heatLoss={heatLoss} tilt={tilt} reduced={reduced} active={active} material={material} />
      <ContactShadows frames={1} position={[0, 0.002, 0]} opacity={0.6} scale={24} blur={2.4} far={10} resolution={256} color="#000000" />
    </Canvas>
  );
}
