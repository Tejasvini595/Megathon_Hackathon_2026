import * as THREE from "three";

/** Additive iridescent fresnel rim plus faint scanlines, drawn over a copy of the house meshes. */
export function createHoloMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
    vertexShader: /* glsl */ `
      varying vec3 vNormal;
      varying vec3 vView;
      varying float vY;
      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        vec4 mv = viewMatrix * world;
        vNormal = normalize(normalMatrix * normal);
        vView = normalize(-mv.xyz);
        vY = world.y;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      varying vec3 vNormal;
      varying vec3 vView;
      varying float vY;
      void main() {
        float fres = pow(1.0 - abs(dot(normalize(vNormal), normalize(vView))), 2.4);
        vec3 hue = 0.5 + 0.5 * cos(6.28318 * (fres * 1.1 + vY * 0.04 + uTime * 0.05 + vec3(0.0, 0.33, 0.67)));
        float scan = smoothstep(0.55, 1.0, sin(vY * 9.0 - uTime * 1.6)) * 0.035;
        gl_FragColor = vec4(hue * (fres * 0.5 + scan), 1.0);
        #include <colorspace_fragment>
      }
    `,
  });
}
