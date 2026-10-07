// Art pass helpers: a shared GLTF loader/cache for the Kenney nature-kit pieces, and
// the hand-built primitives for props no kit covers (cabin, camper, cooler, gas can,
// camp chair, poker stick). Recolors every loaded material to flat-shaded Lambert so
// the kit's pastel defaults match the firelit night look.
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

const MODEL_DIR = "assets/models/";
const loader = new GLTFLoader();
const templates = new Map();   // name -> loaded template Object3D, reused for every clone
const pending = new Map();     // name -> in-flight load promise

// Exported (in addition to spawnModel below) so world.js's wood pile can pull the
// raw log_large template apart into per-material geometries and merge many
// instances into one draw call per material, instead of one clone per log.
export function loadTemplate(name) {
  if (templates.has(name)) return Promise.resolve(templates.get(name));
  if (pending.has(name)) return pending.get(name);
  const p = new Promise((resolve, reject) => {
    loader.load(`${MODEL_DIR}${name}.glb`, (gltf) => { templates.set(name, gltf.scene); resolve(gltf.scene); }, undefined, reject);
  });
  pending.set(name, p);
  return p;
}

// Every material on a cloned model becomes its own flat-shaded MeshLambertMaterial.
// colorMap keys by the glTF material name; anything not listed keeps its own base color
// (converted, not recolored), so an unexpected material never comes out untouched-PBR.
function recolor(root, colorMap) {
  root.traverse((o) => {
    if (!o.isMesh) return;
    const src = Array.isArray(o.material) ? o.material : [o.material];
    const out = src.map((m) => {
      const c = (colorMap && colorMap[m.name] !== undefined) ? colorMap[m.name] : m.color;
      return new THREE.MeshLambertMaterial({ color: c, flatShading: true });
    });
    o.material = Array.isArray(o.material) ? out : out[0];
  });
}

// Logged once per distinct model, not per instance, so a recolor bug (a material name
// missing from a colorMap) is easy to spot in the console without spamming it.
const loggedMaterials = new Set();
function logMaterialsOnce(name, template) {
  if (loggedMaterials.has(name)) return;
  loggedMaterials.add(name);
  const names = new Set();
  template.traverse((o) => { if (o.isMesh) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => names.add(m.name)); });
  console.debug(`[props] ${name} materials:`, [...names]);
}

// Load (once, cached) a Kenney GLB, clone it for this instance, recolor and place it
// in `group`. `group` already exists and sits at its final position/rotation when this
// is called, so a slow or failed load just leaves that group's harmless empty fallback.
export function spawnModel(name, group, { scale = 1, rotationY = 0, colorMap, castShadow = false } = {}) {
  loadTemplate(name).then((template) => {
    logMaterialsOnce(name, template);
    const inst = template.clone(true);
    recolor(inst, colorMap);
    if (typeof scale === "number") inst.scale.setScalar(scale); else inst.scale.copy(scale);
    inst.rotation.y = rotationY;
    if (castShadow) inst.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    group.add(inst);
  }).catch((err) => console.warn(`[props] "${name}" did not load, leaving the empty placeholder:`, err));
}

// Random shade between two hex colors, for per-instance needle/grass variation.
export function lerpColor(a, b, t) {
  return new THREE.Color(a).lerp(new THREE.Color(b), t);
}

// Deterministic PRNG so the dressing scatter is identical every load.
export function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- Hand-built props: nothing in the kit covers these ----------

const lambert = (color) => new THREE.MeshLambertMaterial({ color, flatShading: true });
// Windows, the lantern and the porch lamp: self-lit glow, so ACES tone mapping
// should not dull them the way it does the lit walls around them.
const basic = (color) => new THREE.MeshBasicMaterial({ color, toneMapped: false });

