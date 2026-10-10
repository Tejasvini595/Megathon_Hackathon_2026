"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { CameraControls, ContactShadows, Environment, Lightformer, PerformanceMonitor } from "@react-three/drei";
import { Bloom, EffectComposer } from "@react-three/postprocessing";
import * as THREE from "three";
import type { Element, Geometry } from "@/lib/twin/types";
import { House, STOREY_H, focusFor, type Highlight, type ViewMode } from "./house";

export type TwinSceneProps = {
  geometry: Geometry;
  heatLoss: Record<Element, number>;
  mode: ViewMode;
  focus?: Highlight;
  autoRotate?: boolean;
  interactive?: boolean;
  heatRef?: number;
};

const BG = "#0b0d10";

/** Soft radial light pool under the house, drawn to a canvas once. */
function GroundGlow({ thermal }: { thermal: boolean }) {
  const texture = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = c.height = 128;
    const ctx = c.getContext("2d")!;
    const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, "rgba(255,255,255,0.55)");
    g.addColorStop(0.45, "rgba(255,255,255,0.12)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(c);
  }, []);
  const mat = useRef<THREE.MeshBasicMaterial>(null);
  const target = useMemo(() => new THREE.Color(), []);
  useFrame((state, dt) => {
    const m = mat.current;
    if (!m) return;
    target.set(thermal ? "#ff5a2a" : "#3dffb0");
    m.color.lerp(target, 1 - Math.exp(-dt * 4));
    if (Math.abs(m.color.r - target.r) + Math.abs(m.color.g - target.g) > 0.004) state.invalidate();
  });
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.005, 0]}>
        <planeGeometry args={[26, 26]} />
        <meshBasicMaterial ref={mat} map={texture} transparent opacity={0.22} depthWrite={false} toneMapped={false} />
      </mesh>
      {[7.5, 10.5].map((r) => (
        <mesh key={r} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}>
          <ringGeometry args={[r, r + 0.025, 96]} />
          <meshBasicMaterial color="#ffffff" transparent opacity={0.07} depthWrite={false} />
        </mesh>
      ))}
    </group>
  );
}

/** Draw a fresh frame when rendering resumes (on-demand loops don't redraw by themselves). */
function ResumeKick({ active }: { active: boolean }) {
  const invalidate = useThree((st) => st.invalidate);
  useEffect(() => {
    if (active) invalidate();
  }, [active, invalidate]);
  return null;
}

function Rig({ geometry, focus, autoRotate, interactive }: Pick<TwinSceneProps, "geometry" | "focus" | "autoRotate" | "interactive">) {
  const controls = useRef<CameraControls>(null);
  const idleSince = useRef(0);
  const userActive = useRef(false);
  const initialized = useRef(false);
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
    const offset = new THREE.Vector3(x - tx, y - ty, z - tz);
    if (!focus) {
      const isFlat = geometry.builtForm === "flat";
      const storeys = isFlat ? (geometry.isTopFloor ? 3 : 2.5) : geometry.storeys;
      const H = storeys * STOREY_H + 2;
      const attached = geometry.builtForm === "detached" || isFlat ? 0 : geometry.width * 0.6;
      const r = 0.5 * Math.hypot(geometry.width + attached, geometry.depth, H);
      offset.setLength((r / Math.sin(Math.min(vHalf, hHalf))) * 0.92);
    } else {
      offset.multiplyScalar(Math.max(1, Math.tan(vHalf) / Math.tan(hHalf)) * 0.85);
    }
    const animate = initialized.current;
    initialized.current = true;
    c.setLookAt(tx + offset.x, ty + offset.y, tz + offset.z, tx, ty, tz, animate);
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

/**
 * Rendering budget: no shadow maps (one baked contact shadow instead), capped DPR that drops if
 * the frame rate does, bloom only while the device keeps up, and an on-demand frame loop unless
 * something animates continuously (auto-rotate, thermal embers). `active=false` stops rendering
 * entirely when the canvas is off-screen or the tab is hidden.
 */
export default function TwinScene({
  geometry,
  heatLoss,
  mode,
  focus = null,
  autoRotate = false,
  interactive = true,
  heatRef,
  active,
  onContextLost,
}: TwinSceneProps & { active: boolean; onContextLost: () => void }) {
  const thermal = mode === "thermal";
  const [x, y, z] = focusFor(null, geometry);
  const [dpr, setDpr] = useState(() => Math.min(window.devicePixelRatio, 1.75));
  const [fancy, setFancy] = useState(true);
  const frameloop = !active ? "never" : autoRotate || thermal ? "always" : "demand";
  const shadowKey = `${geometry.builtForm}-${geometry.width}-${geometry.depth}-${geometry.storeys}-${geometry.isTopFloor ? "top" : "std"}`;

  return (
    <Canvas
      frameloop={frameloop}
      dpr={dpr}
      camera={{ position: [x, y, z], fov: 32, near: 0.1, far: 200 }}
      gl={{ antialias: true, powerPreference: "high-performance", stencil: false }}
      style={{ touchAction: interactive ? "none" : "auto" }}
      onCreated={({ gl }) => {
        gl.domElement.addEventListener("webglcontextlost", (e) => {
          e.preventDefault();
          onContextLost();
        });
      }}
    >
      <PerformanceMonitor
        onDecline={() => {
          setDpr(1);
          setFancy(false);
        }}
      />
      <ResumeKick active={active} />
      <color attach="background" args={[BG]} />
      <fog attach="fog" args={[BG, 40, 90]} />

      <ambientLight intensity={thermal ? 0.08 : 0.35} />
      <directionalLight position={[8, 14, 6]} intensity={thermal ? 0.25 : 2.2} />
      <directionalLight position={[-10, 6, -8]} intensity={thermal ? 0.1 : 0.6} color="#9fc3ff" />

      <Environment resolution={128} frames={1}>
        <Lightformer form="rect" intensity={2} position={[0, 6, 8]} scale={[12, 4, 1]} />
        <Lightformer form="rect" intensity={1} position={[-8, 3, 0]} rotation-y={Math.PI / 2} scale={[8, 3, 1]} color="#bcd4ff" />
        <Lightformer form="ring" intensity={1.5} position={[6, 8, -6]} scale={3} color="#e8fff5" />
      </Environment>

      <House geometry={geometry} heatLoss={heatLoss} mode={mode} highlight={focus} heatRef={heatRef} />

      <GroundGlow thermal={thermal} />
      <ContactShadows key={shadowKey} frames={1} position={[0, 0.002, 0]} opacity={0.6} scale={24} blur={2.4} far={10} resolution={256} color="#000000" />

      <Rig geometry={geometry} focus={focus} autoRotate={autoRotate} interactive={interactive} />

      {fancy && (
        <EffectComposer multisampling={0}>
          <Bloom mipmapBlur levels={5} intensity={thermal ? 0.7 : 0.4} luminanceThreshold={0.9} luminanceSmoothing={0.2} />
        </EffectComposer>
      )}
    </Canvas>
  );
}
