// Ground detail: the worn camp clearing, trampled paths, Tom W's two-track lane and
// grass variation, as ONE baked texture on ONE disc plus ONE InstancedMesh of grass
// tufts (two draw calls; the old flat dirt disc this replaces was one).
//
// The disc sits just above the big green ground mesh and is opaque: the texture
// bakes the same base green (#2f4a1f) everywhere it is "just grass", so it matches
// the ground mesh underneath exactly at the rim and needs no alpha blending (a
// transparent layer would sort against the flame sprites and blend after tone
// mapping). It is a Lambert surface that receives shadows, so the fire's warm pool
// and the campers' long shadows read exactly as they did on the flat dirt.
//
// Everything here is deterministic (seeded noise, mulberry32) and visual only:
// nothing casts a shadow, nothing is collidable, nothing is interactive.
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { LAYOUT, TRUCK } from "./config.js?v=159";
import { buildTruckPath, makeTruckRoadProbe } from "./truck.js?v=159";
import { mulberry32 } from "./props.js?v=159";

const BASE_GREEN = "#2f4a1f";   // world.js's ground mesh colour; the rim of this disc must match it
const HALF = 19;                // disc radius in world units (the ground mesh is 30; fog hides the rest)
const TEX = 1024;               // texels per side: ~0.037 world units per texel
const PX = (HALF * 2) / TEX;
const Y = 0.012;                // the old dirt disc sat at 0.01; the ash disc is at 0.02

// ---------- small helpers ----------

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const mix = (a, b, t) => a + (b - a) * t;