export function buildCabin() {
  const g = new THREE.Group();
  const barkMat = lambert("#3b2a18");
  const width = 4.0, depth = 3.0, wallH = 2.2, courses = 6, logR = 0.16;
  const spacing = wallH / courses;
  for (let i = 0; i < courses; i++) {
    const y = spacing * 0.5 + i * spacing;
    const fb = new THREE.Mesh(new THREE.CylinderGeometry(logR, logR, width + 0.3, 7), barkMat);
    fb.rotation.z = Math.PI / 2; fb.castShadow = true;
    const front = fb.clone(); front.position.set(0, y, depth / 2);
    const back = fb.clone(); back.position.set(0, y, -depth / 2);
    const lr = new THREE.Mesh(new THREE.CylinderGeometry(logR, logR, depth + 0.3, 7), barkMat);
    lr.rotation.x = Math.PI / 2; lr.castShadow = true;
    const left = lr.clone(); left.position.set(-width / 2, y, 0);
    const right = lr.clone(); right.position.set(width / 2, y, 0);
    g.add(front, back, left, right);
  }

  // Gabled roof: two sloped slabs meeting at a ridge, slight overhang past the walls.
  const roofRun = width / 2 + 0.3, peak = 1.0, roofLen = depth + 0.6;
  const slope = Math.sqrt(roofRun * roofRun + peak * peak);
  const angle = Math.atan2(peak, roofRun);
  const roofMat = lambert("#2e2116");
  const slabGeo = new THREE.BoxGeometry(slope, 0.12, roofLen);
  const slabR = new THREE.Mesh(slabGeo, roofMat);
  slabR.position.set(roofRun / 2, wallH + peak / 2, 0);
  slabR.rotation.z = -angle; slabR.castShadow = true;
  const slabL = new THREE.Mesh(slabGeo, roofMat);
  slabL.position.set(-roofRun / 2, wallH + peak / 2, 0);
  slabL.rotation.z = angle; slabL.castShadow = true;
  const ridge = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, roofLen, 6), roofMat);
  ridge.rotation.x = Math.PI / 2; ridge.position.set(0, wallH + peak, 0);
  g.add(slabR, slabL, ridge);

  // Gable ends (Bryan 09/27: the title camera looked straight into the open triangle
  // under the roof). A dark backing triangle closes it; short log courses over it
  // carry the wall pattern up to the ridge.
  const gShape = new THREE.Shape();
  gShape.moveTo(-width / 2 - 0.05, 0); gShape.lineTo(width / 2 + 0.05, 0); gShape.lineTo(0, peak); gShape.closePath();
  const gableGeo = new THREE.ExtrudeGeometry(gShape, { depth: 0.1, bevelEnabled: false });
  [depth / 2, -depth / 2].forEach((z) => {
    const plate = new THREE.Mesh(gableGeo, barkMat);
    plate.position.set(0, wallH, z - 0.05); plate.castShadow = true;
    g.add(plate);
    for (let k = 0; ; k++) {
      const y = spacing * 0.5 + k * spacing;
      const len = width * (1 - (y + logR) / peak);
      if (len < 0.5) break;
      const gl = new THREE.Mesh(new THREE.CylinderGeometry(logR, logR, len, 7), barkMat);
      gl.rotation.z = Math.PI / 2; gl.castShadow = true;
      gl.position.set(0, wallH + y, z);
      g.add(gl);
    }
  });

  // Stone chimney, punching through the back roof slope.
  const chimney = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.7, 0.5), lambert("#6f6a62"));
  chimney.position.set(1.1, wallH + peak * 0.55, -0.9);
  chimney.castShadow = true;
  g.add(chimney);

  // Porch: deck, two steps, two posts and a header.
  const deckMat = lambert("#5b3a1e");
  const deck = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.15, 0.9), deckMat);
  deck.position.set(0, 0.075, depth / 2 + 0.45); deck.castShadow = true;
  const step1 = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.08, 0.32), deckMat);
  step1.position.set(0, 0.04, depth / 2 + 0.9 + 0.16);
  const step2 = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.08, 0.32), deckMat);
  step2.position.set(0, -0.02, depth / 2 + 0.9 + 0.32 + 0.16);
  const postMat = lambert("#4a2e14");
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 2.3, 6), postMat);
  post.castShadow = true;
  const postL = post.clone(); postL.position.set(-0.95, 1.15, depth / 2 + 0.85);
  const postR = post.clone(); postR.position.set(0.95, 1.15, depth / 2 + 0.85);
  const header = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.12, 0.12), postMat);
  header.position.set(0, 2.3, depth / 2 + 0.85);
  // Porch roof: a shallow shed roof from the wall down to the header.
  const porchRoof = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.08, 1.15), roofMat);
  porchRoof.position.set(0, 2.42, depth / 2 + 0.5);
  porchRoof.rotation.x = 0.14; porchRoof.castShadow = true;
  g.add(deck, step1, step2, postL, postR, header, porchRoof);

  // Door, two warm windows, and a lantern by the door.
  const door = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.8, 0.08), lambert("#4a2e14"));
  door.position.set(0, 0.9, depth / 2 + 0.2);
  const winMat = basic("#ffd580");
  const winGeo = new THREE.PlaneGeometry(0.7, 0.6);
  const winA = new THREE.Mesh(winGeo, winMat); winA.position.set(-1.3, 1.35, depth / 2 + 0.17);
  const winB = new THREE.Mesh(winGeo, winMat); winB.position.set(1.3, 1.35, depth / 2 + 0.17);
  const lanternArm = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.2, 5), postMat);
  lanternArm.rotation.z = Math.PI / 2; lanternArm.position.set(0.6, 1.5, depth / 2 + 0.25);
  const lantern = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 8), basic("#ffd580"));
  lantern.position.set(0.68, 1.4, depth / 2 + 0.25);
  g.add(door, winA, winB, lanternArm, lantern);

  // A small firewood stack by the porch.
  const logMat1 = lambert("#7a4c22"), logMat2 = lambert("#5b3a1e");
  for (let i = 0; i < 4; i++) {
    const l = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.55, 6), i % 2 ? logMat2 : logMat1);
    l.rotation.z = Math.PI / 2;
    l.position.set(1.55 + (i % 2) * 0.14, 0.1 + Math.floor(i / 2) * 0.16, depth / 2 + 0.55);
    l.castShadow = true;
    g.add(l);
  }
  return g;
}

