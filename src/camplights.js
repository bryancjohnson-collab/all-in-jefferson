// Fake lamplight for the two buildings at the back of camp (cabin, travel trailer).
//
// NO real lights: a PointLight costs every lit material in the scene on a phone.
// This is a handful of additive sprites (halos around the porch lamps and lit
// windows) plus ONE merged additive decal mesh that lays soft warm pools of
// light on the ground and the cabin deck. Everything is fog:false, same as the
// truck headlights and the moon: the buildings sit ~26 units from the gameplay
// camera (fog 16..30), so a fogged glow would be eaten before it showed. Because
// the glow is not fogged, every strength below is kept low on purpose.
//
// Cost: 5 halo sprites + 1 decal mesh = 6 draw calls. Nothing casts or receives
// shadows. The updater only rewrites a few vertex colours and opacities.
//
// Lamp and window positions are the same local numbers props.js (buildCabin) and
// trailer.js (buildTravelTrailer) use, taken to world space through the placed
// group, so moving either building in world.js moves its glow with it.
import * as THREE from "three";

const LIFT = 0.8;   // world units; see the sprite hook below
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// Round halo: hot cream core, orange skirt, long soft tail. Alpha carries the shape.
function makeHaloTexture() {
  const c = document.createElement("canvas"); c.width = c.height = 128;
  const g = c.getContext("2d");
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0.00, "rgba(255,236,190,1)");
  grad.addColorStop(0.10, "rgba(255,206,130,0.62)");
  grad.addColorStop(0.28, "rgba(255,170,80,0.26)");
  grad.addColorStop(0.55, "rgba(255,140,50,0.08)");
  grad.addColorStop(1.00, "rgba(255,120,40,0)");
  g.fillStyle = grad; g.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Window glow: a soft rounded rectangle (plateau where the pane is, smooth skirt
// outside it) so the pane does not pick up a hot round centre. hw/hh are the pane's
// half extents as a fraction of the texture; the sprite is scaled so they match the glass.
function makeWindowTexture(hw, hh) {
  const N = 128, c = document.createElement("canvas"); c.width = c.height = N;
  const g = c.getContext("2d"), img = g.createImageData(N, N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const px = (x + 0.5) / N - 0.5, py = (y + 0.5) / N - 0.5;
    const dx = Math.max(0, Math.abs(px) - hw), dy = Math.max(0, Math.abs(py) - hh);
    const d = Math.hypot(dx, dy) / 0.5;                  // 0 on the pane, 1 at the texture edge
    const a = Math.pow(Math.max(0, 1 - d), 3.2) * (0.5 + 0.5 * Math.exp(-d * 8));
    const i = (y * N + x) * 4;
    img.data[i] = 255; img.data[i + 1] = 214 - 40 * d; img.data[i + 2] = 150 - 70 * d; img.data[i + 3] = Math.round(255 * a);
  }
  g.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Ground pool: white with a soft smooth fall-off to exactly zero at the quad edge
// (so no rectangle ever shows). The warm tint comes from vertex colours.
function makePoolTexture() {
  const c = document.createElement("canvas"); c.width = c.height = 128;
  const g = c.getContext("2d");
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0.00, "rgba(255,255,255,1)");
  grad.addColorStop(0.25, "rgba(255,255,255,0.72)");
  grad.addColorStop(0.50, "rgba(255,255,255,0.34)");
  grad.addColorStop(0.75, "rgba(255,255,255,0.09)");
  grad.addColorStop(1.00, "rgba(255,255,255,0)");
  g.fillStyle = grad; g.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const glowMat = (map, color) => new THREE.SpriteMaterial({
  map, color, transparent: true, opacity: 0, depthWrite: false,
  blending: THREE.AdditiveBlending, toneMapped: false, fog: false,
});

export function buildCampLights(scene, { cabin, trailer }) {
  [cabin, trailer].forEach((b) => b.updateMatrixWorld(true));
  const halo = makeHaloTexture(), poolTex = makePoolTexture();
  // Pane half extents / sprite size, so the texture's plateau lands on the glass.
  const cabinWinTex = makeWindowTexture(0.35 / 2.2, 0.3 / 1.8);     // 0.7 x 0.6 pane in a 2.2 x 1.8 sprite
  const trailerWinTex = makeWindowTexture(0.425 / 2.6, 0.275 / 1.7); // 0.85 x 0.55 pane in a 2.6 x 1.7 sprite

  const world = (group, x, y, z) => group.localToWorld(new THREE.Vector3(x, y, z));
  const frontNormal = (group) => new THREE.Vector3(0, 0, 1).transformDirection(group.matrixWorld);

  // ---------------- halo sprites ----------------
  // `at` is building-local. Each halo sits a little out from the wall (along the
  // building's own +z, the lit side) so it floats in front of the pane and lamp
  // rather than inside them. The depth test stays ON: walls, roofs, trees and
  // campers in front of a halo hide it, and from behind the building the facing
  // factor below fades it out as well.
  const halos = [];
  function addHalo(group, at, size, { base, floor, flicker, phase, color = "#ffc070", map = halo }) {
    const sp = new THREE.Sprite(glowMat(map, color));
    sp.position.copy(world(group, at[0], at[1], at[2]));
    sp.scale.set(size[0], size[1], 1);
    sp.renderOrder = 2;
    const n = frontNormal(group);
    const anchor = sp.position.clone();
    const rec = { sp, base, floor, flicker, phase, level: 0 };
    // Fade by how squarely the camera sees the lit side. No camera object is passed
    // to the updater, so this reads it from the render call instead.
    const v = new THREE.Vector3();
    sp.onBeforeRender = (renderer, scn, camera) => {
      v.copy(camera.position).sub(anchor);
      const dist = v.length(); v.divideScalar(dist);
      // A sprite is a flat card facing the camera, so from above its top edge tilts BACK
      // toward the wall and is cut off by it in a hard diagonal. Slide the card toward the
      // camera along the view ray (same spot on screen, plane clear of the wall). three
      // builds modelViewMatrix from matrixWorld right after this hook, so editing the
      // translation here lands in this frame's draw.
      const e = sp.matrixWorld.elements;
      e[12] = anchor.x + v.x * LIFT; e[13] = anchor.y + v.y * LIFT; e[14] = anchor.z + v.z * LIFT;
      // Up close the geometry is already readable and a world-size halo would wash the
      // whole wall (the title camera orbits to within ~5 units), so ease it off inside ~20.
      const near = 0.3 + 0.7 * smooth(6, 20, dist);
      sp.material.opacity = rec.level * near * (floor + (1 - floor) * smooth(-0.3, 0.5, n.dot(v)));
    };
    scene.add(sp); halos.push(rec);
    return rec;
  }

  // Cabin (props.js buildCabin: depth 3, so the front wall is z = 1.5).
  // Porch lamp mesh at (0.68, 1.4, 1.75). Windows at (+-1.3, 1.35, 1.67).
  const cabinLamp = addHalo(cabin, [0.68, 1.4, 1.9], [3.0, 3.0], { base: 0.6, floor: 0.2, flicker: 1, phase: 0.0 });
  addHalo(cabin, [-1.3, 1.35, 1.95], [2.2, 1.8], { base: 0.3, floor: 0.0, flicker: 0, phase: 0, map: cabinWinTex });
  addHalo(cabin, [1.3, 1.35, 1.95], [2.2, 1.8], { base: 0.3, floor: 0.0, flicker: 0, phase: 0, map: cabinWinTex });

  // Trailer (trailer.js: HALF_DEPTH 1, door wall z = 1). Porch lamp mesh at
  // (doorX - 0.42, BOTTOM_Y + 1.45 + 0.12, Z + 0.13) = (0.33, 2.02, 1.145).
  // Big warm window at (-0.75, 1.5, 1.04), 0.85 x 0.55.
  const trailerLamp = addHalo(trailer, [0.33, 2.02, 1.3], [2.8, 2.8], { base: 0.6, floor: 0.2, flicker: 1, phase: 2.1 });
  addHalo(trailer, [-0.75, 1.5, 1.35], [2.6, 1.7], { base: 0.3, floor: 0.0, flicker: 0, phase: 0, map: trailerWinTex });

  // ---------------- ground pools: one merged mesh ----------------
  // Each pool is a flat quad in building-local space (x, z, half extents) at its
  // own height, rotated with the building. `group` ties its strength to a lamp so
  // the pool breathes with its halo. Vertex colour carries tint * strength.
  const pools = [];
  const addPool = (group, x, y, z, hx, hz, tint, strength, lamp) => pools.push({ group, x, y, z, hx, hz, tint: new THREE.Color(tint), strength, lamp });

  const LAMP = "#ff9f48", WIN = "#ffa84f";
  // Cabin. The porch deck top is y 0.15, steps run to z ~3.05, ground is y 0.
  addPool(cabin, 0.45, 0.165, 1.95, 1.05, 0.62, LAMP, 0.46, cabinLamp);     // lamp light on the deck boards
  addPool(cabin, 0.35, 0.03, 3.45, 2.0, 1.35, LAMP, 0.32, cabinLamp);      // below the steps, the door yard
  addPool(cabin, -1.55, 0.03, 2.75, 1.4, 1.2, WIN, 0.19, null);            // spill under the left window
  addPool(cabin, 1.75, 0.03, 2.85, 1.35, 1.15, WIN, 0.17, null);            // spill under the right window
  // Trailer. Ground in front of the door wall (z = 1).
  addPool(trailer, 0.3, 0.03, 2.15, 1.9, 1.35, LAMP, 0.32, trailerLamp);   // lamp pool at the door
  addPool(trailer, -0.9, 0.03, 2.1, 1.7, 1.25, WIN, 0.17, null);           // spill from the big window

  const N = pools.length;
  const pos = new Float32Array(N * 12), uv = new Float32Array(N * 8), col = new Float32Array(N * 12), idx = [];
  const corners = [[-1, -1, 0, 0], [1, -1, 1, 0], [1, 1, 1, 1], [-1, 1, 0, 1]];
  pools.forEach((p, i) => {
    corners.forEach(([sx, sz, u, v], k) => {
      const w = world(p.group, p.x + sx * p.hx, 0, p.z + sz * p.hz);   // y is set below: localToWorld would add the group's height
      pos.set([w.x, p.y, w.z], i * 12 + k * 3);
      uv.set([u, v], i * 8 + k * 2);
    });
    idx.push(i * 4, i * 4 + 2, i * 4 + 1, i * 4, i * 4 + 3, i * 4 + 2);
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
  geo.setIndex(idx);
  geo.computeBoundingSphere();
  const mat = new THREE.MeshBasicMaterial({
    map: poolTex, vertexColors: true, transparent: true, depthWrite: false,
    blending: THREE.AdditiveBlending, toneMapped: false, fog: false,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  });
  const poolMesh = new THREE.Mesh(geo, mat);
  poolMesh.renderOrder = -1;          // flat on the ground: draw before smoke and other transparents
  poolMesh.frustumCulled = false;     // tiny mesh, always cheaper to draw than to cull wrongly
  scene.add(poolMesh);

  // ---------------- per-frame ----------------
  // dawn (0..1) is game.js's last-minute sunrise: the lamps fade as the sky lightens.
  // Windows are steady. Lamps breathe a few percent on slow, incommensurate sines.
  const colAttr = geo.getAttribute("color");
  function update(dt, t, dawn = 0) {
    const night = 1 - smooth(0.0, 0.7, dawn);
    for (const h of halos) {
      const br = h.flicker ? 0.93 + 0.045 * Math.sin(t * 1.7 + h.phase) + 0.025 * Math.sin(t * 4.3 + h.phase * 2.3) : 1;
      h.level = h.base * br * night;
      h.br = br;
    }
    pools.forEach((p, i) => {
      const br = p.lamp ? p.lamp.br : 1;
      const s = p.strength * br * night;
      for (let k = 0; k < 4; k++) colAttr.setXYZ(i * 4 + k, p.tint.r * s, p.tint.g * s, p.tint.b * s);
    });
    colAttr.needsUpdate = true;
  }
  update(0, 0, 0);
  return update;
}
