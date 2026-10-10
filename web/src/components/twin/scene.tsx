"use client";

import { Suspense, useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { CameraControls, ContactShadows, Environment, Lightformer } from "@react-three/drei";
import { Bloom, EffectComposer, Vignette } from "@react-three/postprocessing";
import * as THREE from "three";
import type { Element, Geometry } from "@/lib/twin/types";
import { House, STOREY_H, focusFor, type ViewMode } from "./house";

export type Focus = Element | "system" | "roof_pv" | null;

export type TwinSceneProps = {
  geometry: Geometry;
  heatLoss: Record<Element, number>;
  mode: ViewMode;
  focus?: Focus;
  autoRotate?: boolean;
  interactive?: boolean;
  className?: string;
  heatRef?: number;
};

const BG = "#0b0d10";

/** Soft radial light pool under the house, drawn to a canvas once. */
function GroundGlow({ thermal }: { thermal: boolean }) {
  const texture = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = c.height = 256;
    const ctx = c.getContext("2d")!;
    const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
    g.addColorStop(0, "rgba(255,255,255,0.55)");
    g.addColorStop(0.45, "rgba(255,255,255,0.12)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 256, 256);
    return new THREE.CanvasTexture(c);
  }, []);
  const mat = useRef<THREE.MeshBasicMaterial>(null);
  const target = useMemo(() => new THREE.Color(), []);
  useFrame((_, dt) => {
    if (!mat.current) return;
    target.set(thermal ? "#ff5a2a" : "#3dffb0");
    mat.current.color.lerp(target, 1 - Math.exp(-dt * 4));
  });
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.005, 0]}>
        <planeGeometry args={[26, 26]} />
        <meshBasicMaterial ref={mat} map={texture} transparent opacity={0.22} depthWrite={false} toneMapped={false} />
      </mesh>
      {/* thin orbit rings, Tesla-app style */}
      {[7.5, 10.5].map((r) => (
        <mesh key={r} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}>
          <ringGeometry args={[r, r + 0.025, 128]} />
          <meshBasicMaterial color="#ffffff" transparent opacity={0.07} depthWrite={false} />
        </mesh>
      ))}
    </group>
  );
}

function Rig({ geometry, focus, autoRotate, interactive }: Pick<TwinSceneProps, "geometry" | "focus" | "autoRotate" | "interactive">) {
  const controls = useRef<CameraControls>(null);
  const idleSince = useRef(0);
  const userActive = useRef(false);

  const size = useThree((st) => st.size);
  const fov = useThree((st) => (st.camera as THREE.PerspectiveCamera).fov);

  useEffect(() => {
    const c = controls.current;
    if (!c) return;
    const [x, y, z, tx, ty, tz] = focusFor(focus, geometry);
    // Fit to the narrower of the two fields of view so tall phones see the whole house.
    const aspect = size.width / Math.max(1, size.height);
    const vHalf = THREE.MathUtils.degToRad(fov / 2);
    const hHalf = Math.atan(Math.tan(vHalf) * aspect);
    const half = Math.min(vHalf, hHalf);
    const offset = new THREE.Vector3(x - tx, y - ty, z - tz);
    if (!focus) {
      const H = (geometry.builtForm === "flat" ? 3 : geometry.storeys) * STOREY_H + 2;
      const attached = geometry.builtForm === "detached" ? 0 : geometry.width * 0.6;
      const r = 0.5 * Math.hypot(geometry.width + attached, geometry.depth, H);
      offset.setLength((r / Math.sin(half)) * 0.92);
    } else {
      offset.multiplyScalar(Math.max(1, Math.tan(vHalf) / Math.tan(hHalf)) * 0.85);
    }
    c.setLookAt(tx + offset.x, ty + offset.y, tz + offset.z, tx, ty, tz, true);
  }, [focus, geometry, size.width, size.height, fov]);

  useEffect(() => {
    const c = controls.current;
    if (!c) return;
    const start = () => (userActive.current = true);
    const end = () => {
      userActive.current = false;
      idleSince.current = performance.now();
    };
    c.addEventListener("controlstart", start);
    c.addEventListener("controlend", end);
    return () => {
      c.removeEventListener("controlstart", start);
      c.removeEventListener("controlend", end);
    };
  }, []);

  useFrame((_, dt) => {
    const c = controls.current;
    if (!c || !autoRotate || focus || userActive.current) return;
    if (performance.now() - idleSince.current < 3500) return;
    c.azimuthAngle += dt * 0.14;
  });

  return (
    <CameraControls
      ref={controls}
      enabled={interactive}
      minDistance={8}
      maxDistance={60}
      minPolarAngle={0.35}
      maxPolarAngle={1.42}
      truckSpeed={0}
      smoothTime={0.6}
      draggingSmoothTime={0.15}
    />
  );
}

export default function TwinScene({ geometry, heatLoss, mode, focus = null, autoRotate = true, interactive = true, className, heatRef }: TwinSceneProps) {
  const thermal = mode === "thermal";
  const [x, y, z] = focusFor(null, geometry);
  return (
    <Canvas
      className={className}
      shadows
      dpr={[1, 2]}
      camera={{ position: [x, y, z], fov: 32, near: 0.1, far: 200 }}
      gl={{ antialias: true, powerPreference: "high-performance" }}
      style={{ touchAction: interactive ? "none" : "auto" }}
    >
      <color attach="background" args={[BG]} />
      <fog attach="fog" args={[BG, 40, 90]} />

      <ambientLight intensity={thermal ? 0.08 : 0.35} />
      <directionalLight
        position={[8, 14, 6]}
        intensity={thermal ? 0.25 : 2.2}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-normalBias={0.04}
        shadow-camera-left={-12}
        shadow-camera-right={12}
        shadow-camera-top={12}
        shadow-camera-bottom={-12}
        shadow-bias={-0.0004}
      />
      <directionalLight position={[-10, 6, -8]} intensity={thermal ? 0.1 : 0.6} color="#9fc3ff" />

      <Suspense fallback={null}>
        <Environment resolution={256} frames={1}>
          <Lightformer form="rect" intensity={2} position={[0, 6, 8]} scale={[12, 4, 1]} />
          <Lightformer form="rect" intensity={1} position={[-8, 3, 0]} rotation-y={Math.PI / 2} scale={[8, 3, 1]} color="#bcd4ff" />
          <Lightformer form="ring" intensity={1.5} position={[6, 8, -6]} scale={3} color="#e8fff5" />
        </Environment>
      </Suspense>

      <House geometry={geometry} heatLoss={heatLoss} mode={mode} highlight={focus} heatRef={heatRef} />

      <GroundGlow thermal={thermal} />
      <ContactShadows position={[0, 0.002, 0]} opacity={thermal ? 0.2 : 0.65} scale={24} blur={2.4} far={10} resolution={512} color="#000000" />

      <Rig geometry={geometry} focus={focus} autoRotate={autoRotate} interactive={interactive} />

      <EffectComposer multisampling={4}>
        <Bloom mipmapBlur intensity={thermal ? 0.7 : 0.4} luminanceThreshold={0.9} luminanceSmoothing={0.2} />
        <Vignette eskil={false} offset={0.25} darkness={0.7} />
      </EffectComposer>
    </Canvas>
  );
}