export function buildCooler() {
  const g = new THREE.Group();
  const blue = lambert("#3a7bd5"), white = lambert("#e8eef5"), handleMat = lambert("#2a2a2a");
  const base = new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.4, 0.56), blue);
  base.position.y = 0.2; base.castShadow = true;
  const bevel = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.06, 0.52), blue);
  bevel.position.y = 0.43;
  const lid = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.12, 0.62), white);
  lid.position.y = 0.52; lid.castShadow = true;
  const handleGeo = new THREE.TorusGeometry(0.08, 0.015, 6, 10, Math.PI);
  const handleL = new THREE.Mesh(handleGeo, handleMat); handleL.rotation.y = Math.PI / 2; handleL.position.set(-0.44, 0.28, 0);
  const handleR = handleL.clone(); handleR.position.x = 0.44; handleR.rotation.y = -Math.PI / 2;
  g.add(base, bevel, lid, handleL, handleR);
  return g;
}

export function buildGasCan() {
  const g = new THREE.Group();
  const red = lambert("#d62828"), redDark = lambert("#8a1010"), yellow = lambert("#ffd23c");
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.6, 0.24), red);
  body.position.y = 0.3; body.castShadow = true;
  const capBand = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.05, 0.26), redDark);
  capBand.position.y = 0.55;
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.018, 6, 12), redDark);
  handle.rotation.x = Math.PI / 2; handle.position.set(0, 0.63, 0);
  const spout = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 0.22, 7), redDark);
  spout.rotation.z = 0.6; spout.position.set(0.18, 0.68, 0.02);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.05, 8), yellow);
  cap.rotation.z = 0.6; cap.position.set(0.28, 0.75, 0.02);
  g.add(body, capBand, handle, spout, cap);
  return g;
}