function makeNoise(seed) {
  const rnd = mulberry32(seed);
  const T = new Float32Array(1024);
  for (let i = 0; i < 1024; i++) T[i] = rnd();
  const lat = (ix, iy) => {
    let h = (Math.imul(ix, 374761393) + Math.imul(iy, 668265263)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return T[h & 1023];
  };
  const raw = (x, y) => {
    const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
    const u = fx * fx * fx * (fx * (fx * 6 - 15) + 10), v = fy * fy * fy * (fy * (fy * 6 - 15) + 10);
    const a = lat(ix, iy), b = lat(ix + 1, iy), c = lat(ix, iy + 1), d = lat(ix + 1, iy + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
  // Value noise thresholds into boxy, axis-aligned blobs. Averaging it with a rotated
  // copy of itself breaks the grid so patches read as organic.
  const n2 = (x, y) => 0.5 * (raw(x, y) + raw(x * 0.8387 - y * 0.5446 + 17.3, x * 0.5446 + y * 0.8387 - 5.1));
  const fbm = (x, y) => (n2(x, y) * 0.55 + n2(x * 2.03 + 7.1, y * 2.03 - 3.3) * 0.3 + n2(x * 4.1 - 5.7, y * 4.1 + 9.2) * 0.15);
  return { n2, fbm };
}

// linear-light colour triples (THREE converts hex from sRGB to its linear working space)
const lin = (hex) => { const c = new THREE.Color(hex); return [c.r, c.g, c.b]; };
const SRGB_LUT = (() => {
  const L = new Uint8Array(4097);
  for (let i = 0; i <= 4096; i++) { const v = i / 4096; L[i] = Math.round(255 * (v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055)); }
  return L;
})();
const enc = (v) => SRGB_LUT[Math.min(4096, Math.max(0, (v * 4096) | 0))];

// ---------- the baked texture ----------

function bakeGroundTexture() {
  const { n2, fbm } = makeNoise(20261007);
  const N = TEX;
  const toI = (x) => (x + HALF) / PX;          // world x -> texel column
  const toJ = (z) => (HALF - z) / PX;          // world z -> texel row (row 0 is the bottom of the texture, world +z)

  // Influence fields, 0..1, painted by splatting soft discs along curves.
  const pathF = new Float32Array(N * N);       // trampled walking paths
  const lobeF = new Float32Array(N * N);       // broad soft swath around each path: the clearing spreads out along it
  const wornF = new Float32Array(N * N);       // worn patches where people stand at a station
  const trackF = new Float32Array(N * N);      // the two wheel tracks
  const laneF = new Float32Array(N * N);       // the faint flattened lane between and around them
  function splat(F, x, z, rad, core, k) {
    const ci = toI(x), cj = toJ(z), rp = rad / PX;
    const i0 = Math.max(0, Math.floor(ci - rp)), i1 = Math.min(N - 1, Math.ceil(ci + rp));
    const j0 = Math.max(0, Math.floor(cj - rp)), j1 = Math.min(N - 1, Math.ceil(cj + rp));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const dx = (i + 0.5 - ci) * PX, dy = (j + 0.5 - cj) * PX, d = Math.sqrt(dx * dx + dy * dy);
      if (d >= rad) continue;
      const w = (1 - smooth(core, rad, d)) * k, idx = j * N + i;
      if (w > F[idx]) F[idx] = w;
    }
  }

  // Paths: from the chair ring out to each place people walk. A few thin strands that
  // wander and overlap, not one stripe, so the edge is irregular; they taper and fade
  // before the station itself so the item and its hint ring sit on plain ground.
  const STATIONS = [LAYOUT.cabinDoor, LAYOUT.camperDoor, LAYOUT.woodPile, LAYOUT.cooler, LAYOUT.gasCan];
  STATIONS.forEach((st, si) => {
    const len = Math.hypot(st.x, st.z), ux = st.x / len, uz = st.z / len, px = -uz, pz = ux;
    const a0 = 2.9, a1 = Math.max(a0 + 0.5, len - 0.4);          // fire-side start, station-side end (radial distances)
    // One shared wandering centreline per walk (so the strands never fan apart), two
    // overlapping strands either side of it, then loose scuffs scattered around it.
    const bend = (n2(si * 5.3 + 11, 2.1) - 0.5) * 1.1;
    const centre = (t, a) => bend * Math.sin(Math.PI * t) + (fbm(si * 7 + a * 0.7, 3.1) - 0.5) * 0.5;
    const fadeAt = (t) => smooth(0.0, 0.1, t) * (1 - smooth(0.82, 1.0, t));      // in from the dirt, out before the item
    const steps = Math.ceil((a1 - a0) / 0.07);
    for (let strand = 0; strand < 2; strand++) {
      for (let k = 0; k <= steps; k++) {
        const t = k / steps, a = mix(a0, a1, t);
        const lateral = centre(t, a) + (strand ? 0.17 : -0.17) + (fbm(si * 13 + a * 1.3, strand * 4.1) - 0.5) * 0.28;
        const taper = 1 - 0.3 * t, wob = 0.8 + 0.4 * n2(a * 1.7 + si * 4.3, strand * 5.9);
        splat(pathF, ux * a + px * lateral, uz * a + pz * lateral, 0.52 * taper * wob, 0.0, 0.75 * fadeAt(t));
      }
    }
    for (let k = 0; k <= steps; k += 2) {
      const t = k / steps, a = mix(a0, a1, t), lateral = centre(t, a);
      splat(lobeF, ux * a + px * lateral, uz * a + pz * lateral, (1.15 - 0.35 * t) * (0.85 + 0.3 * n2(a * 1.1 + si * 3.1, 2.2)), 0.2, 1.0 * smooth(0.0, 0.12, t) * (1 - smooth(0.7, 1.0, t)));
    }
    const pr = mulberry32(5000 + si);
    const scuffs = Math.round((a1 - a0) * 3.2);
    for (let k = 0; k < scuffs; k++) {
      const t = pr(), a = mix(a0, a1, t), lateral = centre(t, a) + (pr() - 0.5) * 1.3;
      splat(pathF, ux * a + px * lateral, uz * a + pz * lateral, 0.14 + pr() * 0.2, 0.03, 0.5 * fadeAt(t));
    }
    // Worn spot where someone stands to use the station (just on the fire side of it)
    const wx = st.x - ux * 0.35, wz = st.z - uz * 0.35;
    splat(wornF, wx, wz, 0.95, 0.15, 0.5);
    splat(wornF, wx + px * 0.3, wz + pz * 0.3, 0.6, 0.1, 0.4);
  });

  // The lane: two tracks at +/-0.68 from the centreline, broken up so they read as a
  // faint tyre scuff, not a ruled line.
  const curve = buildTruckPath();
  const pts = curve.getSpacedPoints(Math.ceil(curve.getLength() / 0.06));
  const LEN = pts.length;
  for (let k = 0; k < LEN; k++) {
    const p = pts[k], q = pts[Math.min(LEN - 1, k + 1)], o = pts[Math.max(0, k - 1)];
    let tx = q.x - o.x, tz = q.z - o.z; const tl = Math.hypot(tx, tz) || 1; tx /= tl; tz /= tl;
    const nx = tz, nz = -tx;
    const s = k * 0.06;                                                   // distance along the lane
    const edgeFade = 1 - smooth(HALF - 2.4, HALF - 0.6, Math.max(Math.abs(p.x), Math.abs(p.z)));
    const endFade = smooth(0, 1.2, s) ;
    const broken = 0.35 + 0.65 * smooth(0.28, 0.6, fbm(s * 0.16 + 3.1, 5.5));   // patchy, not continuous
    if (k % 4 === 0) splat(laneF, p.x, p.z, 1.15, 0.45, 0.8 * edgeFade * endFade);
    for (const side of [-1, 1]) {
      const wob = (fbm(s * 0.35 + side * 9.3, 2.2) - 0.5) * 0.16;
      const lx = p.x + nx * (side * 0.68 + wob), lz = p.z + nz * (side * 0.68 + wob);
      const w = 0.07 + 0.045 * n2(s * 0.8 + side * 3.3, 8.8);
      splat(trackF, lx, lz, w * 2.0, w * 0.45, 0.95 * broken * edgeFade * endFade * (0.7 + 0.3 * n2(s * 2.3 + side, 1.7)));
    }
  }

  // ---- colours (sRGB hex, mixed in linear light) ----
  const C = {
    grass: lin(BASE_GREEN),
    grassLight: lin("#43602a"), grassDry: lin("#566130"), grassDark: lin("#1f351a"),
    duff: lin("#3d3321"),
    dirt: lin("#5c4a33"), dirtLight: lin("#705b3d"), dirtPacked: lin("#3b2e20"), dirtChar: lin("#34291f"),
    fringe: lin("#4d4a2b"),
    path: lin("#3b2d1d"), worn: lin("#4a3b27"),
    track: lin("#2a2218"), lane: lin("#3f4a24"),
  };

  // Smooth grass colour on a coarse grid (it only varies over metres), sampled bilinearly
  // per texel: ~4x cheaper than evaluating the drift noise at full resolution.
  const GN = 256, coarse = new Float32Array((GN + 1) * (GN + 1) * 3);
  {
    const g = [0, 0, 0], put = (c, t) => { g[0] = mix(g[0], c[0], t); g[1] = mix(g[1], c[1], t); g[2] = mix(g[2], c[2], t); };
    for (let gj = 0; gj <= GN; gj++) for (let gi = 0; gi <= GN; gi++) {
      const x = -HALF + gi * (2 * HALF) / GN, z = -HALF + gj * (2 * HALF) / GN, r = Math.hypot(x, z);
      g[0] = C.grass[0]; g[1] = C.grass[1]; g[2] = C.grass[2];
      const big = fbm(x * 0.2 + 10.3, z * 0.2 - 4.1);
      put(C.grassLight, smooth(0.5, 0.74, big) * 0.5);
      put(C.grassDark, smooth(0.48, 0.24, big) * 0.55);
      put(C.grassDry, smooth(0.6, 0.82, n2(x * 0.33 - 6.2, z * 0.33 + 2.7)) * 0.4);
      const lum = 0.88 + 0.26 * n2(x * 0.8 + 3.3, z * 0.8 - 7.7);
      g[0] *= lum; g[1] *= lum; g[2] *= lum;
      const tl = smooth(6.5, 12.5, r);
      put(C.duff, tl * smooth(0.5, 0.85, n2(x * 0.5 + 20.5, z * 0.5 + 8.2)) * 0.55);
      put(C.grassDark, tl * 0.35);
      const sh = 1 - 0.12 * tl;
      const o = (gj * (GN + 1) + gi) * 3; coarse[o] = g[0] * sh; coarse[o + 1] = g[1] * sh; coarse[o + 2] = g[2] * sh;
    }
  }

  const data = new Uint8Array(N * N * 4);
  const col = [0, 0, 0];
  const mixTo = (c, t) => { col[0] = mix(col[0], c[0], t); col[1] = mix(col[1], c[1], t); col[2] = mix(col[2], c[2], t); };
  const scale = (k) => { col[0] *= k; col[1] *= k; col[2] *= k; };

  function bakeRows(j0, j1) {
  for (let j = j0; j < j1; j++) {
    const z = HALF - (j + 0.5) * PX;
    for (let i = 0; i < N; i++) {
      const x = -HALF + (i + 0.5) * PX, idx = j * N + i;
      const r = Math.sqrt(x * x + z * z);
      const rim = smooth(HALF - 3.2, HALF - 0.4, r);               // blend back to the exact base green at the disc rim

      // --- grass: the smooth part (drifts, shade, litter) comes from the coarse grid; the
      // fine mottling is per texel
      const gu = (x + HALF) / (2 * HALF) * GN, gv = (z + HALF) / (2 * HALF) * GN;
      const gi = Math.min(GN - 1, Math.floor(gu)), gj = Math.min(GN - 1, Math.floor(gv)), fu = gu - gi, fv = gv - gj;
      const g00 = (gj * (GN + 1) + gi) * 3, g10 = g00 + 3, g01 = g00 + (GN + 1) * 3, g11 = g01 + 3;
      for (let q = 0; q < 3; q++) col[q] = mix(mix(coarse[g00 + q], coarse[g10 + q], fu), mix(coarse[g01 + q], coarse[g11 + q], fu), fv);
      scale(0.93 + 0.14 * n2(x * 2.9, z * 2.9 + 4.4));
      const tl = smooth(6.5, 12.5, r);
      // dark clump stipple, chunky, a little denser outward
      const stip = smooth(0.72, 0.86, n2(x * 3.6 + 40.0, z * 3.6 - 12.0));
      scale(1 - stip * (0.1 + 0.14 * tl));

      // --- lane band under the tracks: a hint of flattened, drier grass
      if (laneF[idx] > 0) mixTo(C.lane, laneF[idx] * 0.22 * (0.6 + 0.8 * n2(x * 1.4, z * 1.4)));

      // --- the clearing: irregular soft-edged worn dirt, packed and dark by the chairs
      let da = 0, c = 0;
      let th = 0, cx = 0, sy = 0;
      if (r < 11.5) {                                              // the clearing and its lobes never reach past this
        th = Math.atan2(z, x); cx = Math.cos(th); sy = Math.sin(th);
        const edge = 4.4 + (n2(cx * 1.0 + 3.0, sy * 1.0 + 1.0) - 0.5) * 3.6 + (n2(cx * 2.4 + 9.0, sy * 2.4 - 2.0) - 0.5) * 1.8;
        const warp = (fbm(x * 1.3 + 5.5, z * 1.3 + 1.5) - 0.5) * 0.9;
        c = 1 - smooth(edge - 1.1, edge + 1.0, r + warp - 1.6 * lobeF[idx]);   // 1 inside, 0 well outside, ragged between; spreads out along the walked routes
        const hf = n2(x * 2.6 + 17.0, z * 2.6 - 9.0);
        da = smooth(0.3, 0.72, c + (hf - 0.5) * 0.4);
      }
      if (da > 0) {
        const dc = [C.dirt[0], C.dirt[1], C.dirt[2]];
        const mottle = n2(x * 1.6 + 2.0, z * 1.6 + 6.0);
        const lighten = smooth(0.5, 0.78, mottle) * 0.55 + smooth(0.0, 0.55, 1 - c) * 0.4;     // lighter, dustier toward the ragged edge
        for (let q = 0; q < 3; q++) dc[q] = mix(dc[q], C.dirtLight[q], lighten);
        // scuffed raking in rings (anisotropic noise in polar space) and the packed band at the chairs
        const scuff = 0.6 * n2(r * 2.6 + 31.0, 7.0) + 0.4 * n2(x * 1.9 + 5.0, z * 1.9 + 5.0);
        const packed = Math.exp(-(((r - 3.3) / 0.8) ** 2)) * (0.25 + 1.1 * scuff) * (0.35 + 0.9 * smooth(0.25, 0.7, n2(cx * 1.7 + 41.0, sy * 1.7 + 3.0)));
        const charred = smooth(2.9, 1.3, r);
        const cw = charred * 0.65, pw = packed * 0.75, tot = cw + pw;
        if (tot > 0) {
          const share = cw / tot, kk = Math.min(0.85, tot);
          for (let q = 0; q < 3; q++) dc[q] = mix(dc[q], mix(C.dirtPacked[q], C.dirtChar[q], share), kk);
        }
        const sp = smooth(0.68, 0.8, n2(x * 5.2 + 3.0, z * 5.2 + 13.0));                       // a few pebbles / scuffs
        const k = 1 - sp * 0.2 + (scuff - 0.5) * 0.12;
        dc[0] *= k; dc[1] *= k; dc[2] *= k;
        // soft grass-dirt fringe before it goes fully to green
        const fr = smooth(0.0, 0.55, 1 - c) * 0.5;
        for (let q = 0; q < 3; q++) dc[q] = mix(dc[q], C.fringe[q], fr);
        mixTo(dc, da);
      }

      // --- paths, worn spots
      const pa = pathF[idx];
      if (pa > 0) mixTo(C.path, Math.min(1, pa * 0.75 * (0.65 + 0.7 * n2(x * 3.3 + 8.0, z * 3.3 - 5.0)) * (1 - 0.15 * da)));
      const wa = wornF[idx];
      if (wa > 0) mixTo(C.worn, wa * 0.55 * (0.7 + 0.6 * n2(x * 2.6 - 3.0, z * 2.6 + 9.0)));

      // --- tyre tracks
      const ta = trackF[idx];
      if (ta > 0) mixTo(C.track, ta * 0.5);

      // --- exact base green at the rim so the disc and the ground mesh meet seamlessly
      if (rim > 0) mixTo(C.grass, rim);

      const o = idx * 4;
      data[o] = enc(col[0]); data[o + 1] = enc(col[1]); data[o + 2] = enc(col[2]); data[o + 3] = 255;
    }
  }
  }

  // The texels are filled a few rows at a time (pump), not in one long frame; the disc
  // shows plain base green until the last row lands, then the map is swapped in.
  let nextRow = 0;
  const pump = (ms) => {
    const t0 = performance.now();
    while (nextRow < N && performance.now() - t0 < ms) { const e = Math.min(N, nextRow + 16); bakeRows(nextRow, e); nextRow = e; }
    return nextRow >= N;
  };

  const tex = new THREE.DataTexture(data, N, N, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return { tex, pump, pathF, wornF, toI, toJ };
}

// ---------- grass tufts ----------

function buildTufts(scene, fields) {
  const rnd = mulberry32(20261008);
  const road = makeTruckRoadProbe();
  const { n2 } = makeNoise(777);

  // One tuft: three thin, tilted three-sided blades (9 triangles), dark at the root,
  // lighter at the tip via vertex colour.
  const blades = [];
  for (let b = 0; b < 3; b++) {
    // a blade is a three-sided spike with no base: exactly three triangles
    const h = 0.26 + 0.05 * b, lean = 0.09 + 0.05 * b, rr = 0.04;
    const P = [];
    const base = [0, 1, 2].map((k) => [Math.cos(k * 2.094) * rr, 0, Math.sin(k * 2.094) * rr]);
    const apex = [lean, h, 0];
    for (let k = 0; k < 3; k++) P.push(...base[k], ...base[(k + 1) % 3], ...apex);
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(P, 3));
    g.computeVertexNormals();
    g.rotateY(b * 2.1 + 0.4);
    g.translate((b - 1) * 0.035, 0, ((b * 7) % 3 - 1) * 0.03);
    blades.push(g);
  }
  const geo = mergeGeometries(blades);
  const pos = geo.attributes.position, colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) { const k = 0.5 + 0.5 * Math.min(1, pos.getY(i) / 0.3); colors[i * 3] = k; colors[i * 3 + 1] = k; colors[i * 3 + 2] = k; }
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));

  const mat = new THREE.MeshLambertMaterial({ color: "#ffffff", vertexColors: true, flatShading: true, side: THREE.DoubleSide });

  // Placement. Denser toward the tree line (which starts around radius 10.5), clumped by
  // noise, and kept off the dirt, the paths, the truck lane, the stations and the
  // buildings, and off the camera-facing foreground.
  const keepClear = [LAYOUT.stick, LAYOUT.woodPile, LAYOUT.gasCan, LAYOUT.cooler, LAYOUT.cabinDoor, LAYOUT.camperDoor, LAYOUT.roadEntry];
  const MAX = 360, items = [];
  let tries = 0;
  while (items.length < MAX && tries < 12000) {
    tries++;
    const a = rnd() * Math.PI * 2, r = 5.6 + rnd() * 10.4;
    const x = Math.sin(a) * r, z = Math.cos(a) * r;
    const dens = 0.12 + 0.88 * smooth(6.0, 12.5, r);
    const clump = smooth(0.35, 0.65, n2(x * 0.45 + 2.0, z * 0.45 - 1.0));
    if (rnd() > dens * (0.3 + 0.7 * clump)) continue;
    if (z > 4.5 && r < 11) continue;                                            // camera-facing foreground stays clean
    if (Math.hypot(x + 7.5, z + 7) < 2.4 || Math.hypot(x - 7.5, z + 7) < 2.6) continue;   // cabin, trailer
    if (keepClear.some((k) => Math.hypot(x - k.x, z - k.z) < 1.5)) continue;
    if (road(x, z).dist < 1.7) continue;                                         // Tom W's lane
    const i = Math.floor(fields.toI(x)), j = Math.floor(fields.toJ(z));
    const idx = j * TEX + i;
    if (fields.pathF[idx] > 0.05 || fields.wornF[idx] > 0.05) continue;
    items.push({ x, z, s: 0.55 + rnd() * 0.6 + 0.3 * smooth(8, 13, r), yaw: rnd() * Math.PI * 2, t: rnd() });
  }

  const mesh = new THREE.InstancedMesh(geo, mat, items.length);
  mesh.name = "groundTufts";
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), sc = new THREE.Vector3(), p = new THREE.Vector3();
  const green = new THREE.Color("#2c4a1c"), light = new THREE.Color("#52712f"), dry = new THREE.Color("#5a6030"), c = new THREE.Color();
  items.forEach((it, k) => {
    q.setFromAxisAngle(up, it.yaw);
    sc.set(it.s, it.s * (0.8 + 0.5 * it.t), it.s);
    p.set(it.x, Y - 0.002, it.z);
    m.compose(p, q, sc);
    mesh.setMatrixAt(k, m);
    c.copy(green).lerp(light, it.t);
    if (it.t > 0.88) c.lerp(dry, 0.6);
    mesh.setColorAt(k, c);
  });
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  scene.add(mesh);
  return mesh;
}

// ---------- entry point ----------

export function buildGroundDetail(scene) {
  const fields = bakeGroundTexture();
  const mat = new THREE.MeshLambertMaterial({ color: BASE_GREEN });   // plain base green until the baked map is ready
  const disc = new THREE.Mesh(new THREE.CircleGeometry(HALF, 64), mat);
  disc.name = "groundDetail";
  disc.rotation.x = -Math.PI / 2;
  disc.position.y = Y;
  disc.receiveShadow = true;
  scene.add(disc);
  const tufts = buildTufts(scene, fields);
  const finish = () => { mat.color.set("#ffffff"); mat.map = fields.tex; mat.needsUpdate = true; fields.tex.needsUpdate = true; };
  if (typeof requestAnimationFrame !== "function") { fields.pump(Infinity); finish(); }
  else {
    const tick = () => { if (fields.pump(10)) finish(); else requestAnimationFrame(tick); };   // ~10 ms of texel work per frame
    requestAnimationFrame(tick);
  }
  return { disc, tufts };
}
