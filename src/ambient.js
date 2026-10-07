// Ambient motion: fireflies in the dark grass and slow embers that outlive the
// sparks. Two THREE.Points clouds, one draw call each, no lights, no shadows.
// Same recipe as the starfield in world.js: a small ShaderMaterial, additive,
// depthWrite off, toneMapped off. Fog is off on both (see the notes at each
// material); neither one touches game state, they only read level and wind.
import * as THREE from "three";
import { AMBIENT } from "./config.js?v=153";

const TAU = Math.PI * 2;

// Screen size shared by both clouds: a glow of `sizeWorld` units at the point's
// depth, using the live projection so it follows the camera and the viewport,
// then clamped so a far one never vanishes and a near one never balloons.
const SIZE_GLSL = `
  uniform float uHeight;   // drawing-buffer height in device pixels
  uniform float uPixelRatio;
  float pointPx(float sizeWorld, float depth, float minPx, float maxPx) {
    float px = sizeWorld * projectionMatrix[1][1] * uHeight * 0.5 / max(depth, 0.1);
    return clamp(px, minPx * uPixelRatio, maxPx * uPixelRatio);
  }
`;

export function buildAmbient(scene, renderer) {
  const size = new THREE.Vector2();
  const shared = () => ({ uHeight: { value: 900 }, uPixelRatio: { value: 1 }, uTime: { value: 0 } });

  // ---------- Fireflies ----------
  // All motion lives in the vertex shader (a few sines off uTime), so there is no
  // per-frame CPU work and nothing to flicker between frames: the same time gives
  // the same picture. Each one has its own home spot, wander phases, blink period
  // and blink phase. A blink is a quick fade up and a slower fade down, then a
  // long dark gap, so at any moment well under half of them are lit.
  const F = AMBIENT.fireflies;
  const fHome = new Float32Array(F.count * 3);
  const fSeed = new Float32Array(F.count * 4);    // wander phase x3, blink phase
  const fPer = new Float32Array(F.count * 2);     // blink period, size scale
  for (let i = 0; i < F.count; i++) {
    // Even spread around the ring (jittered) so the line is not clumped, with the
    // radius biased outward toward the tree line.
    const a = ((i + Math.random()) / F.count) * TAU;
    const r = F.rMin + (F.rMax - F.rMin) * Math.pow(Math.random(), 0.7);
    fHome[i * 3] = Math.sin(a) * r;
    fHome[i * 3 + 1] = F.yMin + Math.random() * (F.yMax - F.yMin);
    fHome[i * 3 + 2] = Math.cos(a) * r;
    for (let k = 0; k < 4; k++) fSeed[i * 4 + k] = Math.random() * TAU;
    fSeed[i * 4 + 3] = Math.random();               // blink phase as 0..1
    fPer[i * 2] = F.periodMin + Math.random() * (F.periodMax - F.periodMin);
    fPer[i * 2 + 1] = 0.75 + Math.random() * 0.5;
  }
  const fGeo = new THREE.BufferGeometry();
  fGeo.setAttribute("position", new THREE.BufferAttribute(fHome, 3));
  fGeo.setAttribute("aSeed", new THREE.BufferAttribute(fSeed, 4));
  fGeo.setAttribute("aPer", new THREE.BufferAttribute(fPer, 2));
  const fMat = new THREE.ShaderMaterial({
    uniforms: { ...shared(), uDrift: { value: F.drift }, uSizeWorld: { value: F.sizeWorld }, uMinPx: { value: F.minPx }, uMaxPx: { value: F.maxPx } },
    vertexShader: `
      ${SIZE_GLSL}
      uniform float uTime;
      uniform float uDrift;
      uniform float uSizeWorld;
      uniform float uMinPx;
      uniform float uMaxPx;
      attribute vec4 aSeed;
      attribute vec2 aPer;
      varying float vLit;
      void main() {
        float t = uTime;
        vec3 p = position;
        p.x += (sin(t * 0.23 + aSeed.x) + 0.35 * sin(t * 0.61 + aSeed.y)) * uDrift * 0.7;
        p.z += (cos(t * 0.19 + aSeed.z) + 0.35 * sin(t * 0.53 + aSeed.x)) * uDrift * 0.7;
        p.y += sin(t * 0.37 + aSeed.y) * uDrift * 0.3;
        p.y = max(p.y, 0.25);
        // Blink: quick rise, slower fall, long dark gap.
        float c = fract(t / aPer.x + aSeed.w);
        float on = smoothstep(0.0, 0.08, c) * (1.0 - smoothstep(0.25, 0.55, c));
        float shimmer = 0.88 + 0.12 * sin(t * 7.0 + aSeed.z * 3.0);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        float depth = -mv.z;
        // Dim a little with distance instead of using scene fog (fog is 16 to 30 and
        // would swallow the far side entirely; these are light sources, not surfaces).
        float far = mix(1.0, 0.5, smoothstep(18.0, 32.0, depth));
        vLit = on * shimmer * far;
        gl_Position = projectionMatrix * mv;
        gl_PointSize = pointPx(uSizeWorld * aPer.y, depth, uMinPx, uMaxPx);
      }
    `,
    fragmentShader: `
      varying float vLit;
      void main() {
        if (vLit < 0.01) discard;
        vec2 d = gl_PointCoord - 0.5;
        float r = length(d) * 2.0;
        if (r > 1.0) discard;
        float core = 1.0 - smoothstep(0.0, 0.34, r);
        float halo = pow(1.0 - r, 1.8);
        vec3 col = mix(vec3(0.40, 0.90, 0.16), vec3(0.88, 1.0, 0.52), core);
        float a = min(1.0, core * 0.95 + halo * 0.5) * vLit;
        gl_FragColor = vec4(col, a);
      }
    `,
    transparent: true, depthWrite: false, fog: false, toneMapped: false,
    blending: THREE.AdditiveBlending,
  });
  const fireflies = new THREE.Points(fGeo, fMat);
  fireflies.frustumCulled = false;   // positions move in the shader; the stored bounds are only the home spots
  fireflies.renderOrder = 5;
  scene.add(fireflies);

  // ---------- Embers ----------
  // A CPU pool (36 slots) because they respond to the fire level and the wind.
  // Where a spark is a quick bright fleck, an ember is a slow deep-orange glow
  // that wanders up and away, cools from orange to dull red as it ages, and is
  // gone a few units over the fire.
  const E = AMBIENT.embers;
  const ePos = new Float32Array(E.pool * 3);
  const eData = new Float32Array(E.pool * 3);   // age fraction, alpha, size scale
  const eAge = new Float32Array(E.pool).fill(999);
  const eLife = new Float32Array(E.pool).fill(1);
  const eVel = new Float32Array(E.pool * 3);
  const ePh = new Float32Array(E.pool * 2);
  for (let i = 0; i < E.pool; i++) ePos[i * 3 + 1] = -50;
  const eGeo = new THREE.BufferGeometry();
  const ePosAttr = new THREE.BufferAttribute(ePos, 3);
  const eDataAttr = new THREE.BufferAttribute(eData, 3);
  ePosAttr.setUsage(THREE.DynamicDrawUsage);
  eDataAttr.setUsage(THREE.DynamicDrawUsage);
  eGeo.setAttribute("position", ePosAttr);
  eGeo.setAttribute("aData", eDataAttr);
  const eMat = new THREE.ShaderMaterial({
    uniforms: { ...shared(), uSizeWorld: { value: E.sizeWorld }, uMinPx: { value: E.minPx }, uMaxPx: { value: E.maxPx } },
    vertexShader: `
      ${SIZE_GLSL}
      uniform float uSizeWorld;
      uniform float uMinPx;
      uniform float uMaxPx;
      attribute vec3 aData;
      varying float vK;
      varying float vA;
      void main() {
        vK = aData.x;
        vA = aData.y;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = vA > 0.003 ? pointPx(uSizeWorld * aData.z, -mv.z, uMinPx, uMaxPx) : 0.0;
      }
    `,
    fragmentShader: `
      varying float vK;
      varying float vA;
      void main() {
        if (vA < 0.01) discard;
        vec2 d = gl_PointCoord - 0.5;
        float r = length(d) * 2.0;
        if (r > 1.0) discard;
        float core = exp(-r * r * 7.0);
        float halo = pow(1.0 - r, 1.6);
        // Hot orange at birth, dull red when it is about to go.
        vec3 hot = vec3(1.0, 0.56, 0.16);
        vec3 cool = vec3(0.85, 0.16, 0.04);
        vec3 col = mix(hot, cool, smoothstep(0.1, 0.9, vK));
        col = mix(col, vec3(1.0, 0.82, 0.45), core * (1.0 - vK) * 0.6);
        float a = min(1.0, core * 0.85 + halo * 0.45) * vA;
        gl_FragColor = vec4(col, a);
      }
    `,
    transparent: true, depthWrite: false, fog: false, toneMapped: false,
    blending: THREE.AdditiveBlending,
  });
  const embers = new THREE.Points(eGeo, eMat);
  embers.frustumCulled = false;
  embers.renderOrder = 6;
  scene.add(embers);

  let clock = 0, spawnAcc = 0, windAmt = 0, windX = 0, windZ = 0;

  // update(dt, { level, wind, t }): level is fire.level / FIRE.hot (0 to 1.5),
  // wind is state.wind. `t` is accepted for the call contract but the clouds keep
  // their own clock so the lobby (where state.t is frozen) and a pause still move.
  return function updateAmbient(dt, { level = 0, wind = null } = {}) {
    clock += dt;
    renderer.getDrawingBufferSize(size);
    const pr = renderer.getPixelRatio();
    fMat.uniforms.uTime.value = eMat.uniforms.uTime.value = clock;
    fMat.uniforms.uHeight.value = eMat.uniforms.uHeight.value = size.y;
    fMat.uniforms.uPixelRatio.value = eMat.uniforms.uPixelRatio.value = pr;

    // Wind: ease toward the gust so the embers lean in rather than snap.
    const gust = wind && wind.active ? 1 : 0;
    windAmt += (gust - windAmt) * Math.min(1, dt * 1.5);
    if (wind && wind.dir) { windX = -wind.dir.x; windZ = -wind.dir.y; }   // dir is where it comes FROM
    const push = E.breeze + (E.gustPush - E.breeze) * windAmt;

    // Spawn rate follows the fire: none when it is nearly out, more above the hot line.
    const base = Math.max(0, (level - E.minLevel) / (1 - E.minLevel));
    const rate = Math.pow(Math.min(1, base), 1.3) * E.rate + Math.max(0, level - 1) * E.hotRate;
    spawnAcc = Math.min(spawnAcc + rate * dt, 3);

    for (let i = 0; i < E.pool; i++) {
      const o = i * 3;
      if (eAge[i] >= eLife[i]) {
        if (spawnAcc < 1) { eData[o + 1] = 0; continue; }
        spawnAcc -= 1;
        eAge[i] = 0;
        eLife[i] = E.lifeMin + Math.random() * (E.lifeMax - E.lifeMin);
        const a = Math.random() * TAU, r = Math.random() * 0.45;
        ePos[o] = Math.sin(a) * r;
        ePos[o + 1] = 0.7 + Math.random() * 0.7 + Math.min(1, level) * 0.4;   // lifts off the flame tips
        ePos[o + 2] = Math.cos(a) * r;
        eVel[o] = (Math.random() - 0.5) * 0.45;
        eVel[o + 1] = E.rise * (0.7 + Math.random() * 0.6);
        eVel[o + 2] = (Math.random() - 0.5) * 0.45;
        ePh[i * 2] = Math.random() * TAU;
        ePh[i * 2 + 1] = Math.random() * TAU;
        eData[o + 2] = 0.7 + Math.random() * 0.6;
      }
      eAge[i] += dt;
      const k = Math.min(1, eAge[i] / eLife[i]);
      const age = eAge[i];
      // Lazy sideways wander, and the rise slows as it cools.
      ePos[o] += (eVel[o] + Math.sin(age * 0.9 + ePh[i * 2]) * 0.32 + windX * push) * dt;
      ePos[o + 1] += eVel[o + 1] * (1 - k * 0.55) * dt;
      ePos[o + 2] += (eVel[o + 2] + Math.cos(age * 0.8 + ePh[i * 2 + 1]) * 0.32 + windZ * push) * dt;
      const fadeIn = Math.min(1, age / 0.35);
      const flick = 0.82 + 0.18 * Math.sin(age * 9.0 + ePh[i * 2]);
      eData[o] = k;
      eData[o + 1] = k >= 1 ? 0 : fadeIn * Math.pow(1 - k, 1.25) * flick;
    }
    ePosAttr.needsUpdate = true;
    eDataAttr.needsUpdate = true;
  };
}