export function buildCampChair() {
  const g = new THREE.Group();
  const legMat = lambert("#262626");
  const legSpan = 0.35, legTopY = 0.85;
  const legGeo = (len) => new THREE.CylinderGeometry(0.025, 0.025, len, 5);
  [-1, 1].forEach((side) => {
    const dz1 = legSpan - -legSpan, dy1 = legTopY - 0;
    const len = Math.sqrt(dz1 * dz1 + dy1 * dy1);
    const legA = new THREE.Mesh(legGeo(len), legMat);
    legA.position.set(side * 0.35, legTopY / 2, 0);
    legA.rotation.x = Math.atan2(dz1, dy1);
    const legB = new THREE.Mesh(legGeo(len), legMat);
    legB.position.set(side * 0.35, legTopY / 2, 0);
    legB.rotation.x = -Math.atan2(dz1, dy1);
    g.add(legA, legB);
  });
  const stabilizer = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, legSpan * 2 - 0.1, 5), legMat);
  stabilizer.rotation.z = Math.PI / 2; stabilizer.position.set(0, 0.42, 0);
  g.add(stabilizer);

  const fabric = lambert("#1f5a3a");
  // Depth trimmed 0.62 -> 0.52 (Bryan, 09/26: seated legs clipped the front X-frame
  // and the seat edge): a shorter seat brings its front edge in under where a
  // seated camper's knee actually lands (see SEATED_BACK_OFFSET/SHIN_LEAN in
  // world.js), instead of the knee hovering deep over the cushion.
  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.74, 0.06, 0.52), fabric);
  seat.position.y = 0.45; seat.castShadow = true;
  const back = new THREE.Mesh(new THREE.BoxGeometry(0.74, 0.75, 0.06), fabric);
  back.position.set(0, 0.85, -0.3); back.castShadow = true;
  g.add(seat, back);

  const armMat = lambert("#3a3a3a");
  const armGeo = new THREE.BoxGeometry(0.06, 0.05, 0.5);
  const armL = new THREE.Mesh(armGeo, armMat); armL.position.set(-0.4, 0.62, 0.05);
  const armR = new THREE.Mesh(armGeo, armMat); armR.position.set(0.4, 0.62, 0.05);
  const cupHolder = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.05, 0.04, 8), armMat);
  cupHolder.position.set(0.4, 0.665, 0.2);
  g.add(armL, armR, cupHolder);
  return g;
}

// Don M's gift (Bryan, 09/26): a Heineken-style mini keg. Green body, silver rim and
// tap, a simple flat red star badge (no real logo artwork) — chunky and flat-shaded
// like everything else here, just enough of a read to say "keg" at a glance.
function starShape(outer, inner, points) {
  const shape = new THREE.Shape();
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = (i / (points * 2)) * Math.PI * 2 - Math.PI / 2;
    const x = Math.cos(a) * r, y = Math.sin(a) * r;
    if (i === 0) shape.moveTo(x, y); else shape.lineTo(x, y);
  }
  shape.closePath();
  return shape;
}
export function buildMiniKeg() {
  const g = new THREE.Group();
  const green = lambert("#0a5c36"), silver = lambert("#c7cdd2"), red = lambert("#c1121f");
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.155, 0.34, 12), green);
  body.position.y = 0.19; body.castShadow = true;
  const topRim = new THREE.Mesh(new THREE.CylinderGeometry(0.165, 0.165, 0.03, 12), silver);
  topRim.position.y = 0.365;
  const bottomRim = new THREE.Mesh(new THREE.CylinderGeometry(0.165, 0.165, 0.03, 12), silver);
  bottomRim.position.y = 0.02;
  const tap = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.028, 0.11, 6), silver);
  tap.rotation.z = Math.PI / 2; tap.position.set(0.19, 0.25, 0);
  const spigot = new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 6), silver);
  spigot.position.set(0.25, 0.25, 0);
  const star = new THREE.Mesh(new THREE.ShapeGeometry(starShape(0.075, 0.03, 5)), red);
  star.position.set(0, 0.2, 0.161);
  g.add(body, topRim, bottomRim, tap, spigot, star);
  return g;
}

export function buildPokerStick() {
  const mat = lambert("#6b4a2b");
  const tipMat = lambert("#1c1712");
  const root = new THREE.Group();
  const len1 = 0.55, len2 = 0.5, len3 = 0.35;
  const seg1 = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.04, len1, 6), mat);
  seg1.position.y = len1 / 2;
  root.add(seg1);
  const joint2 = new THREE.Group();
  joint2.position.y = len1 / 2; joint2.rotation.z = 0.2;
  seg1.add(joint2);
  const seg2 = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.035, len2, 6), mat);
  seg2.position.y = len2 / 2;
  joint2.add(seg2);
  const joint3 = new THREE.Group();
  joint3.position.y = len2 / 2; joint3.rotation.z = -0.15;
  seg2.add(joint3);
  const seg3 = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.02, len3, 6), mat);
  seg3.position.y = len3 / 2;
  joint3.add(seg3);
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.028, 0.09, 6), tipMat);   // charred end
  tip.position.y = len3 / 2 + 0.045;
  seg3.add(tip);
  return root;
}

