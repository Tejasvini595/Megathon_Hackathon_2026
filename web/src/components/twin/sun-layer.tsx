"use client";

import { useMemo } from "react";
import { Html, Line } from "@react-three/drei";
import * as THREE from "three";
import type { Geometry } from "@/lib/twin/types";
import { houseLayout } from "./house";

/** What the sun view draws: unit vectors in model space (see `lib/twin/sun.ts`). */
export type SunView = {
  dir: [number, number, number];
  /** Today's (or the chosen season's) path across the sky, sampled through daylight. */
  path: [number, number, number][];
  north: [number, number];
};

const R = 15;
const sunMat = new THREE.MeshBasicMaterial({ color: "#ffd27a", toneMapped: false });
const shadowMat = new THREE.MeshBasicMaterial({ color: "#000000", transparent: true, opacity: 0.38, depthWrite: false });
const arrowMat = new THREE.MeshBasicMaterial({ color: "#3dffb0", toneMapped: false });

/** Convex hull (monotone chain) of 2D points, counter-clockwise. */
function hull(points: [number, number][]) {
  const p = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: number[], a: number[], b: number[]) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const half = (pts: [number, number][]) => {
    const out: [number, number][] = [];
    for (const q of pts) {
      while (out.length >= 2 && cross(out[out.length - 2], out[out.length - 1], q) <= 0) out.pop();
      out.push(q);
    }
    return out.slice(0, -1);
  };
  return [...half(p), ...half([...p].reverse())];
}

/**
 * The house's shadow as a flat polygon: its footprint swept away from the sun by height / tan(elevation).
 * One draw call and no shadow map, so the canvas stays on demand.
 */
function Shadow({ geometry, dir }: { geometry: Geometry; dir: [number, number, number] }) {
  const shape = useMemo(() => {
    const { isFlat, topY, roofRise, blockTopY } = houseLayout(geometry);
    const h = (isFlat ? blockTopY : topY) + roofRise * 0.6;
    const [dx, dy, dz] = dir;
    const sx = (-dx / dy) * h;
    const sz = (-dz / dy) * h;
    const w = geometry.width / 2;
    const d = geometry.depth / 2;
    const base: [number, number][] = [[-w, -d], [w, -d], [w, d], [-w, d]];
    // Shape is drawn in x/y and laid flat, so y here is -z in the world.
    const pts = hull([...base, ...base.map(([x, z]): [number, number] => [x + sx, z + sz])]).map(([x, z]) => new THREE.Vector2(x, -z));
    return new THREE.Shape(pts);
  }, [geometry, dir]);
  return (
    <mesh material={shadowMat} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.015, 0]}>
      <shapeGeometry args={[shape]} />
    </mesh>
  );
}

export function SunLayer({ sun, geometry }: { sun: SunView; geometry: Geometry }) {
  const up = sun.dir[1] > 0.02;
  const pos = sun.dir.map((v) => v * R) as [number, number, number];
  const path = useMemo(() => sun.path.map((p) => p.map((v) => v * R) as [number, number, number]), [sun.path]);
  const [nx, nz] = sun.north;
  return (
    <>
      <ambientLight intensity={up ? 0.25 : 0.08} />
      <directionalLight position={pos} intensity={up ? 0.6 + 2.2 * sun.dir[1] : 0.05} color={sun.dir[1] < 0.25 ? "#ffb070" : "#fff4e0"} />
      {path.length > 1 && <Line points={path} color="#ffd27a" lineWidth={1.2} transparent opacity={0.45} dashed dashSize={0.6} gapSize={0.4} />}
      {up && (
        <>
          <mesh material={sunMat} position={pos}>
            <sphereGeometry args={[0.9, 24, 16]} />
          </mesh>
          <Shadow geometry={geometry} dir={sun.dir} />
        </>
      )}
      <group position={[nx * 9.5, 0.03, nz * 9.5]} rotation={[0, Math.atan2(-nx, -nz), 0]}>
        <mesh material={arrowMat} rotation={[-Math.PI / 2, 0, 0]}>
          <coneGeometry args={[0.35, 0.9, 3]} />
        </mesh>
        <Html center position={[0, 0.2, -0.9]} zIndexRange={[5, 0]}>
          <span className="pointer-events-none text-[10px] font-semibold text-volt">N</span>
        </Html>
      </group>
    </>
  );
}
