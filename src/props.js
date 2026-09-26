// Art pass helpers: a shared GLTF loader/cache for the Kenney nature-kit pieces, and
// the hand-built primitives for props no kit covers (cabin, camper, cooler, gas can,
// camp chair, poker stick). Recolors every loaded material to flat-shaded Lambert so
// the kit's pastel defaults match the firelit night look.
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

const MODEL_DIR = "assets/models/";
const loader = new GLTFLoader();
const templates = new Map();   // name -> loaded template Object3D, reused for every clone
const pending = new Map();     // name -> in-flight load promise

function loadTemplate(name) {
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
  g.add(deck, step1, step2, postL, postR, header);

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

export function buildCamperTrailer() {
  const g = new THREE.Group();
  const cream = lambert("#e8dfc8"), stripe = lambert("#2f6b3a"), canvas = lambert("#b8a27a");
  const dark = lambert("#141810"), metal = lambert("#3a3a3a"), capMat = lambert("#4b514d");
  const bodyY = 0.95, bodyH = 1.0;   // body raised so the wheels clear it and actually show

  const body = new THREE.Mesh(new THREE.BoxGeometry(3.4, bodyH, 2.0), cream);
  body.position.y = bodyY; body.castShadow = true;
  // Stripe wraps all four faces so it reads from any angle, not just the sides.
  const stripeSide = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.22, 2.04), stripe);
  const stripeL = stripeSide.clone(); stripeL.position.set(-1.72, bodyY - 0.07, 0);
  const stripeR = stripeSide.clone(); stripeR.position.set(1.72, bodyY - 0.07, 0);
  const stripeEnd = new THREE.Mesh(new THREE.BoxGeometry(3.44, 0.22, 0.06), stripe);
  const stripeF = stripeEnd.clone(); stripeF.position.set(0, bodyY - 0.07, 1.02);
  const stripeB = stripeEnd.clone(); stripeB.position.set(0, bodyY - 0.07, -1.02);
  // Canvas pop-up top: wider than the body so it clearly reads as a lifted tent
  // section, not another slab of the same box.
  const topY = bodyY + bodyH / 2 + 0.4;
  const top = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.6, 2.1), canvas);
  top.position.y = topY; top.castShadow = true;
  const capTop = new THREE.Mesh(new THREE.BoxGeometry(3.8, 0.1, 2.3), capMat);
  capTop.position.y = topY + 0.35;
  const capTrim = new THREE.Mesh(new THREE.BoxGeometry(3.8, 0.06, 0.1), capMat);
  const trimF = capTrim.clone(); trimF.position.set(0, topY + 0.28, 1.1);
  const trimB = capTrim.clone(); trimB.position.set(0, topY + 0.28, -1.1);
  const screenSideGeo = new THREE.PlaneGeometry(0.8, 0.35);
  const screenL = new THREE.Mesh(screenSideGeo, dark); screenL.rotation.y = Math.PI / 2; screenL.position.set(-1.81, topY, 0);
  const screenR = new THREE.Mesh(screenSideGeo, dark); screenR.rotation.y = -Math.PI / 2; screenR.position.set(1.81, topY, 0);
  const screenFrontGeo = new THREE.PlaneGeometry(1.8, 0.32);
  const screenFront = new THREE.Mesh(screenFrontGeo, dark); screenFront.position.set(0, topY, 1.06);
  const screenBack = new THREE.Mesh(screenFrontGeo, dark); screenBack.rotation.y = Math.PI; screenBack.position.set(0, topY, -1.06);
  g.add(body, stripeL, stripeR, stripeF, stripeB, top, capTop, trimF, trimB, screenL, screenR, screenFront, screenBack);

  // Wheels: bottom on the ground, clearly showing below the raised body. Pulled up to
  // the front face (not buried at the body's mid-depth) and lightened so they read
  // against dark grass at night; a hubcap disc adds a bit of contrast up close.
  const wheelMat = lambert("#4a4a4a"), hubMat = lambert("#6e6e6e");
  const wheelZ = 1.0;
  const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.22, 12), wheelMat);
  wheel.rotation.x = Math.PI / 2; wheel.castShadow = true;
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.02, 10), hubMat);
  hub.rotation.x = Math.PI / 2;
  const wheelL = wheel.clone(); wheelL.position.set(-1.55, 0.36, wheelZ);
  const hubL = hub.clone(); hubL.position.set(-1.55, 0.36, wheelZ + 0.12);
  const wheelR = wheel.clone(); wheelR.position.set(1.55, 0.36, wheelZ);
  const hubR = hub.clone(); hubR.position.set(1.55, 0.36, wheelZ + 0.12);
  g.add(wheelL, hubL, wheelR, hubR);

  const tongue = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.08, 1.0), metal);
  tongue.position.set(0, bodyY - 0.35, 1.5);
  const hitch = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 8), metal);
  hitch.position.set(0, bodyY - 0.35, 2.0);
  const step = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.12, 0.35), metal);
  step.position.set(0, bodyY - bodyH / 2 - 0.1, 1.15);
  g.add(tongue, hitch, step);

  // Porch light by the door step so the trailer reads as lived-in at night.
  const lampArm = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.22, 5), metal);
  lampArm.rotation.x = Math.PI / 2; lampArm.position.set(1.1, bodyY + 0.25, 1.05);
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 8), basic("#ffd580"));
  lamp.position.set(1.1, bodyY + 0.25, 1.18);
  g.add(lampArm, lamp);
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