// ---------- Signature props (backlog item, campers.js/docs/CAMPERS.md) ----------
// Each camper's hand prop for the fire circle. Built standing/lying at a
// neutral orientation with its ground-contact point at local y=0, so
// game.js's placement code (buildCrew's propRigs) only has to set
// position/rotation on the returned group, never reach inside it. Every
// group is chunky low-poly, flat-shaded (lambert()/basic() from above), and
// merges same-material parts into one BufferGeometry so a prop with several
// visual pieces still costs one draw call per color, not one per box.

// Chris Occ: acoustic guitar, built upright (neck up +Y) so leaning it against
// a chair back is just a rotation.x tilt applied by the caller.
export function buildGuitar() {
  const g = new THREE.Group();
  const wood = lambert("#8a5a2b"), dark = lambert("#2a1c12");
  // Figure-8 body: two flattened, overlapping cylinders (upper bout smaller,
  // lower bout bigger), merged into one wood-colored mesh.
  const upperBout = new THREE.CylinderGeometry(0.13, 0.13, 0.06, 10);
  upperBout.rotateX(Math.PI / 2); upperBout.translate(0, 0.30, 0);
  const lowerBout = new THREE.CylinderGeometry(0.175, 0.175, 0.07, 10);
  lowerBout.rotateX(Math.PI / 2); lowerBout.translate(0, 0.12, 0);
  const neckGeo = new THREE.BoxGeometry(0.045, 0.42, 0.03);
  neckGeo.translate(0, 0.62, 0);
  const headstockGeo = new THREE.BoxGeometry(0.09, 0.09, 0.025);
  headstockGeo.translate(0, 0.85, 0);
  const body = new THREE.Mesh(mergeGeometries([upperBout, lowerBout, neckGeo, headstockGeo]), wood);
  body.castShadow = true;
  // Dark accents: soundhole ring, fretboard strip, two tuning-peg blobs.
  const soundhole = new THREE.CylinderGeometry(0.055, 0.055, 0.02, 10);
  soundhole.rotateX(Math.PI / 2); soundhole.translate(0, 0.22, 0.05);
  const fretboard = new THREE.BoxGeometry(0.05, 0.4, 0.012);
  fretboard.translate(0, 0.62, 0.022);
  const pegL = new THREE.BoxGeometry(0.03, 0.03, 0.05); pegL.translate(-0.06, 0.85, 0);
  const pegR = new THREE.BoxGeometry(0.03, 0.03, 0.05); pegR.translate(0.06, 0.85, 0);
  const accents = new THREE.Mesh(mergeGeometries([soundhole, fretboard, pegL, pegR]), dark);
  g.add(body, accents);
  g.position.y = 0.055;   // lifts the lower bout's (flattened, rotated) bottom edge to the ground
  return g;
}

// Razoo: trumpet, laid on its side on the ground (bell to the right, +X).
// Every part is the same brass tone, so the whole thing is one draw call.
export function buildTrumpet() {
  const brass = lambert("#c9a227");
  // radiusTop (at local +Y, the end nearer the leadpipe/valves after the
  // rotate below) must be the NARROW one and radiusBottom (local -Y, the
  // outermost end) the WIDE flare -- swapped before (0.075 top/0.022 bottom),
  // which put the bell's flare right at the leadpipe joint and pinched the
  // horn narrow at its outer tip, i.e. the bell flaring backwards, toward the
  // mouthpiece instead of away from it.
  const bell = new THREE.CylinderGeometry(0.022, 0.075, 0.22, 10);
  bell.rotateZ(Math.PI / 2); bell.translate(0.30, 0, 0);
  const leadpipe = new THREE.CylinderGeometry(0.022, 0.022, 0.3, 8);
  leadpipe.rotateZ(Math.PI / 2); leadpipe.translate(0.03, 0, 0);
  const mouthpipe = new THREE.CylinderGeometry(0.012, 0.017, 0.1, 6);
  mouthpipe.rotateZ(Math.PI / 2); mouthpipe.translate(-0.18, 0, 0);
  const valve = (x) => { const v = new THREE.CylinderGeometry(0.026, 0.026, 0.11, 7); v.translate(x, 0.07, 0); return v; };
  const loop = (x) => { const l = new THREE.TorusGeometry(0.05, 0.014, 5, 10, Math.PI); l.rotateY(Math.PI / 2); l.translate(x, 0.14, 0); return l; };
  const parts = [bell, leadpipe, mouthpipe, valve(-0.09), valve(-0.02), valve(0.05), loop(-0.09), loop(-0.02), loop(0.05)];
  const horn = new THREE.Mesh(mergeGeometries(parts), brass);
  horn.castShadow = true;
  const g = new THREE.Group();
  g.add(horn);
  g.position.y = 0.075;   // resting on the widest tube radius
  return g;
}

