/**
 * HERO materials — FOUR programs for the whole application.
 *   toon    MeshToonMaterial  + fresnel rim      (shell, mouth, lids, blush)
 *   outline MeshBasicMaterial + normal push      (inverted hull)
 *   flat    MeshBasicMaterial                    (sky, ground, pedestal, shadow, eye glints)
 *   glossy  MeshPhongMaterial                    (eyeballs only)
 * No loops, no lookups, no arrays anywhere in any of them.
 */
import * as THREE from 'three';
import { mountBadge } from '../../core/build';

export const MAT = {
  toon: null as unknown as THREE.MeshToonMaterial,
  outline: null as unknown as THREE.MeshBasicMaterial,
  flat: null as unknown as THREE.MeshBasicMaterial,
  glossy: null as unknown as THREE.MeshPhongMaterial,
  lit: null as unknown as THREE.MeshLambertMaterial,
  foliage: null as unknown as THREE.MeshLambertMaterial,
  emote: null as unknown as THREE.MeshBasicMaterial,
  /** dark inverted hull for props: rocks, bushes, the sea rim */
  propOutline: null as unknown as THREE.MeshBasicMaterial,
  /** additive ground rings (call ripples, impact rings) */
  vfxRing: null as unknown as THREE.MeshBasicMaterial,
  /** soft billboard puffs (dust, sparkles) */
  vfxPuff: null as unknown as THREE.MeshBasicMaterial,
  time: { value: 0 },
  outlineWidth: { value: 0.015 },
  rimStrength: { value: 0.30 },
  ramp: null as unknown as THREE.DataTexture,
  built: false,
};

/** A 3-step ramp with soft band edges, generated in code. */
function rampTexture(): THREE.DataTexture {
  const N = 64;
  const data = new Uint8Array(N);
  const band = (t: number, edge: number): number => {
    const x = (t - edge) / 0.10;
    return x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x);
  };
  for (let i = 0; i < N; i++) {
    const t = i / (N - 1);
    const v = 0.55 + band(t, 0.30) * 0.24 + band(t, 0.63) * 0.30;
    data[i] = Math.min(255, Math.round(v * 255));
  }
  const tex = new THREE.DataTexture(data, N, 1, THREE.RedFormat);
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

export function buildMaterials(): void {
  if (MAT.built) return;
  // every 3D view calls this before it can draw, so the build badge is
  // guaranteed to exist on Heroes, Zoo, Studio and World alike
  mountBadge();
  MAT.ramp = rampTexture();

  const toon = new THREE.MeshToonMaterial({
    color: 0xffffff,
    vertexColors: true,
    gradientMap: MAT.ramp,
    fog: true,
  });
  toon.onBeforeCompile = (shader) => {
    shader.uniforms.uRim = MAT.rimStrength;
    shader.uniforms.uRimColor = { value: new THREE.Color('#fff0d0') };
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uRim;\nuniform vec3 uRimColor;')
      .replace(
        '#include <dithering_fragment>',
        [
          'vec3 toyN = normalize( normal );',
          'vec3 toyV = normalize( vViewPosition );',
          'float toyRim = pow( 1.0 - clamp( dot( toyN, toyV ), 0.0, 1.0 ), 3.0 );',
          'gl_FragColor.rgb += uRimColor * toyRim * uRim;',
          '#include <dithering_fragment>',
        ].join('\n'),
      );
  };
  toon.customProgramCacheKey = () => 'hero-toon';

  const outline = new THREE.MeshBasicMaterial({
    vertexColors: true,
    side: THREE.BackSide,
    fog: true,
  });
  outline.onBeforeCompile = (shader) => {
    shader.uniforms.uOutline = MAT.outlineWidth;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uOutline;')
      .replace('#include <project_vertex>', 'transformed += objectNormal * uOutline;\n#include <project_vertex>');
  };
  outline.customProgramCacheKey = () => 'hero-outline';

  const flat = new THREE.MeshBasicMaterial({ vertexColors: true, fog: true });

  const glossy = new THREE.MeshPhongMaterial({
    color: 0xffffff,
    vertexColors: true,
    specular: new THREE.Color('#ffffff'),
    shininess: 70,
    fog: true,
  });

  // Props and terrain: plain Lambert so they respond to the day/night lights
  // without a toon ramp banding across the ground.
  const lit = new THREE.MeshLambertMaterial({ vertexColors: true, fog: true });

  // Grass and flowers sway. One material, one program, thousands of instances.
  const foliage = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, fog: true });
  foliage.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = MAT.time;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nattribute float aSway;')
      .replace(
        '#include <begin_vertex>',
        [
          '#include <begin_vertex>',
          '#ifdef USE_INSTANCING',
          '  float seed = instanceMatrix[3][0] * 1.7 + instanceMatrix[3][2] * 2.3;',
          '#else',
          '  float seed = 0.0;',
          '#endif',
          '  float bend = max(position.y, 0.0) * aSway;',
          '  transformed.x += sin(uTime * 1.6 + seed) * bend * 0.55;',
          '  transformed.z += cos(uTime * 1.31 + seed * 1.4) * bend * 0.42;',
        ].join('\n'),
      );
  };
  foliage.customProgramCacheKey = () => 'hero-foliage';

  const emote = new THREE.MeshBasicMaterial({
    transparent: true, depthWrite: false, fog: false,
  });

  // Props get the same inverted-hull treatment as the creatures: a slightly
  // fattened back-face shell in a dark plum. Fixed colour (no vertexColors) so
  // a rock's own grey never leaks into its outline.
  const propOutline = new THREE.MeshBasicMaterial({
    color: new THREE.Color('#2b2136'),
    side: THREE.BackSide,
    fog: true,
  });
  propOutline.onBeforeCompile = (shader) => {
    shader.uniforms.uOutline = MAT.outlineWidth;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uOutline;')
      // props are NOT skinned, so the plain `normal` attribute is the one that
      // exists here; `objectNormal` only exists once skinning is in play.
      .replace('#include <project_vertex>', 'transformed += normal * uOutline * 0.75;\n#include <project_vertex>');
  };
  propOutline.customProgramCacheKey = () => 'prop-outline';

  // Tool feedback. Additive so a ripple glows against grass and against night.
  const vfxRing = new THREE.MeshBasicMaterial({
    vertexColors: true, transparent: true, opacity: 0.95,
    blending: THREE.AdditiveBlending, depthWrite: false,
    side: THREE.DoubleSide, fog: false,
  });
  const vfxPuff = new THREE.MeshBasicMaterial({
    vertexColors: true, transparent: true, opacity: 0.85,
    blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
  });

  MAT.lit = lit;
  MAT.foliage = foliage;
  MAT.emote = emote;
  MAT.toon = toon;
  MAT.outline = outline;
  MAT.flat = flat;
  MAT.glossy = glossy;
  MAT.propOutline = propOutline;
  MAT.vfxRing = vfxRing;
  MAT.vfxPuff = vfxPuff;
  MAT.built = true;
}

export function disposeMaterials(): void {
  if (!MAT.built) return;
  MAT.toon.dispose();
  MAT.lit.dispose();
  MAT.foliage.dispose();
  MAT.emote.dispose();
  MAT.outline.dispose();
  MAT.flat.dispose();
  MAT.glossy.dispose();
  MAT.propOutline.dispose();
  MAT.vfxRing.dispose();
  MAT.vfxPuff.dispose();
  MAT.ramp.dispose();
  MAT.built = false;
}