// Bryan J: lowball bourbon glass, big ice cube, amber pour ("his line mentions
// big ice and bourbon"). Three single-shape meshes (no merge needed).
export function buildBourbonGlass() {
  const g = new THREE.Group();
  // First pass had the amber pour as a thin layer fully enclosed by an
  // opaque "glass" cylinder, so it never actually showed (a solid outer
  // wall hides whatever is inside it). Rebuilt so the pour IS the visible
  // body -- a real rocks-glass measure, not a sliver -- with the glass
  // itself reduced to a thin rim top and foot bottom that read without
  // hiding it, and the ice cube offset to one side instead of dead center.
  const bourbon = new THREE.Mesh(new THREE.CylinderGeometry(0.072, 0.066, 0.11, 12), lambert("#b5651d"));
  bourbon.position.y = 0.055; bourbon.castShadow = true;
  const rim = new THREE.TorusGeometry(0.074, 0.009, 6, 12);
  rim.rotateX(Math.PI / 2); rim.translate(0, 0.11, 0);
  const foot = new THREE.CylinderGeometry(0.078, 0.078, 0.012, 12);
  foot.translate(0, 0.006, 0);
  const glassMesh = new THREE.Mesh(mergeGeometries([rim, foot]), lambert("#dbe7ef"));
  const ice = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.05), lambert("#eaf4fa"));
  ice.position.set(0.03, 0.1, -0.015); ice.rotation.y = 0.5;
  g.add(bourbon, glassMesh, ice);
  return g;
}

// Spitty: Bologna Yogurt cup with a spoon standing in it.
export function buildYogurtCup() {
  const g = new THREE.Group();
  const cupMat = lambert("#f4c9d6");
  const cup = new THREE.CylinderGeometry(0.075, 0.06, 0.1, 10);
  cup.translate(0, 0.05, 0);
  const lid = new THREE.CylinderGeometry(0.078, 0.078, 0.015, 10);
  lid.translate(0, 0.1, 0);
  const cupMesh = new THREE.Mesh(mergeGeometries([cup, lid]), cupMat);
  cupMesh.castShadow = true;
  const spoonMat = lambert("#c7cdd2");
  const handle = new THREE.CylinderGeometry(0.008, 0.008, 0.22, 6);
  handle.rotateX(-0.5); handle.translate(0, 0.19, -0.05);
  const bowl = new THREE.SphereGeometry(0.03, 8, 6);
  bowl.scale(1, 0.6, 1.4); bowl.translate(0, 0.285, -0.14);
  const spoon = new THREE.Mesh(mergeGeometries([handle, bowl]), spoonMat);
  g.add(cupMesh, spoon);
  return g;
}

// Perry S: a bag of "Great Value"-style cheese puffs. Bryan's ask: no logo,
// just color blocks (a blue main bag, a crimped yellow top fold) so it reads
// as a generic chip bag, not the real brand.
export function buildCheesePuffsBag() {
  const g = new THREE.Group();
  const bag = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.3, 0.075), lambert("#2f6fb0"));
  bag.position.y = 0.15; bag.castShadow = true;
  const fold = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.07, 0.05), lambert("#f2b705"));
  fold.position.y = 0.315; fold.rotation.z = 0.12;
  g.add(bag, fold);
  return g;
}

// Tom S: camp coffee mug (his emote is "Coffee Mug Sip"). Enamelware red,
// body and handle merged into a single draw call.
export function buildCoffeeMug() {
  const mat = lambert("#a13d3d");
  const body = new THREE.CylinderGeometry(0.055, 0.048, 0.11, 10);
  body.translate(0, 0.055, 0);
  const handle = new THREE.TorusGeometry(0.045, 0.012, 6, 10, Math.PI * 1.3);
  handle.rotateZ(Math.PI / 2); handle.rotateY(Math.PI / 2); handle.translate(0.065, 0.06, 0);
  const mug = new THREE.Mesh(mergeGeometries([body, handle]), mat);
  mug.castShadow = true;
  const g = new THREE.Group();
  g.add(mug);
  return g;
}

// Brian R: a pair of water skis, bright and chunky, leaning against the back
// of his chair ("Remember when I skied the pond?"). Built flat (lying along
// +Y, tips up) so leaning is a rotation.x tilt, same convention as the guitar.
export function buildWaterSkis() {
  const g = new THREE.Group();
  // A lighter orange (first pass, #ff6b35) blew out to near-white this close
  // to the fire and key light; this deeper red-orange keeps its color at the
  // same exposure while still reading as bright and chunky.
  const skiColor = lambert("#d9481c"), bindingColor = lambert("#1c1c1c");
  function ski(x) {
    const board = new THREE.BoxGeometry(0.11, 0.9, 0.02);
    board.translate(x, 0.45, 0);
    const tip = new THREE.ConeGeometry(0.078, 0.16, 4);
    tip.scale(1, 1, 0.35); tip.rotateX(Math.PI); tip.rotateY(Math.PI / 4);
    tip.translate(x, 0.97, 0);
    return [board, tip];
  }
  const boards = new THREE.Mesh(mergeGeometries([...ski(-0.09), ...ski(0.09)]), skiColor);
  boards.castShadow = true;
  const binding = (x) => { const b = new THREE.BoxGeometry(0.1, 0.05, 0.12); b.translate(x, 0.35, 0.01); return b; };
  const bindings = new THREE.Mesh(mergeGeometries([binding(-0.09), binding(0.09)]), bindingColor);
  g.add(boards, bindings);
  return g;
}

// Scott K: a pilot's flight helmet ("I know how to ride Black Hawks better
// than anyone"), olive drab shell with a dark tinted visor. Sits on the
// ground beside his chair; also usable as a head-worn prop (game.js clones
// it onto p.head for the Black Hawk lobby emote).
export function buildFlightHelmet() {
  const g = new THREE.Group();
  const shell = new THREE.Mesh(new THREE.SphereGeometry(0.115, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.62), lambert("#5c5a32"));
  shell.position.y = 0.042; shell.castShadow = true;   // dome cut past the equator dips below its own center; this lifts its rim to the ground
  const visor = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.4), lambert("#1a2226"));
  visor.position.set(0, 0.105, 0.04); visor.rotation.x = -0.25;
  g.add(shell, visor);
  return g;
}

// Johnny D: a pair of cornhole boards facing each other with a few bean bags
// scattered between/beside them ("Going live on cornhole!"). Too big for the
// fire ring, so this builds BOTH boards as one fixed-layout group meant to
// be placed once in world space (not per-chair like the props above): world.js
// adds it directly at LAYOUT.cornhole. `gap` is the distance between the two
// boards' front (playing) edges, laid out along local +Z with each board
// facing the other (rotated 180 degrees apart).
export function buildCornholeSet(gap = 3.6) {
  const g = new THREE.Group();
  const wood = lambert("#c8923f"), dark = lambert("#241c14"), bagColor = lambert("#1d3557");
  // One board, built canonically with its raised/hole end at local +Z,
  // resting on y=0. `placedBoard` then translates it to one side of the gap
  // and, for the far board, rotates it 180 degrees first so the two hole
  // ends face each other across the gap.
  //
  // A real board's folding legs prop up the SAME end as the hole (~12in
  // rise); the front/thrower edge has no legs and just sits low, a few
  // inches off the ground on its own frame (~3-4in). The previous version
  // had that backwards: legs at local -Z (the low, hole-less front edge,
  // where they towered a full 0.4 units above a board surface only ~0.1
  // units high there) and nothing propping up the actual hole end -- "the
  // legs are on the wrong sides" (Bryan). Fixed: legs moved to local +Z,
  // under the hole, sized to meet the (now correctly tilted) surface there;
  // the low end is left leg-less so it just meets the ground near the 3-4in
  // spec. rotateX bumped from -0.19 to -0.23 so the tilt's actual rise (~12in
  // high end, ~4in low end over the board's 0.9-unit length, at this scene's
  // ~1-unit-per-meter scale) matches a real board's slope instead of an
  // eyeballed lean.
  function boardGeo() {
    const ramp = new THREE.BoxGeometry(0.6, 0.04, 0.9);
    ramp.rotateX(-0.23); ramp.translate(0, 0.2, 0.18);
    const legGeo = new THREE.CylinderGeometry(0.018, 0.018, 0.26, 6);
    const legL = legGeo.clone(); legL.translate(-0.24, 0.13, 0.32);
    const legR = legGeo.clone(); legR.translate(0.24, 0.13, 0.32);
    const hole = new THREE.CylinderGeometry(0.07, 0.07, 0.01, 10);
    hole.rotateX(-0.23); hole.translate(0, 0.32, 0.42);
    return { wood: [ramp, legL, legR], hole };
  }
  function placedBoard(z, flip) {
    const b = boardGeo();
    const all = [...b.wood, b.hole];
    all.forEach((geo) => { if (flip) geo.rotateY(Math.PI); geo.translate(0, 0, z); });
    return b;
  }
  const b1 = placedBoard(-gap / 2, false);
  const b2 = placedBoard(gap / 2, true);
  const woodMesh = new THREE.Mesh(mergeGeometries([...b1.wood, ...b2.wood]), wood);
  woodMesh.castShadow = true;
  const holeMesh = new THREE.Mesh(mergeGeometries([b1.hole, b2.hole]), dark);
  const bagGeo = (x, z, ry) => { const bg = new THREE.BoxGeometry(0.16, 0.05, 0.16); bg.rotateY(ry); bg.translate(x, 0.025, z); return bg; };
  const bags = new THREE.Mesh(mergeGeometries([
    bagGeo(-0.4, -gap / 2 + 0.55, 0.3), bagGeo(-0.25, -gap / 2 + 0.7, -0.2), bagGeo(0.35, -gap / 2 + 0.6, 0.1),
    bagGeo(0.4, gap / 2 - 0.55, 0.4), bagGeo(-0.3, gap / 2 - 0.65, -0.3),
  ]), bagColor);
  g.add(woodMesh, holeMesh, bags);
  return g;
}

// Tom S: Yeti-style tumbler for his "Yeti Cheers" lobby emote (replaces the old
// Coffee Mug Sip, which read like a bloody arm injury -- Bryan, 09/27). Tall
// insulated cup, seafoam body, steel rim, a dark lid with a small sipper.
// Generic, no logo. Held-prop only (game.js's HELD_PROP_BUILDERS); his ground
// chairside prop stays the coffee mug (buildCoffeeMug, above).
export function buildYetiTumbler() {
  const g = new THREE.Group();
  const body = new THREE.CylinderGeometry(0.05, 0.044, 0.2, 12);
  body.translate(0, 0.1, 0);
  const cup = new THREE.Mesh(body, lambert("#4f9d8a"));
  cup.castShadow = true;
  const rimGeo = new THREE.TorusGeometry(0.05, 0.007, 6, 12);
  rimGeo.rotateX(Math.PI / 2); rimGeo.translate(0, 0.2, 0);
  const rim = new THREE.Mesh(rimGeo, lambert("#c7cdd2"));
  const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.053, 0.053, 0.02, 12), lambert("#20242a"));
  lid.position.y = 0.215;
  const sip = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.022, 8), lambert("#20242a"));
  sip.position.set(0, 0.236, 0.028);
  g.add(cup, rim, lid, sip);
  return g;
}

// Spitty: a standalone spoon for his other hand (the yogurt cup, built above,
// already has its own small merged spoon standing in it -- this is a second,
// separate one so the lobby emote can move it from the cup to his mouth
// instead of showing two spoons at once; Bryan, 09/27). Built standing
// straight up (handle along +Y, bowl at the top); game.js's HELD_PROP_BUILDERS-style
// rig on armR's elbow supplies the tilt.
export function buildSpoon() {
  const mat = lambert("#c7cdd2");
  const handle = new THREE.CylinderGeometry(0.009, 0.009, 0.26, 6);
  handle.translate(0, 0.13, 0);
  const bowl = new THREE.SphereGeometry(0.032, 8, 6);
  bowl.scale(1, 0.55, 1.35);
  bowl.translate(0, 0.27, -0.01);
  const g = new THREE.Group();
  g.add(new THREE.Mesh(mergeGeometries([handle, bowl]), mat));
  return g;
}
