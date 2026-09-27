// Scene construction. Kenney nature-kit GLBs for the environment; hand-built
// primitives for the cabin, camper, cooler, gas can, chairs and poker (nothing in
// the kit covers those). Art direction: docs/mockups/concept-A-bear-right.png.
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { LAYOUT, FIRE, REFINED_CAMPERS } from "./config.js?v=135";
import { spawnModel, lerpColor, mulberry32, buildCabin, buildCooler, buildGasCan, buildCampChair, buildPokerStick } from "./props.js?v=135";
import { buildTravelTrailer } from "./trailer.js?v=135";
import { buildFire } from "./fire.js?v=135";

export function buildWorld(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  // ACES rolls off the fire's highlights instead of clipping them to white (the
  // stone ring and fire-facing flannel were blowing out). Exposure and the fire/key
  // light intensities below are rebalanced together so the night reads the same.
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#0b1020");
  scene.fog = new THREE.Fog("#0b1020", 16, 30);   // pushed back 09/25 so the surroundings read

  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
  camera.position.set(0, 5.5, 15);
  camera.lookAt(0, 1.2, 0);

  // 0.48 -> 0.56 (09/26, Bryan: "still kind of dark outside the fire ring"): a
  // step, not a jump. Both are ambient/uniform so this also lifts the inside of
  // the ring a hair, but the fire there is an order of magnitude brighter, so
  // it is the outside (cabin, trailer, cooler, wood pile, tree line) that
  // actually reads the difference. Paired with fireLight's decay drop below.
  const ambient = new THREE.HemisphereLight("#3a4a7a", "#0a1408", 0.56);
  scene.add(ambient);
  const moon = new THREE.DirectionalLight("#8aa0d8", 0.56);
  moon.position.set(-8, 14, -6);
  scene.add(moon);

  // Lobby key light: only on while choosing a camper, so his front is lit
  const keyLight = new THREE.PointLight("#ffe2b8", 0, 0, 2);
  keyLight.position.set(2.6, 3.2, 7.4);
  scene.add(keyLight);

  // decay 1.4 -> 1.2 (09/26, same "dark outside the ring" note): reaches the
  // cabin, trailer and wood pile a bit further past where 1.4 tapered off.
  // game.js rebalances its intensity scale (0.85 -> 0.81, same radius-1.3
  // cross-over method as the 2 -> 1.4 change) so the ring itself reads the same.
  const fireLight = new THREE.PointLight("#ff9a3c", 80, 30, 1.2);
  fireLight.position.set(0, 1.2, 0);
  fireLight.castShadow = true;
  fireLight.shadow.mapSize.set(512, 512);   // point-light shadows render six faces a frame; keep it cheap
  scene.add(fireLight);

  // Ground
  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(30, 48),
    new THREE.MeshLambertMaterial({ color: "#2f4a1f" })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);
  const dirt = new THREE.Mesh(new THREE.CircleGeometry(5.2, 40), new THREE.MeshLambertMaterial({ color: "#5c4a33" }));
  dirt.rotation.x = -Math.PI / 2;
  dirt.position.y = 0.01;
  dirt.receiveShadow = true;
  scene.add(dirt);

  // Fire pit ring: campfire_stones scaled so its outer edge lands near radius 1.25,
  // same footprint the old torus ring occupied (play circle and flames untouched).
  const ring = new THREE.Group();
  ring.position.y = 0.12;
  scene.add(ring);
  spawnModel("campfire_stones", ring, { scale: 1.25 / 0.27, colorMap: { stone: "#4f4b46" } });

  // Fire: layered flame sprites, a spark pool, a glowing coal bed and the charred
  // pit logs, all built and driven from fire.js. `embers` is kept as the coal bed's
  // name for anyone still reaching for it; game.js drives the whole bundle via
  // `fireVis`, computed there from these pieces.
  const fire = buildFire(scene);
  const { flames, sparks, coals, pitLogs } = fire;
  const embers = coals;

  // Stations
  // Wood pile: individual logs (buildWoodPile below) so it can visibly deplete as
  // state.wood runs down. Built at FIRE.woodPile (NORMAL's starting count) as a
  // harmless default before the first real sync() call (from game.js's update loop)
  // resizes it to the chosen difficulty's starting pile.
  const woodPile = buildWoodPile(FIRE.woodPile);
  woodPile.group.position.set(LAYOUT.woodPile.x, 0, LAYOUT.woodPile.z);
  woodPile.group.rotation.y = 0.2;
  scene.add(woodPile.group);

  const gasCan = buildGasCan();
  gasCan.position.set(LAYOUT.gasCan.x, 0, LAYOUT.gasCan.z);
  scene.add(gasCan);

  const cooler = buildCooler();
  cooler.position.set(LAYOUT.cooler.x, 0, LAYOUT.cooler.z);
  scene.add(cooler);

  // Cabin: door faces roughly toward the fire pit (LAYOUT.cabinDoor).
  const cabin = buildCabin();
  cabin.position.set(-7.5, 0, -7);
  cabin.rotation.y = Math.atan2(LAYOUT.cabinDoor.x - (-7.5), LAYOUT.cabinDoor.z - (-7));
  scene.add(cabin);

  // Pallet powerup (09/27/2026): leaning against the cabin, off to the side of
  // the door. Hidden until Johnny D remembers it (game.js sets `pallet.visible`
  // from state.powerups.palletRemembered, and hides it again once the pallet is
  // picked up, broken up or burned). Tipped up on its edge and rotated to roughly
  // match the cabin wall's own angle so it reads as propped against the building.
  const pallet = makePalletMesh();
  pallet.position.set(LAYOUT.pallet.x, 0.4, LAYOUT.pallet.z);
  pallet.rotation.y = cabin.rotation.y + Math.PI / 2.2;
  pallet.rotation.x = Math.PI * 0.42;
  pallet.visible = false;
  scene.add(pallet);

  // Travel trailer: local +z is the door side, so this is the same lookAt-style
  // rotation the old pop-up used (LAYOUT.camperDoor faces the fire pit).
  const trailer = buildTravelTrailer();
  trailer.position.set(7.5, 0, -7);
  trailer.rotation.y = Math.atan2(LAYOUT.camperDoor.x - 7.5, LAYOUT.camperDoor.z - (-7));
  scene.add(trailer);
  const TRAILER_POS = { x: 7.5, z: -7 };
  // Farthest point (tongue tip) is 3.1 from center at this rotation; add margin for canopy radius.
  const TRAILER_CLEAR = 4.4;

  // Tree ring: Kenney pines, weighted toward the tall detailed variants. Each tree is
  // a positioned group filled in asynchronously so buildWorld stays synchronous.
  const PINE_VARIANTS = [
    { name: "tree_pineTallA_detailed", height: 1.53, weight: 3 },
    { name: "tree_pineTallB_detailed", height: 1.93, weight: 3 },
    { name: "tree_pineTallC_detailed", height: 1.67, weight: 3 },
    { name: "tree_pineTallD_detailed", height: 2.08, weight: 3 },
    { name: "tree_pineRoundC", height: 1.25, weight: 1 },
    { name: "tree_pineDefaultA", height: 1.55, weight: 1 },
  ];
  const PINE_WEIGHT_TOTAL = PINE_VARIANTS.reduce((s, v) => s + v.weight, 0);
  function pickPine() {
    let r = Math.random() * PINE_WEIGHT_TOTAL;
    for (const v of PINE_VARIANTS) { if ((r -= v.weight) <= 0) return v; }
    return PINE_VARIANTS[0];
  }
  function plantPine(x, z, targetH, castShadow) {
    const tree = new THREE.Group();
    tree.position.set(x, 0, z);
    tree.rotation.y = Math.random() * Math.PI * 2;
    scene.add(tree);
    const variant = pickPine();
    const needle = lerpColor("#173a22", "#22492b", Math.random());
    spawnModel(variant.name, tree, {
      scale: targetH / variant.height,
      colorMap: { leafsDark: needle, woodBarkDark: "#3b2a18" },
      castShadow,
    });
    return tree;
  }

  const trees = [];
  for (let i = 0; i < 46; i++) {
    const a = (i / 46) * Math.PI * 2 + (Math.random() - 0.5) * 0.12;
    const r = 10.5 + Math.random() * 3.5;
    const x = Math.sin(a) * r, z = Math.cos(a) * r;
    if (z > 7 && Math.abs(x) < 4) continue; // keep the road open toward the camera side
    if (Math.hypot(x - TRAILER_POS.x, z - TRAILER_POS.z) < TRAILER_CLEAR) continue; // keep the trailer clear, whatever position this random draw lands on
    trees.push(plantPine(x, z, 3.4 + Math.random() * 2.4, true));
  }

  // Back row, sparser and further out, for depth. Not part of `trees` (no wind sway,
  // no shadows), same road gap kept clear.
  for (let i = 0; i < 28; i++) {
    const a = (i / 28) * Math.PI * 2 + (Math.random() - 0.5) * 0.15;
    const r = 14 + Math.random() * 4;
    const x = Math.sin(a) * r, z = Math.cos(a) * r;
    if (z > 7 && Math.abs(x) < 4) continue;
    if (Math.hypot(x - TRAILER_POS.x, z - TRAILER_POS.z) < TRAILER_CLEAR) continue;
    plantPine(x, z, 3.4 + Math.random() * 2.4, false);
  }

  // Smoke: a pool of soft sprites recycled from the fire upward
  const smokeTex = makeSmokeTexture();
  const smoke = [];
  for (let i = 0; i < 60; i++) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeTex, color: "#9a9a9a", transparent: true, opacity: 0, depthWrite: false }));
    sp.userData = { age: 999, life: 1, vel: new THREE.Vector3(), size: 0.6 };
    sp.position.set(0, 0.8, 0);
    scene.add(sp);
    smoke.push(sp);
  }

  // Bear: low-poly quadruped, footprint and facing unchanged from the old box pair
  // (front = +Z, same as the camper convention below).
  const bear = buildBear();
  bear.visible = false;
  scene.add(bear);

  // Wind arrows (shown during gusts): three chevrons marching toward the fire
  const windArrow = new THREE.Group();
  const arrowMat = new THREE.MeshBasicMaterial({ color: "#bcd6ff", transparent: true, opacity: 0.8 });
  for (let i = 0; i < 3; i++) {
    const c = new THREE.Mesh(new THREE.ConeGeometry(0.4, 0.9, 4), arrowMat);
    c.rotation.x = Math.PI / 2;
    c.position.z = -i * 1.1;
    windArrow.add(c);
  }
  windArrow.visible = false; // chevrons retired 09/14; streaks and smoke carry the wind now

  // Wind streaks: thin swirling lines that ride the gust across the circle
  const streaks = [];
  const streakMat = new THREE.MeshBasicMaterial({ color: "#cfe0ff", transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false });
  for (let i = 0; i < 36; i++) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 0.05), streakMat.clone());
    m.rotation.order = "YXZ";
    m.rotation.x = -Math.PI / 2;
    m.userData = { phase: Math.random(), amp: 0.4 + Math.random() * 1.2, lane: (Math.random() - 0.5) * 7, speed: 0.9 + Math.random() * 0.5, h: 0.6 + Math.random() * 1.6 };
    m.visible = false;
    scene.add(m);
    streaks.push(m);
  }

  // Don M: the woods cameo. Hunter orange jacket and cap, built from the same
  // camper rig so he matches the crew. Stands between two trees. Keeps his
  // Step 2 look (flannel, same cap and shirt color) per Bryan (09/25); the
  // rounded body was step 4, and the refine pass (09/27/2026) put him on
  // buildRefinedCamper (id in REFINED_CAMPERS, config.js) with build "slim"
  // (docs/CAMPERS.md doesn't call out a build for him, so he gets the same
  // default as most of the roster).
  const don = makeCamperMesh({ id: "don-m", cap: "#ff6a00", shirt: "#ff6a00",
    look: { build: "slim", top: "flannel", topColor: "#ff6a00", pants: "jeans", cap: "#ff6a00", hair: { color: "#4a3420" } } });
  don.visible = false;
  scene.add(don);

  // Alan: white tee with a bee print, no cap, arms up and flailing, a swarm of
  // bees behind him. Keeps his Step 2 look (Bryan, 09/25); the rounded body
  // and bee print were step 4, and the refine pass (09/27/2026) put him on
  // buildRefinedCamper too, with build "slim" (same reasoning as Don M above).
  // No `cap` in his look object (and no `hat` field needed) keeps him
  // hatless, same as before the refine pass.
  const alan = makeCamperMesh({ id: "alan",
    look: { build: "slim", top: "tee", topColor: "#f4f1ea", graphic: { color: "#1c1712", shape: "bee" }, pants: "jeans", hair: { color: "#4a3420" } } });
  const alanParts = alan.userData.parts;
  alanParts.armL.rotation.z = 2.7; alanParts.armL.rotation.x = -0.2;
  alanParts.armR.rotation.z = -2.7; alanParts.armR.rotation.x = 0.15;   // arms up, flailing
  alan.visible = false;
  scene.add(alan);
  const bees = new THREE.Group();
  const beeMat = new THREE.MeshBasicMaterial({ color: "#ffd23c" });
  for (let i = 0; i < 14; i++) {
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.06, 5, 5), beeMat);
    b.userData = { ox: (Math.random() - 0.5) * 1.2, oy: 0.9 + Math.random() * 1.0, oz: (Math.random() - 0.5) * 1.2, ph: Math.random() * 6.28 };
    bees.add(b);
  }
  bees.visible = false;
  scene.add(bees);

  // Fire breath: a cone that flashes from the player's mouth toward the pit. Additive
  // and untoned so it reads as a flash of flame rather than a lit, tone-mapped surface.
  const breath = new THREE.Mesh(new THREE.ConeGeometry(0.55, 2.6, 8, 1, true), new THREE.MeshBasicMaterial({ color: "#ffb347", transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
  breath.visible = false;
  scene.add(breath);

  // pitLogs (the four dropped-log slots, charred glowing ends) come from buildFire above.

  // Poker stick, leaning by the wood pile until somebody grabs it
  const stick = buildPokerStick();
  stick.position.set(LAYOUT.stick.x, 0.55, LAYOUT.stick.z);
  stick.rotation.z = 0.5; stick.rotation.x = 0.3;
  scene.add(stick);

  // Sky: a shooting star streak and a Starlink train
  const star = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.08), new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.9 }));
  star.visible = false;
  scene.add(star);
  const starlink = new THREE.Group();
  for (let i = 0; i < 7; i++) {
    const d = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 6), new THREE.MeshBasicMaterial({ color: "#dfe8ff" }));
    d.position.x = i * 0.9;
    starlink.add(d);
  }
  starlink.visible = false;
  scene.add(starlink);

  // Hint arrow: a yellow cone pointing down at whatever the player has not found yet
  const hintArrow = new THREE.Group();
  const cone = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.8, 8), new THREE.MeshBasicMaterial({ color: "#ffd23c" }));
  cone.rotation.x = Math.PI; cone.position.y = 0.4;
  const ringM = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.05, 6, 24), new THREE.MeshBasicMaterial({ color: "#ffd23c", transparent: true, opacity: 0.7 }));
  ringM.rotation.x = Math.PI / 2; ringM.position.y = -2.0;
  hintArrow.add(cone, ringM);
  hintArrow.visible = false;
  scene.add(hintArrow);

  // Snack token that hops chair to chair
  const snackToken = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.2, 0.2), new THREE.MeshBasicMaterial({ color: "#ffd23c" }));
  snackToken.visible = false;
  scene.add(snackToken);

  // Dressing: rocks, stumps, bushes, grass and mushrooms along the tree line, plus a
  // few clustered around the cabin and trailer, plus a handful of pine-undergrowth
  // clusters tucked against the ring. Seeded so the layout is identical every load;
  // low and shadowless. Nothing sits past z=5 (that's the camera-facing foreground),
  // and the road gap, both doors, the bear path and the road entry stay clear.
  const dressingRand = mulberry32(20260921);
  function distToSegment(px, pz, ax, az, bx, bz) {
    const dx = bx - ax, dz = bz - az;
    const len2 = dx * dx + dz * dz || 1;
    let t = ((px - ax) * dx + (pz - az) * dz) / len2;
    t = Math.max(0, Math.min(1, t));
    const cx = ax + t * dx, cz = az + t * dz;
    return Math.hypot(px - cx, pz - cz);
  }
  function dressingBlocked(x, z) {
    if (z > 5) return true;                                                 // keep the foreground clear
    if (z > 6 && Math.abs(x) < 4) return true;                              // road gap
    if (Math.hypot(x - LAYOUT.cabinDoor.x, z - LAYOUT.cabinDoor.z) < 1.6) return true;
    if (Math.hypot(x - LAYOUT.camperDoor.x, z - LAYOUT.camperDoor.z) < 1.6) return true;
    if (Math.hypot(x - LAYOUT.roadEntry.x, z - LAYOUT.roadEntry.z) < 2.0) return true;
    if (distToSegment(x, z, LAYOUT.bearEntry.x, LAYOUT.bearEntry.z, 0, 0) < 1.5) return true;
    return false;
  }
  const greenClump = () => lerpColor("#2f4f1f", "#3d5a24", dressingRand());   // warm olive, not the kit's teal default
  const DRESSING_ITEMS = [
    { name: "rock_largeA", weight: 3, scale: [0.5, 0.9], colorMap: () => ({ dirt: "#5f5a55", grass: greenClump() }) },
    { name: "rock_largeC", weight: 3, scale: [0.5, 0.9], colorMap: () => ({ dirt: "#5f5a55", grass: greenClump() }) },
    { name: "stump_round", weight: 2, scale: [0.7, 1.1], colorMap: { woodBark: "#7a4c22", woodInner: "#c9a27a" } },
    { name: "plant_bush", weight: 4, scale: [0.7, 1.2], colorMap: () => ({ grass: greenClump() }) },
    { name: "grass_large", weight: 5, scale: [0.7, 1.2], colorMap: () => ({ grass: greenClump() }) },
    { name: "mushroom_redGroup", weight: 2, scale: [0.6, 1.0], colorMap: { colorRed: "#a8322e" } },
    { name: "log_large", weight: 1, scale: [0.8, 1.1], colorMap: { woodBark: "#7a4c22", woodInner: "#c9a27a" } },
  ];
  const DRESSING_WEIGHT_TOTAL = DRESSING_ITEMS.reduce((s, d) => s + d.weight, 0);
  function pickDressing() {
    let r = dressingRand() * DRESSING_WEIGHT_TOTAL;
    for (const d of DRESSING_ITEMS) { if ((r -= d.weight) <= 0) return d; }
    return DRESSING_ITEMS[0];
  }
  function placeDressing(item, x, z) {
    const scale = item.scale[0] + dressingRand() * (item.scale[1] - item.scale[0]);
    const colorMap = typeof item.colorMap === "function" ? item.colorMap() : item.colorMap;
    const grp = new THREE.Group();
    grp.position.set(x, 0, z);
    scene.add(grp);
    spawnModel(item.name, grp, { scale, rotationY: dressingRand() * Math.PI * 2, colorMap, castShadow: false });
  }

  // Tree-line band: radius 8.5 to 11, roughly half the old count.
  let placed = 0, tries = 0;
  while (placed < 20 && tries < 300) {
    tries++;
    const a = dressingRand() * Math.PI * 2;
    const r = 8.5 + dressingRand() * 2.5;
    const x = Math.sin(a) * r, z = Math.cos(a) * r;
    if (dressingBlocked(x, z)) continue;
    placeDressing(pickDressing(), x, z);
    placed++;
  }

  // A few rocks, a stump and a grass clump by each building, clear of its door.
  const BUILDING_KINDS = ["rock_largeA", "rock_largeC", "stump_round", "grass_large"];
  function scatterAroundBuilding(cx, cz, doorX, doorZ, count) {
    for (let i = 0; i < count; i++) {
      let x, z, t = 0;
      do {
        const a = dressingRand() * Math.PI * 2;
        const r = 1.3 + dressingRand() * 1.6;
        x = cx + Math.sin(a) * r; z = cz + Math.cos(a) * r;
        t++;
      } while ((dressingBlocked(x, z) || Math.hypot(x - doorX, z - doorZ) < 1.4) && t < 20);
      if (t >= 20) continue;
      const name = BUILDING_KINDS[i % BUILDING_KINDS.length];
      placeDressing(DRESSING_ITEMS.find((d) => d.name === name), x, z);
    }
  }
  scatterAroundBuilding(-7.5, -7, LAYOUT.cabinDoor.x, LAYOUT.cabinDoor.z, 4);
  scatterAroundBuilding(7.5, -7, LAYOUT.camperDoor.x, LAYOUT.camperDoor.z, 4);

  // Pine undergrowth: small clusters of two or three tucked against the tree ring
  // (radius 9.5 to 11), never a lone cone standing alone in open grass.
  for (let c = 0; c < 3; c++) {
    let cx, cz, t = 0;
    do {
      const a = dressingRand() * Math.PI * 2;
      const r = 9.5 + dressingRand() * 1.5;
      cx = Math.sin(a) * r; cz = Math.cos(a) * r;
      t++;
    } while (dressingBlocked(cx, cz) && t < 20);
    if (t >= 20) continue;
    const clusterSize = 2 + Math.floor(dressingRand() * 2);
    for (let i = 0; i < clusterSize; i++) {
      const x = cx + (dressingRand() - 0.5) * 0.8, z = cz + (dressingRand() - 0.5) * 0.8;
      if (dressingBlocked(x, z)) continue;
      const grp = new THREE.Group();
      grp.position.set(x, 0, z);
      scene.add(grp);
      spawnModel("tree_pineGroundA", grp, {
        scale: 0.8 + dressingRand() * 0.4,
        rotationY: dressingRand() * Math.PI * 2,
        colorMap: { leafsDark: lerpColor("#173a22", "#22492b", dressingRand()) },
        castShadow: false,
      });
    }
  }

  function resize() {
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  window.addEventListener("resize", resize);
  resize();

  return { renderer, scene, camera, fireLight, keyLight, flames, embers, sparks, coals, bear, windArrow, streaks, don, alan, bees, breath, pitLogs, hintArrow, snackToken, stick, star, starlink, woodPile, gasCan, cooler, pallet, trees, smoke };
}

// ---------- Camper rig ----------
// Proportions (standing, local space, +Z is the front the mesh faces after a
// lookAt call, matching player.mesh.rotation.y = atan2(vx, vz)). Chosen so the
// hip sits at chair-seat height once dropped by SEATED_DROP: shin length must
// equal SEAT_Y exactly, or a seated camper's feet float or sink.
const SEAT_Y = 0.45;       // buildCampChair's seat.position.y
const SHIN_LEN = 0.45;
const THIGH_LEN = 0.33;
const HIP_Y = THIGH_LEN + SHIN_LEN;      // 0.78
const LEG_X = 0.15;
const TORSO_W = 0.60, TORSO_D = 0.42, TORSO_H = 0.52;
const TORSO_TOP = HIP_Y + TORSO_H;       // 1.30
const NECK_H = 0.03, NECK_R = 0.1;   // short: the head sits down on the shoulders, just a sliver showing
const HEAD_R = 0.17;
const HEAD_TOP = TORSO_TOP + NECK_H + HEAD_R * 2; // ~1.72, cap adds a bit more
const SHOULDER_Y = TORSO_TOP - 0.06, SHOULDER_X = 0.32;
const ARM_LEN = 0.50;

// Seated pose tuning (09/26: Bryan's chair-clip screenshot showed shins and
// thighs passing through the front X-frame legs and the seat edge from the
// title camera's side/back angles). Two levers, on top of buildCampChair's
// shorter seat depth (props.js):
// - SEATED_BACK_OFFSET nudges the whole seated rig (legs, torso, head, arms
//   together, never just the legs) toward the chair back so the rear sits on
//   the seat and the back meets the backrest, instead of floating mid-cushion.
// - SHIN_LEAN bends the knee a little short of a right angle so the shin (and
//   the foot) swing forward past the knee instead of hanging straight down
//   from it. A straight-down shin lands almost exactly on top of the front
//   leg's ground contact (the X-frame crosses right under the seat's front
//   edge); leaning it forward clears the frame and reads as a relaxed
//   camp-chair sprawl rather than a formal chair-sit.
const SEATED_BACK_OFFSET = 0.05;
const SHIN_LEAN = 0.35;   // radians, ~20 degrees
const HIP_SIT_ANGLE = -Math.PI / 2, KNEE_SIT_ANGLE = Math.PI / 2 - SHIN_LEAN;
// SHIN_LEAN shortens the shin's effective vertical drop (cos(lean) < 1), so
// the seated drop is deepened by exactly that much to keep the feet on the
// ground instead of floating. Without the lean this reduces to SEAT_Y - HIP_Y,
// the original relation (shin length was chosen to equal SEAT_Y exactly).
export const SEATED_DROP = SEAT_Y - HIP_Y - SHIN_LEN * (1 - Math.cos(SHIN_LEAN));

// Shared geometries: every camper reuses the same shapes, only materials (and,
// for the torso/arm, which of these shapes) differ. RoundedBoxGeometry with a
// small radius and low (2) segments keeps the chunky low-poly read while
// rounding off the old flat-cut edges (art pass step 4, Bryan's "too squared
// off" note). Hands stay plain boxes: too small for the rounding to read.
const ROUND_SEG = 2;
const LIMB_R = 0.025, BOOT_R = 0.02;
const thighGeo = new RoundedBoxGeometry(0.15, THIGH_LEN, 0.15, ROUND_SEG, LIMB_R);
const shinGeo = new RoundedBoxGeometry(0.14, SHIN_LEN, 0.14, ROUND_SEG, LIMB_R);
const bareShinGeo = new RoundedBoxGeometry(0.12, SHIN_LEN, 0.12, ROUND_SEG, LIMB_R); // slimmer: bare skin, no pant leg bulk
const bootGeo = new RoundedBoxGeometry(0.17, 0.12, 0.23, ROUND_SEG, BOOT_R);
const handGeo = new THREE.BoxGeometry(0.16, 0.13, 0.16);

// Full-length sleeve/arm, and the short-sleeve split (a shorter shirt-colored
// sleeve over a bare skin forearm) used by `top: "tee"`.
const armGeo = new RoundedBoxGeometry(0.15, ARM_LEN, 0.15, ROUND_SEG, LIMB_R);
const SLEEVE_LEN = ARM_LEN * 0.42;
const FOREARM_LEN = ARM_LEN - SLEEVE_LEN;
const sleeveGeo = new RoundedBoxGeometry(0.16, SLEEVE_LEN, 0.16, ROUND_SEG, LIMB_R);
const forearmGeo = new RoundedBoxGeometry(0.13, FOREARM_LEN, 0.13, ROUND_SEG, 0.02);

// Torso: a chest box over a narrower hip box (a slight waist taper), each
// rounded. Two variants share the same taper idea: "regular" for every shirt
// and jacket type, "puffer" wider all the way down for the bulkier down-jacket
// look. Built once and reused; only the material varies per camper.
const CHEST_H = TORSO_H * 0.6, HIP_H = TORSO_H - CHEST_H;
function buildTorsoGeo(chestScale, hipScale) {
  const chest = new RoundedBoxGeometry(TORSO_W * chestScale, CHEST_H, TORSO_D * chestScale, ROUND_SEG, 0.035);
  chest.translate(0, TORSO_H / 2 - CHEST_H / 2, 0);
  const hip = new RoundedBoxGeometry(TORSO_W * hipScale, HIP_H, TORSO_D * hipScale, ROUND_SEG, 0.03);
  hip.translate(0, -TORSO_H / 2 + HIP_H / 2, 0);
  return mergeGeometries([chest, hip]);
}
const torsoGeoRegular = buildTorsoGeo(1.0, 0.82);
const torsoGeoPuffer = buildTorsoGeo(1.18, 1.0);
function torsoGeoFor(top) { return top === "puffer" ? torsoGeoPuffer : torsoGeoRegular; }
function torsoWidthFor(top) { return top === "puffer" ? TORSO_W * 1.18 : TORSO_W; }
function torsoDepthFor(top) { return top === "puffer" ? TORSO_D * 1.18 : TORSO_D; }
const glassesGeo = (() => {
  const lensGeo = new THREE.BoxGeometry(0.09, 0.06, 0.02);
  const lensL = lensGeo.clone(); lensL.translate(-0.08, NECK_H + HEAD_R, HEAD_R - 0.01);
  const lensR = lensGeo.clone(); lensR.translate(0.08, NECK_H + HEAD_R, HEAD_R - 0.01);
  const bridge = new THREE.BoxGeometry(0.05, 0.015, 0.02); bridge.translate(0, NECK_H + HEAD_R, HEAD_R - 0.01);
  return mergeGeometries([lensL, lensR, bridge]);
})();
const beardFullGeo = (() => {
  const g = new THREE.BoxGeometry(0.19, 0.16, 0.14);
  g.translate(0, NECK_H + HEAD_R - 0.11, HEAD_R - 0.02);
  return g;
})();
const beardStubbleGeo = (() => {
  const g = new THREE.BoxGeometry(0.18, 0.09, 0.1);
  g.translate(0, NECK_H + HEAD_R - 0.09, HEAD_R - 0.03);
  return g;
})();

// Head: neck, skull, nose and ears merged into one skin-colored mesh (all rigid
// relative to each other), eyes kept as a second mesh so they can be dark.
const headGeo = (() => {
  const skull = new THREE.SphereGeometry(HEAD_R, 8, 6); skull.translate(0, NECK_H + HEAD_R, 0);
  const neck = new THREE.CylinderGeometry(NECK_R, NECK_R * 1.05, NECK_H, 6); neck.translate(0, NECK_H / 2, 0);
  // Nose: a small tapered wedge (a low-poly cone, apex forward and tipped down
  // a touch for a rounded-bottom read) instead of the flat box Bryan called
  // "square."
  const nose = new THREE.ConeGeometry(0.05, 0.1, 5);
  nose.rotateX(Math.PI / 2 + 0.35);
  nose.translate(0, NECK_H + HEAD_R - 0.03, HEAD_R + 0.02);
  // Ears: small, tucked close to the skull, so a tip peeks below or beside a
  // cap, beanie, or bucket brim rather than reading as a block bolted on the
  // side of the head (Bryan, 09/26: "oversized square blocks").
  const earGeo = new THREE.BoxGeometry(0.033, 0.06, 0.03);
  const earL = earGeo.clone(); earL.translate(-HEAD_R - 0.005, NECK_H + HEAD_R, -0.02);
  const earR = earGeo.clone(); earR.translate(HEAD_R + 0.005, NECK_H + HEAD_R, -0.02);
  return mergeGeometries([skull, neck, nose, earL, earR]);
})();
const eyesGeo = (() => {
  const eyeGeo = new THREE.SphereGeometry(0.025, 6, 6);
  const eyeL = eyeGeo.clone(); eyeL.translate(-0.065, NECK_H + HEAD_R, HEAD_R - 0.02);
  const eyeR = eyeGeo.clone(); eyeR.translate(0.065, NECK_H + HEAD_R, HEAD_R - 0.02);
  return mergeGeometries([eyeL, eyeR]);
})();
// Baseball cap: a dome (flattened half-sphere) hugging the head, with a brim
// hinged at the dome's front-bottom edge that juts out along +z (the face
// direction) and tilts down, so it reads as a cap from the front, the side,
// and from behind (a curved crown, never a flat disc).
// All three hat Y constants are now HEAD-LOCAL (no TORSO_TOP term): the hat
// is parented under `head` (see makeCamperMesh) so it inherits head rotation
// during emotes instead of floating free of a tilted head.
const CROWN_R = HEAD_R + 0.035;
// Lowered 0.02 (09/26): the 09/25 raise (done to clear the eyes) left a strip of
// bare forehead between the brim and the eyes wide enough to read as the cap
// floating off the skull, especially from the side where the crown's rim is
// noticeably wider than the head at that height. Eyes (top edge ~0.225) still
// clear the brim with margin.
const CAP_Y = NECK_H + HEAD_R * 2 - 0.08;
const capGeo = (() => {
  const crown = new THREE.SphereGeometry(CROWN_R, 10, 7, 0, Math.PI * 2, 0, Math.PI / 2);
  crown.scale(1, 0.8, 1);   // flattened half-sphere, not a full dome
  const brim = new THREE.BoxGeometry(0.28, 0.022, 0.22);
  brim.translate(0, 0, 0.11);          // hinge edge (near the crown) at local z=0
  brim.rotateX(0.26);                  // tilt the outer edge down
  brim.translate(0, 0.01, CROWN_R - 0.03); // seat the hinge right at the crown's front-bottom edge
  return mergeGeometries([crown, brim]);
})();
// Beanie: a rounded knit dome plus a folded cuff band at its base, kept as two
// meshes (art pass step 4) so the cuff can sit a shade darker than the crown,
// the fold Bryan asked for. Raised and enlarged 09/26 so the cuff's bottom
// edge clears the eyes with a little forehead showing (it was sitting at, or
// on Brian R over, eye level); the dome is a bit taller to compensate for
// sitting higher, per Bryan. An optional pom-pom is a separate small sphere
// added per camper in makeCamperMesh when look.pom is set.
const BEANIE_R = HEAD_R + 0.05;
const beanieDomeGeo = new THREE.SphereGeometry(BEANIE_R, 10, 7, 0, Math.PI * 2, 0, Math.PI * 0.5);
const BEANIE_BAND_H = 0.05;
const beanieBandGeo = (() => {
  const band = new THREE.CylinderGeometry(HEAD_R + 0.065, HEAD_R + 0.055, BEANIE_BAND_H, 10);
  band.translate(0, -BEANIE_BAND_H / 2, 0);   // top edge right at the dome's (now equator-level) open bottom
  return band;
})();
const pomGeo = new THREE.SphereGeometry(0.06, 8, 6);
// Lowered 0.025 (09/26, Bryan: hats a little disconnected from heads): settles
// the cuff closer to the skull; still clears the eyes (top edge ~0.225) by a
// comfortable margin.
const BEANIE_Y = NECK_H + HEAD_R * 1.5 + 0.065;

// Bucket hat: a low, near-flat crown and a brim that slopes down and out all
// the way around (an open cone-frustum lateral surface, no flat caps, so it
// droops instead of reading as a flat disc). Raised, and the brim shortened
// and steepened, 09/26 so it clears the eyes from both the lobby and the
// gameplay camera (it was drooping down over the face).
const bucketCrownGeo = (() => {
  const g = new THREE.CylinderGeometry(CROWN_R * 0.92, CROWN_R, 0.11, 10);
  g.translate(0, 0.03, 0);
  return g;
})();
const bucketBrimGeo = (() => {
  const g = new THREE.CylinderGeometry(CROWN_R * 1.05, CROWN_R * 1.35, 0.055, 10, 1, true);
  g.translate(0, -0.025, 0);
  return g;
})();
// Lowered 0.023 (09/26): same disconnected-from-the-skull note as the cap and
// beanie; the brim still clears the eyes (top edge ~0.225) with margin.
const BUCKET_Y = NECK_H + HEAD_R * 1.55 + 0.047;

// Cap logo patch: a tiny flat panel on a baseball cap's front, cheap enough to
// put on every capped camper (art pass step 4 detail pass).
const capLogoGeo = (() => {
  const g = new THREE.BoxGeometry(0.07, 0.05, 0.01);
  g.translate(0, 0.03, CROWN_R * 0.86);
  return g;
})();

// Hair that only peeks below a hat: sideburns at the ear line and a nape patch
// at the back, low enough to clear the hat and stay well below the eyes.
const HAIR_PEEK_Y = NECK_H + HEAD_R - 0.05;
const hairPeekGeo = (() => {
  const sideburn = new THREE.BoxGeometry(0.045, 0.11, 0.09);
  const l = sideburn.clone(); l.translate(-(HEAD_R - 0.015), HAIR_PEEK_Y, 0.03);
  const r = sideburn.clone(); r.translate(HEAD_R - 0.015, HAIR_PEEK_Y, 0.03);
  const nape = new THREE.BoxGeometry(0.17, 0.1, 0.06);
  nape.translate(0, HAIR_PEEK_Y + 0.01, -(HEAD_R - 0.02));
  return mergeGeometries([l, r, nape]);
})();

// Full hair for a bareheaded camper (Alan): a shallow crown that stops well
// above the eye line all the way around, plus a fuller fringe at the sides
// and back only, so the front hairline never comes down over the eyes.
const hairTopGeo = (() => {
  const g = new THREE.SphereGeometry(HEAD_R + 0.02, 10, 7, 0, Math.PI * 2, 0, Math.PI * 0.4);
  g.translate(0, NECK_H + HEAD_R, 0);
  return g;
})();
const hairFringeGeo = (() => {
  const fringe = new THREE.BoxGeometry(0.055, 0.16, 0.11);
  const l = fringe.clone(); l.translate(-(HEAD_R - 0.01), NECK_H + HEAD_R - 0.08, 0.01);
  const r = fringe.clone(); r.translate(HEAD_R - 0.01, NECK_H + HEAD_R - 0.08, 0.01);
  const nape = new THREE.BoxGeometry(0.18, 0.14, 0.08);
  nape.translate(0, NECK_H + HEAD_R - 0.06, -(HEAD_R - 0.015));
  return mergeGeometries([l, r, nape]);
})();

// Shared materials (no per-camper variation) and per-color caches (shirt plaid,
// cap, beard) so campers only pay for a new material when their color is new.
const skinMat = new THREE.MeshLambertMaterial({ color: "#e8b48f" });
const eyeDarkMat = new THREE.MeshLambertMaterial({ color: "#1c1712" });
const jeansMat = new THREE.MeshLambertMaterial({ color: "#33456b" });
const bootMat = new THREE.MeshLambertMaterial({ color: "#201812" });
const glassesMat = new THREE.MeshLambertMaterial({ color: "#141414" });

const solidMatCache = new Map();
function solidMaterial(hex) {
  if (!solidMatCache.has(hex)) solidMatCache.set(hex, new THREE.MeshLambertMaterial({ color: hex }));
  return solidMatCache.get(hex);
}

// A small plaid CanvasTexture per shirt color: the shirt color darkened 20% (so
// firelight doesn't blow pastels out to white), one darker check band at ~55%
// brightness, and a thin darker line only where the bands cross. Two tones,
// no per-pixel noise, no light band (that's what read as a glowing checkerboard).
// NearestFilter keeps the edges crisp at this low a res.
const CHECK_PX = 64, BAND_PX = 14;
const plaidCache = new Map();
function plaidTexture(hex) {
  if (plaidCache.has(hex)) return plaidCache.get(hex);
  const shirt = new THREE.Color(hex);
  const base = shirt.clone().multiplyScalar(0.8);
  const band = shirt.clone().multiplyScalar(0.55);
  const cross = shirt.clone().multiplyScalar(0.4);
  const c = document.createElement("canvas");
  c.width = c.height = CHECK_PX;
  const g = c.getContext("2d");
  g.fillStyle = `#${base.getHexString()}`; g.fillRect(0, 0, CHECK_PX, CHECK_PX);
  const at = (CHECK_PX - BAND_PX) / 2;
  g.fillStyle = `#${band.getHexString()}`;
  g.fillRect(0, at, CHECK_PX, BAND_PX); g.fillRect(at, 0, BAND_PX, CHECK_PX);
  g.fillStyle = `#${cross.getHexString()}`;
  g.fillRect(at, at + BAND_PX / 2 - 1, BAND_PX, 2); g.fillRect(at + BAND_PX / 2 - 1, at, 2, BAND_PX);
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  plaidCache.set(hex, tex);
  return tex;
}
// One check is this many meters across (torso gets ~3 across its front); arms
// reuse the same physical check size via a differently-repeated clone of the
// same canvas, so the flannel reads as one consistent weave, not two scales.
const CHECK_SIZE = TORSO_W / 3;
const shirtMatCache = new Map();
function shirtMaterial(hex, widthM, heightM) {
  const key = `${hex}|${widthM}|${heightM}`;
  if (!shirtMatCache.has(key)) {
    const tex = plaidTexture(hex).clone();
    tex.repeat.set(widthM / CHECK_SIZE, heightM / CHECK_SIZE);
    tex.needsUpdate = true;
    shirtMatCache.set(key, new THREE.MeshLambertMaterial({ map: tex }));
  }
  return shirtMatCache.get(key);
}

// ---------- Outfits (art pass step 4, `look` field: docs/CAMPERS.md "Looks") ----------
// A shade of a hex color, for trims (collar, zip, ribbing) a notch darker or
// lighter than the garment they sit on, without a whole new color to pick.
function shade(hex, factor) {
  return `#${new THREE.Color(hex).multiplyScalar(factor).getHexString()}`;
}
// Solid top color, or the flannel plaid above when `look.top === "flannel"`.
function topMaterial(look, widthM, heightM) {
  if (look.top === "flannel") return shirtMaterial(look.topColor, widthM, heightM);
  return solidMaterial(look.topColor);
}
const sneakerMat = new THREE.MeshLambertMaterial({ color: "#d9d5c8" });
const sockMat = solidMaterial("#e9e5d8");
const glassesClearMat = new THREE.MeshLambertMaterial({ color: "#b9ccd9" });
const sockGeo = new THREE.BoxGeometry(0.135, 0.05, 0.135);

function pantsMaterial(pants) {
  switch (pants) {
    case "black": return solidMaterial("#23262b");
    case "gray": return solidMaterial("#5c6470");
    case "khaki": return solidMaterial("#9c8a63");
    case "shorts-dark": return solidMaterial("#26241f");
    case "shorts-camo": return camoMaterial();
    case "jeans": default: return jeansMat;
  }
}
function isShorts(pants) { return pants === "shorts-camo" || pants === "shorts-dark"; }

// Blotchy two-tone camo, built once and shared (only Brian R's shorts use it).
let camoMat = null;
function camoMaterial() {
  if (camoMat) return camoMat;
  const c = document.createElement("canvas");
  c.width = c.height = 32;
  const g = c.getContext("2d");
  g.fillStyle = "#4b5a3a"; g.fillRect(0, 0, 32, 32);
  g.fillStyle = "#33421f"; g.fillRect(2, 3, 10, 8); g.fillRect(18, 14, 11, 9); g.fillRect(6, 20, 9, 8);
  g.fillStyle = "#6b5a3a"; g.fillRect(16, 2, 9, 7); g.fillRect(1, 16, 8, 8); g.fillRect(22, 24, 8, 6);
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter;
  camoMat = new THREE.MeshLambertMaterial({ map: tex });
  return camoMat;
}

// A small printed chest graphic (Tom S's white print, Chris Occ's red graphic,
// Scott K's hoodie logo, Alan's bees): one CanvasTexture plane per shape/color,
// cached so two campers with the same graphic share it.
const graphicPlaneGeo = new THREE.PlaneGeometry(0.22, 0.22);
const graphicMatCache = new Map();
function graphicMaterial(shape, color) {
  const key = `${shape}|${color}`;
  if (graphicMatCache.has(key)) return graphicMatCache.get(key);
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d");
  g.fillStyle = color;
  if (shape === "square") {
    g.fillRect(14, 14, 36, 36);
  } else if (shape === "bee") {
    g.fillStyle = "#ffd23c"; g.beginPath(); g.arc(32, 32, 23, 0, Math.PI * 2); g.fill();
    g.fillStyle = color; g.fillRect(9, 20, 46, 6); g.fillRect(9, 33, 46, 6); g.fillRect(9, 46, 46, 4);
  } else {
    g.beginPath(); g.arc(32, 32, 22, 0, Math.PI * 2); g.fill(); // circle default
  }
  const tex = new THREE.CanvasTexture(c);
  tex.needsUpdate = true;
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false });
  graphicMatCache.set(key, mat);
  return mat;
}

// ---------- Garment and footwear details (art pass step 4) ----------
// Small shared geometries, most merged from a couple of boxes/cylinders so a
// garment adds at most one or two extra draw calls. Sized against the fixed
// regular/puffer torso widths, since each garment only ever appears on one of
// the two torso variants.
const REG_W = TORSO_W, PUF_W = TORSO_W * 1.18, PUF_D = TORSO_D * 1.18;
const ZIP_H = TORSO_H * 0.6;
const zipTrimGeo = (() => {
  const bar = new THREE.BoxGeometry(0.035, ZIP_H, 0.025);
  const pull = new THREE.BoxGeometry(0.05, 0.035, 0.035);
  pull.translate(0, -ZIP_H / 2 - 0.02, 0.006);
  return mergeGeometries([bar, pull]);
})();
const hoodieMainGeo = (() => {
  const hood = new THREE.BoxGeometry(0.3, 0.22, 0.2);
  hood.translate(0, TORSO_H / 2 + 0.06, -TORSO_D / 2 + 0.02);
  const pocket = new THREE.BoxGeometry(0.32, 0.14, 0.045);
  pocket.translate(0, -TORSO_H / 2 + (TORSO_H - CHEST_H) * 0.5, TORSO_D / 2 - 0.02);
  return mergeGeometries([hood, pocket]);
})();
const hoodieStringsGeo = (() => {
  const string = new THREE.CylinderGeometry(0.008, 0.008, 0.12, 5);
  const l = string.clone(); l.translate(-0.05, TORSO_H / 2 - 0.08, TORSO_D / 2 - 0.01);
  const r = string.clone(); r.translate(0.05, TORSO_H / 2 - 0.08, TORSO_D / 2 - 0.01);
  return mergeGeometries([l, r]);
})();
const collarGeo = (() => {
  const g = new THREE.BoxGeometry(REG_W * 0.5, 0.07, 0.12);
  g.translate(0, TORSO_H / 2 - 0.02, TORSO_D / 2 - 0.03);
  return g;
})();
const fleeceTrimGeo = (() => {
  const collar = new THREE.BoxGeometry(REG_W * 0.5, 0.07, 0.12);
  collar.translate(0, TORSO_H / 2 - 0.02, TORSO_D / 2 - 0.03);
  const pocket = new THREE.BoxGeometry(0.14, 0.11, 0.03);
  pocket.translate(REG_W * 0.22, TORSO_H / 2 - CHEST_H * 0.85, TORSO_D / 2 - 0.015);
  return mergeGeometries([collar, pocket]);
})();
const pufferCollarGeo = (() => {
  const g = new THREE.BoxGeometry(PUF_W * 0.55, 0.08, 0.14);
  g.translate(0, TORSO_H / 2 + 0.02, PUF_D / 2 - 0.02);
  return g;
})();
const BELT_Y = -TORSO_H / 2 + 0.03;
const beltGeo = (() => {
  const strap = new THREE.BoxGeometry(REG_W * 0.9, 0.05, TORSO_D * 0.98);
  strap.translate(0, BELT_Y, 0);
  const buckle = new THREE.BoxGeometry(0.06, 0.06, 0.02);
  buckle.translate(0, BELT_Y, TORSO_D / 2 + 0.01);
  return mergeGeometries([strap, buckle]);
})();
const jeansPocketsGeo = (() => {
  const pocket = new THREE.BoxGeometry(0.14, 0.16, 0.012);
  const l = pocket.clone(); l.translate(-0.14, -TORSO_H / 2 + 0.05, -(TORSO_D * 0.41));
  const r = pocket.clone(); r.translate(0.14, -TORSO_H / 2 + 0.05, -(TORSO_D * 0.41));
  return mergeGeometries([l, r]);
})();
const shortsCuffGeo = new THREE.BoxGeometry(0.155, 0.03, 0.155);
const bootDetailGeo = (() => {
  const sole = new THREE.BoxGeometry(0.175, 0.03, 0.235); sole.translate(0, -0.075, 0);
  const toeCap = new THREE.BoxGeometry(0.16, 0.08, 0.08); toeCap.translate(0, -0.02, 0.085);
  return mergeGeometries([sole, toeCap]);
})();
const bootDetailMat = solidMaterial("#141210");
const sneakerSoleGeo = (() => {
  const g = new THREE.BoxGeometry(0.178, 0.032, 0.238);
  g.translate(0, -0.076, 0);
  return g;
})();
const watchGeo = new THREE.BoxGeometry(0.155, 0.035, 0.155);
const teeSleeveHemGeo = new THREE.BoxGeometry(0.165, 0.02, 0.165);
const longsleeveCuffGeo = new THREE.BoxGeometry(0.155, 0.025, 0.155);
const zipTrimMat = solidMaterial("#20242a");
const watchMat = solidMaterial("#242424");
const sneakerSoleMat = solidMaterial("#f7f5ef");
// A light ribbed cuff on a hoodie's sleeve end: a fixed pale tone rather than a
// shade of the garment color, so a dark hoodie (Scott K) still gets a visible
// wrist edge instead of the sleeve reading as one solid dark blob against the
// night (Bryan, 09/26: "arms barely show" on the Black Hawk emote).
const hoodieCuffMat = solidMaterial("#9a958c");

// Hair: only ever shown as a peek below a hat (hairPeekGeo, above) or as the
// fuller bareheaded style (hairTopGeo + hairFringeGeo, above) for a camper
// marked `hat: "none"`.

// camper fields this builder understands beyond name/cap/shirt: `look`, the
// outfit object described in docs/CAMPERS.md "Looks"
// ({ top, topColor, graphic?, pants, hair, cap?, hat?, pom?, watch?, beard?,
// beardColor?, glasses?, hiVisHem?, shoes? }). A camper with no `look`
// (none in campers.js anymore, but kept as a safety net) renders exactly as
// the pre-art-pass rig did: flannel in `shirt`, jeans, a cap in `cap`, no
// hair/beard/glasses.
//
// REFINE PASS (09/27/2026, Bryan: verify on Johnny D before it goes wide).
// makeCamperMesh() below is a dispatcher: campers in config.js's
// REFINED_CAMPERS render through buildRefinedCamper (elbow joints, a face,
// an outline), everyone else keeps buildClassicCamper exactly as it was.
// Legs, torso trims, and the head/hat/hair core are shared helpers
// (buildLegs/attachTorsoTrims/buildHeadCore) so both builders stay in sync
// and a camper can move from classic to refined later without a rewrite.
// Refined-only userData.parts fields: elbowL/elbowR (children of armL/armR,
// so existing code that rotates armL/armR is unaffected) and `face`
// ({ mouth, eyebrows } meshes driven by setExpression()).

function buildLegs(look, girth = 1) {
  // Legs: hip pivot -> thigh -> knee pivot -> shin + boot (+ sock, if the pant
  // leg stops at the knee). Rest angle is 0 on both joints (a straight
  // standing leg); setSeated() bends them for sitting, stepWalkCycle() bends
  // both for walking. Identical for the classic and refined builders except
  // for `girth` (refined-only, from look.build): a per-mesh X/Z-only scale on
  // the thigh/shin/boot themselves (never on the rotating hip/knee pivots, and
  // never touching Y), so a "big" build gets a visibly thicker leg at the same
  // height with no shear at any knee/hip bend angle -- scaling a leaf mesh is
  // safe under an ancestor's rotation; scaling the rotating pivot itself is not.
  const shorts = isShorts(look.pants);
  const pantsMat = pantsMaterial(look.pants);
  const shoeMat = look.shoes === "sneakers" ? sneakerMat : bootMat;
  const isSneaker = look.shoes === "sneakers";
  const legs = new THREE.Group();
  const legParts = {};
  [["legL", "kneeL", -1], ["legR", "kneeR", 1]].forEach(([hipKey, kneeKey, side]) => {
    const hip = new THREE.Group();
    hip.position.set(side * LEG_X, HIP_Y, 0);
    const thigh = new THREE.Mesh(thighGeo, pantsMat);
    thigh.position.y = -THIGH_LEN / 2;
    thigh.scale.set(girth, 1, girth);
    thigh.castShadow = true;
    if (shorts) {
      // A hem cuff at the bottom of the thigh, where the shorts end.
      const cuff = new THREE.Mesh(shortsCuffGeo, solidMaterial("#1c1f18"));
      cuff.position.y = -THIGH_LEN / 2 + 0.015;
      thigh.add(cuff);
    }
    const knee = new THREE.Group();
    knee.position.y = -THIGH_LEN;
    const shin = new THREE.Mesh(shorts ? bareShinGeo : shinGeo, shorts ? skinMat : pantsMat);
    shin.position.y = -SHIN_LEN / 2;
    shin.scale.set(girth, 1, girth);
    shin.castShadow = true;
    const boot = new THREE.Mesh(bootGeo, shoeMat);
    boot.position.y = -SHIN_LEN + 0.03;
    boot.scale.set(girth, 1, girth);
    boot.castShadow = true;
    // Boots get a sole and a toe cap; sneakers get a bright white sole.
    boot.add(new THREE.Mesh(isSneaker ? sneakerSoleGeo : bootDetailGeo, isSneaker ? sneakerSoleMat : bootDetailMat));
    knee.add(shin, boot);
    if (shorts) {
      const sock = new THREE.Mesh(sockGeo, sockMat);
      sock.position.y = -SHIN_LEN + 0.16;
      knee.add(sock);
    }
    hip.add(thigh, knee);
    legs.add(hip);
    legParts[hipKey] = hip; legParts[kneeKey] = knee;
  });
  return { legs, legParts, pantsMat };
}

// Torso trims (collar, zip, hood, quilt bands, ribbing, graphic decal, hi-vis
// hem, belt/pocket hints): whatever the garment in `look` calls for, added as
// children of `body`. Shared by both builders; only the base torso geometry
// (regular taper vs. the refined shoulder-slope taper) differs between them.
function attachTorsoTrims(body, look, torsoW, torsoD, pantsMat) {
  const shorts = isShorts(look.pants);
  const topLocalTop = TORSO_H / 2, topLocalBottom = -TORSO_H / 2;
  if (look.top === "fleece") {
    // Collar and a small chest pocket, one merged mesh, plus a separate zip
    // bar with its pull tab (a second color, so it stays its own mesh).
    body.add(new THREE.Mesh(fleeceTrimGeo, solidMaterial(shade(look.topColor, 0.85))));
    const zip = new THREE.Mesh(zipTrimGeo, zipTrimMat);
    zip.position.set(0, -0.05, 0.005);
    body.add(zip);
  } else if (look.top === "quarterzip") {
    body.add(new THREE.Mesh(collarGeo, solidMaterial(shade(look.topColor, 0.85))));
    const zip = new THREE.Mesh(zipTrimGeo, zipTrimMat);
    zip.position.set(0, -0.05, 0.005);
    body.add(zip);
  } else if (look.top === "hoodie") {
    // Hood plus kangaroo pocket, one merged mesh, and a pair of drawstrings.
    body.add(new THREE.Mesh(hoodieMainGeo, solidMaterial(shade(look.topColor, 0.82))));
    body.add(new THREE.Mesh(hoodieStringsGeo, solidMaterial("#f4f1ea")));
  } else if (look.top === "puffer") {
    // Three quilt bands and the collar, one shade of the jacket color, all
    // merged into a single mesh (one draw call instead of four).
    const bandMat = solidMaterial(shade(look.topColor, 0.75));
    const bands = [0, 1, 2].map((i) => {
      const b = new THREE.BoxGeometry(torsoW * 1.04, 0.045, torsoD * 1.04);
      b.translate(0, topLocalTop - 0.12 - i * 0.17, 0);
      return b;
    });
    bands.push(pufferCollarGeo);
    body.add(new THREE.Mesh(mergeGeometries(bands), bandMat));
  } else if (look.top === "sweater") {
    const ribMat = solidMaterial(shade(look.topColor, 0.7));
    const bands = [0, 1].map((i) => {
      const b = new THREE.BoxGeometry(torsoW * 0.86, 0.035, torsoD * 0.9);
      b.translate(0, topLocalBottom + 0.035 + i * 0.05, 0);
      return b;
    });
    body.add(new THREE.Mesh(mergeGeometries(bands), ribMat));
  }
  if (look.graphic) {
    const decal = new THREE.Mesh(graphicPlaneGeo, graphicMaterial(look.graphic.shape, look.graphic.color));
    decal.position.set(0, topLocalTop - CHEST_H * 0.5, torsoD / 2 + 0.012);
    body.add(decal);
  }
  if (look.hiVisHem) {
    const hv = new THREE.Mesh(new THREE.BoxGeometry(torsoW * 0.95, 0.05, torsoD * 0.95), solidMaterial("#e0d400"));
    hv.position.y = topLocalBottom + 0.03;
    body.add(hv);
  }
  // Belt and buckle on non-jeans, non-shorts pants; a pair of jeans pocket
  // hints riding just above the hip on jeans (one merged mesh either way).
  if (!shorts && look.pants !== "jeans") {
    body.add(new THREE.Mesh(beltGeo, solidMaterial(shade(`#${pantsMat.color.getHexString()}`, 0.75))));
  } else if (look.pants === "jeans") {
    body.add(new THREE.Mesh(jeansPocketsGeo, solidMaterial("#242f4a")));
  }
}

// Head core: skull/eyes/beard/glasses/hat/hair, shared by both builders. The
// refined builder adds eyebrows, a mouth and an outline on top of this.
function buildHeadCore(look) {
  const head = new THREE.Mesh(headGeo, skinMat);
  head.position.y = TORSO_TOP;
  head.castShadow = true;
  const eyes = new THREE.Mesh(eyesGeo, eyeDarkMat);
  head.add(eyes);
  if (look.beard && look.beard !== "none") {
    const beardMat = solidMaterial(look.beardColor || "#2e2117");
    head.add(new THREE.Mesh(look.beard === "full" ? beardFullGeo : beardStubbleGeo, beardMat));
  }
  if (look.glasses) head.add(new THREE.Mesh(glassesGeo, look.glasses === "clear" ? glassesClearMat : glassesMat));

  // Hats: every camper gets one (baseball cap, beanie, or bucket) unless
  // explicitly marked bareheaded (`hat: "none"`, currently only Alan). A
  // capped camper's hair still shows a little, but only as a peek at the
  // sides and back (sideburns and nape) below the hat line, in the hair
  // color, never over the eyes and never poking through the crown. A
  // bareheaded camper gets the fuller no-over-the-eyes hairstyle instead.
  // Bald campers (Spitty) show no hair either way.
  const hatType = look.hat || (look.cap ? "cap" : "none");
  const hasHair = look.hair && look.hair !== "bald";
  let cap = new THREE.Group();
  if (hatType === "none" || !look.cap) {
    cap.visible = false;
    if (hasHair) {
      const hairMat = solidMaterial(look.hair.color);
      head.add(new THREE.Mesh(hairTopGeo, hairMat));
      head.add(new THREE.Mesh(hairFringeGeo, hairMat));
    }
  } else {
    if (hasHair) head.add(new THREE.Mesh(hairPeekGeo, solidMaterial(look.hair.color)));
    if (hatType === "beanie") {
      const dome = new THREE.Mesh(beanieDomeGeo, solidMaterial(look.cap));
      const band = new THREE.Mesh(beanieBandGeo, solidMaterial(shade(look.cap, 0.8)));
      cap.add(dome, band);
      cap.position.y = BEANIE_Y;
      if (look.pom) {
        const pom = new THREE.Mesh(pomGeo, solidMaterial(look.pom));
        pom.position.y = BEANIE_R - 0.03;
        cap.add(pom);
      }
    } else if (hatType === "bucket") {
      const crown = new THREE.Mesh(bucketCrownGeo, solidMaterial(look.cap));
      const brim = new THREE.Mesh(bucketBrimGeo, solidMaterial(shade(look.cap, 0.88)));
      cap.add(crown, brim);
      cap.position.y = BUCKET_Y;
    } else {
      cap = new THREE.Mesh(capGeo, solidMaterial(look.cap));
      cap.position.y = CAP_Y;
      cap.add(new THREE.Mesh(capLogoGeo, solidMaterial(shade(look.cap, 0.55))));
    }
    cap.castShadow = true;
  }
  // The hat is a child of `head` (like the eyes, beard, and glasses above),
  // not a sibling positioned in world space, so it turns and tilts with the
  // head during an emote instead of floating in its old spot while the head
  // moves out from under it (Bryan, 09/26: Perry's cap during the cheese-puff
  // toss). `userData.parts.cap` still points at the same object either way.
  head.add(cap);
  return { head, eyes, cap };
}

// Arms pivot at the shoulder so emotes and the walk cycle can swing them.
// A tee's short sleeve is a shorter shirt-colored segment over a bare skin
// forearm; every other top is one full-length sleeve. Classic builder: one
// rigid mesh (plus the tee's forearm) below the shoulder pivot, exactly as
// before the refine pass.
function makeArm(side, look) {
  const shortSleeve = look.top === "tee";
  const pivot = new THREE.Group();
  pivot.position.set(side * SHOULDER_X, SHOULDER_Y, 0);
  if (shortSleeve) {
    const sleeve = new THREE.Mesh(sleeveGeo, topMaterial(look, 0.16, SLEEVE_LEN));
    sleeve.position.y = -SLEEVE_LEN / 2;
    sleeve.castShadow = true;
    const hem = new THREE.Mesh(teeSleeveHemGeo, solidMaterial(shade(look.topColor, 0.8)));
    hem.position.y = -SLEEVE_LEN / 2 + 0.015;
    sleeve.add(hem);
    const forearm = new THREE.Mesh(forearmGeo, skinMat);
    forearm.position.y = -(SLEEVE_LEN + FOREARM_LEN / 2);
    forearm.castShadow = true;
    pivot.add(sleeve, forearm);
  } else {
    const arm = new THREE.Mesh(armGeo, topMaterial(look, 0.15, ARM_LEN));
    arm.position.y = -ARM_LEN / 2;
    arm.castShadow = true;
    if (look.top === "longsleeve") {
      const cuff = new THREE.Mesh(longsleeveCuffGeo, solidMaterial(shade(look.topColor, 0.75)));
      cuff.position.y = -ARM_LEN / 2 + 0.02;
      arm.add(cuff);
    } else if (look.top === "hoodie") {
      const cuff = new THREE.Mesh(longsleeveCuffGeo, hoodieCuffMat);
      cuff.position.y = -ARM_LEN / 2 + 0.02;
      arm.add(cuff);
    }
    pivot.add(arm);
  }
  const hand = new THREE.Mesh(handGeo, skinMat);
  hand.position.y = -ARM_LEN - 0.065;
  pivot.add(hand);
  if (look.watch && side === -1) {
    const watch = new THREE.Mesh(watchGeo, watchMat);
    watch.position.y = -ARM_LEN + 0.045;
    pivot.add(watch);
  }
  return pivot;
}

function buildClassicCamper(camper) {
  const g = new THREE.Group();
  const look = camper.look || { top: "flannel", topColor: camper.shirt, pants: "jeans", cap: camper.cap };

  const { legs, legParts, pantsMat } = buildLegs(look);

  // Torso: tapered chest-over-hip geometry (regular or the bulkier puffer),
  // solid or flannel material, then whatever trim the garment calls for, all
  // added as children of `body` in its own local space (0,0,0 at chest/hip
  // center, +TORSO_H/2 at the shoulder line, -TORSO_H/2 at the hem).
  const torsoW = torsoWidthFor(look.top), torsoD = torsoDepthFor(look.top);
  const body = new THREE.Mesh(torsoGeoFor(look.top), topMaterial(look, torsoW, TORSO_H));
  body.position.y = HIP_Y + TORSO_H / 2;
  body.castShadow = true;
  attachTorsoTrims(body, look, torsoW, torsoD, pantsMat);

  const { head, cap } = buildHeadCore(look);

  const armL = makeArm(-1, look), armR = makeArm(1, look);

  // `rig` holds everything (legs, torso, head, arms) so setSeated can nudge the
  // whole camper toward the chair back in one local-space move (rig.position.z
  // is in the mesh's own facing direction, so it stays correct however the
  // mesh itself is rotated to face the fire). `g` keeps carrying the world
  // position/rotation exactly as before.
  const rig = new THREE.Group();
  rig.add(legs, body, head, armL, armR);
  g.add(rig);
  g.userData.parts = { body, legs, head, cap, armL, armR, rig, legL: legParts.legL, legR: legParts.legR, kneeL: legParts.kneeL, kneeR: legParts.kneeR };
  return g;
}

// ---------- Refined builder (art pass step 5, 09/27/2026): elbow joints, a
// simple switchable face, and a cheap inverted-hull outline on the torso and
// head so the silhouette pops at night. Same proportions/height as classic
// (same leg/torso/head constants); see docs/HANDOFF.md and the comment above
// makeCamperMesh for the rollout plan (REFINED_CAMPERS in config.js). ----------

// Elbow split: the arm is built in two segments (upper arm under the shoulder
// pivot, forearm under a new elbow pivot) so it can bend independently of the
// shoulder. Split so a straight arm (elbow.rotation.x = 0) lands the hand at
// the exact same spot as the classic one-piece arm -- every existing call
// that rotates armL/armR (emotes, the poke thrust, stepWalkCycle) keeps
// working unmodified; the elbow only adds a bend on top.
const UPPER_FRAC = 0.52;
const UPPER_LEN = ARM_LEN * UPPER_FRAC;
const LOWER_LEN = ARM_LEN - UPPER_LEN;
const upperArmGeoRefined = new RoundedBoxGeometry(0.15, UPPER_LEN, 0.15, ROUND_SEG, LIMB_R);
const forearmGeoRefined = new RoundedBoxGeometry(0.135, LOWER_LEN, 0.135, ROUND_SEG, 0.022);
// Mitten hand: same box the classic hand uses, rounded harder so it reads as
// a soft mitten block instead of a bare cube.
const mittenHandGeo = new RoundedBoxGeometry(0.175, 0.145, 0.175, ROUND_SEG, 0.05);
// Idle elbow bend (standing/emoting): a relaxed arm is never bolt-straight.
const ELBOW_IDLE = 0.18;
// Seated elbow bend: forearms come up and rest toward the lap.
const ELBOW_SEATED = 1.05;

function makeArmRefined(side, look, girth = 1, shoulderXMul = 1) {
  const shortSleeve = look.top === "tee";
  const pivot = new THREE.Group();
  pivot.position.set(side * SHOULDER_X * shoulderXMul, SHOULDER_Y, 0);
  const elbow = new THREE.Group();
  let lowerLen;
  if (shortSleeve) {
    // Elbow sits right at the tee sleeve's hem, same as the classic split
    // between the short sleeve and its bare forearm.
    const sleeve = new THREE.Mesh(sleeveGeo, topMaterial(look, 0.16, SLEEVE_LEN));
    sleeve.position.y = -SLEEVE_LEN / 2;
    sleeve.scale.set(girth, 1, girth);
    sleeve.castShadow = true;
    const hem = new THREE.Mesh(teeSleeveHemGeo, solidMaterial(shade(look.topColor, 0.8)));
    hem.position.y = -SLEEVE_LEN / 2 + 0.015;
    sleeve.add(hem);
    pivot.add(sleeve);
    elbow.position.y = -SLEEVE_LEN;
    lowerLen = FOREARM_LEN;
    const forearm = new THREE.Mesh(forearmGeo, skinMat);
    forearm.position.y = -FOREARM_LEN / 2;
    forearm.scale.set(girth, 1, girth);
    forearm.castShadow = true;
    elbow.add(forearm);
  } else {
    const upper = new THREE.Mesh(upperArmGeoRefined, topMaterial(look, 0.15, UPPER_LEN));
    upper.position.y = -UPPER_LEN / 2;
    upper.scale.set(girth, 1, girth);
    upper.castShadow = true;
    pivot.add(upper);
    elbow.position.y = -UPPER_LEN;
    lowerLen = LOWER_LEN;
    const forearm = new THREE.Mesh(forearmGeoRefined, topMaterial(look, 0.13, LOWER_LEN));
    forearm.position.y = -LOWER_LEN / 2;
    forearm.scale.set(girth, 1, girth);
    forearm.castShadow = true;
    if (look.top === "longsleeve") {
      const cuff = new THREE.Mesh(longsleeveCuffGeo, solidMaterial(shade(look.topColor, 0.75)));
      cuff.position.y = -LOWER_LEN / 2 + 0.02;
      forearm.add(cuff);
    } else if (look.top === "hoodie") {
      const cuff = new THREE.Mesh(longsleeveCuffGeo, hoodieCuffMat);
      cuff.position.y = -LOWER_LEN / 2 + 0.02;
      forearm.add(cuff);
    }
    elbow.add(forearm);
  }
  elbow.rotation.x = ELBOW_IDLE;
  const hand = new THREE.Mesh(mittenHandGeo, skinMat);
  hand.position.y = -lowerLen - 0.065;
  hand.scale.set(girth, 1, girth);
  elbow.add(hand);
  if (look.watch && side === -1) {
    const watch = new THREE.Mesh(watchGeo, watchMat);
    watch.position.y = -lowerLen + 0.045;
    elbow.add(watch);
  }
  pivot.add(elbow);
  return { pivot, elbow };
}

// Torso base geometry (round 2, 09/27/2026: the round-1 shoulder-slope cap
// made every torso read wider and banded, like a puffer, even on a plain
// quarter-zip -- Bryan). Back to the classic two-box chest-over-hip taper
// (same TORSO_W/TORSO_D as the classic builder: chestScale/hipScale of 1.0
// pass through at classic width/depth), just a touch more taper at the waist
// and a bigger bevel radius so it reads a little less boxy without adding a
// second visible tier. Per-camper body build (look.build, "big"/"slim") is
// applied afterward as a uniform X/Z scale on the whole `body` mesh in
// buildRefinedCamper, not baked in here.
function buildTorsoGeoRefined(chestScale, hipScale) {
  const chest = new RoundedBoxGeometry(TORSO_W * chestScale, CHEST_H, TORSO_D * chestScale, ROUND_SEG, 0.045);
  chest.translate(0, TORSO_H / 2 - CHEST_H / 2, 0);
  const hip = new RoundedBoxGeometry(TORSO_W * hipScale, HIP_H, TORSO_D * hipScale, ROUND_SEG, 0.035);
  hip.translate(0, -TORSO_H / 2 + HIP_H / 2, 0);
  return mergeGeometries([chest, hip]);
}
const torsoGeoRegularRefined = buildTorsoGeoRefined(1.0, 0.80);
const torsoGeoPufferRefined = buildTorsoGeoRefined(1.18, 1.0);
function torsoGeoForRefined(top) { return top === "puffer" ? torsoGeoPufferRefined : torsoGeoRegularRefined; }

// ---------- Face: eyebrows + a small mouth, each a single mesh whose
// geometry (and, for the mouth, rotation) setExpression() swaps at runtime --
// cheap (one draw call each, no matter how many expressions exist) and no
// morph targets needed at this poly count. ----------
const BROW_Y = NECK_H + HEAD_R + 0.05, BROW_Z = HEAD_R - 0.03;
const browBoxGeo = () => new THREE.BoxGeometry(0.06, 0.018, 0.02);
const eyebrowNeutralGeo = (() => {
  const l = browBoxGeo(); l.translate(-0.07, BROW_Y, BROW_Z);
  const r = browBoxGeo(); r.translate(0.07, BROW_Y, BROW_Z);
  return mergeGeometries([l, r]);
})();
// Furrowed: inner ends pulled down and together (worried/cold).
const eyebrowColdGeo = (() => {
  const l = browBoxGeo(); l.rotateZ(0.35); l.translate(-0.062, BROW_Y - 0.014, BROW_Z);
  const r = browBoxGeo(); r.rotateZ(-0.35); r.translate(0.062, BROW_Y - 0.014, BROW_Z);
  return mergeGeometries([l, r]);
})();
// Raised high and arched outward (shock).
const eyebrowScaredGeo = (() => {
  const l = browBoxGeo(); l.rotateZ(-0.22); l.translate(-0.072, BROW_Y + 0.028, BROW_Z);
  const r = browBoxGeo(); r.rotateZ(0.22); r.translate(0.072, BROW_Y + 0.028, BROW_Z);
  return mergeGeometries([l, r]);
})();
const eyebrowMat = solidMaterial("#241a12");

// Mouth position lives on the MESH (set once in buildRefinedCamper), not
// baked into these geometries: setExpression() rotates the mesh itself
// (rotation.z = PI to flip the smile into the "cold" frown), and a rotation
// has to turn around the mouth's own local origin, not the head's, or it
// flies off to wherever (0,0,0) is in head-space when flipped.
const MOUTH_Y = NECK_H + HEAD_R - 0.085, MOUTH_Z = HEAD_R - 0.008;
const mouthNeutralGeo = new THREE.BoxGeometry(0.064, 0.013, 0.014);
// "U"-shaped smile: the bottom arc of a small torus ring, so the corners turn
// up. Reused rotated 180deg (see setExpression) for the "cold" frown -- same
// geometry, flipped, so a frown costs nothing extra.
const mouthSmileGeo = (() => {
  const arc = Math.PI * 0.6;
  const g = new THREE.TorusGeometry(0.04, 0.012, 5, 8, arc);
  g.rotateZ(Math.PI * 1.5 - arc / 2); // centers the arc at the bottom of the ring, around its own origin
  return g;
})();
// Small open "O" for a scared/shocked mouth.
const mouthOpenGeo = new THREE.CylinderGeometry(0.022, 0.026, 0.03, 8);
const mouthMat = solidMaterial("#3a1c14");

// Outline: a scaled, back-face-only dark shell as a child of the torso and
// the head (the two parts that define the silhouette at a distance), reusing
// each part's own geometry so it always matches exactly and inherits any
// build scale applied to its host mesh automatically. Two extra draw calls
// per refined camper -- everything else in the refine pass is either
// zero-cost (animation, geometry swaps on parts that already existed) or
// folded into an existing merged mesh (the torso taper).
//
// Round 2 (09/27/2026, Bryan: "it barely shows at night"): 1.05-1.06 was
// only a couple of percent of inflation, a fraction of a pixel at the
// gameplay camera's distance or on a phone. OUTLINE_SCALE is a flat 14%,
// about 5x thicker, which is what actually reads at that size; still just
// the same two draw calls; see the round-2 sheet for a before/after look at
// the gameplay camera and the phone frame.
const OUTLINE_SCALE = 1.14;
const outlineMat = new THREE.MeshBasicMaterial({ color: "#080706", side: THREE.BackSide, toneMapped: false });
function addOutline(hostMesh, scale = OUTLINE_SCALE) {
  const outline = new THREE.Mesh(hostMesh.geometry, outlineMat);
  outline.scale.setScalar(scale);
  outline.castShadow = false;
  hostMesh.add(outline);
  return outline;
}

// Body build (round 2, 09/27/2026, Bryan: "Bryan J, Tom S, Chris Occ and
// Spitty are bigger. Not fat. The other guys are slimmer" -- look.build,
// "big"/"slim", set per camper in campers.js and recorded in docs/CAMPERS.md's
// Looks table). Broader shoulders/chest and thicker limbs for "big", same
// height either way: every factor below is X/Z only (Y always 1), and every
// one is applied either to `body` itself (safe: a mesh's own rotation always
// composes with its own scale without shear, see game.js's cold-hunch lean)
// or to a static leaf mesh deep inside the rig (thigh/shin/boot/arm/forearm/
// hand -- see buildLegs and makeArmRefined), never to a rotating pivot.
const BUILD = {
  slim: { torsoW: 1.0, torsoD: 1.0, limb: 1.0, shoulderX: 1.0 },
  big: { torsoW: 1.14, torsoD: 1.12, limb: 1.16, shoulderX: 1.1 },
};
function buildFor(look) { return BUILD[look.build] || BUILD.slim; }

const EXPRESSION_MOUTH = {
  neutral: { geo: mouthNeutralGeo, rot: 0 },
  happy: { geo: mouthSmileGeo, rot: 0 },
  cold: { geo: mouthSmileGeo, rot: Math.PI },   // same arc, flipped into a frown
  scared: { geo: mouthOpenGeo, rot: 0 },
};
const EXPRESSION_BROW = { neutral: eyebrowNeutralGeo, happy: eyebrowNeutralGeo, cold: eyebrowColdGeo, scared: eyebrowScaredGeo };

// Switches a refined camper's face to one of "neutral"/"happy"/"cold"/"scared".
// No-op (safely) on a classic camper, which has no `face` parts. Not wired
// into any game.js logic yet -- exported for a future pass to call.
export function setExpression(mesh, name) {
  const face = mesh.userData.parts && mesh.userData.parts.face;
  if (!face) return;
  const m = EXPRESSION_MOUTH[name] || EXPRESSION_MOUTH.neutral;
  face.mouth.geometry = m.geo;
  face.mouth.rotation.z = m.rot;
  face.eyebrows.geometry = EXPRESSION_BROW[name] || EXPRESSION_BROW.neutral;
}

function buildRefinedCamper(camper) {
  const g = new THREE.Group();
  const look = camper.look || { top: "flannel", topColor: camper.shirt, pants: "jeans", cap: camper.cap };
  const build = buildFor(look);

  const { legs, legParts, pantsMat } = buildLegs(look, build.limb);

  const torsoW = torsoWidthFor(look.top), torsoD = torsoDepthFor(look.top);
  const body = new THREE.Mesh(torsoGeoForRefined(look.top), topMaterial(look, torsoW, TORSO_H));
  body.position.y = HIP_Y + TORSO_H / 2;
  body.scale.set(build.torsoW, 1, build.torsoD);
  body.castShadow = true;
  attachTorsoTrims(body, look, torsoW, torsoD, pantsMat);
  addOutline(body);

  const { head, cap } = buildHeadCore(look);
  const mouth = new THREE.Mesh(mouthNeutralGeo, mouthMat);
  mouth.position.set(0, MOUTH_Y, MOUTH_Z);
  head.add(mouth);
  const eyebrows = new THREE.Mesh(eyebrowNeutralGeo, eyebrowMat);
  head.add(eyebrows);
  addOutline(head);
  // Cap outline too, when it's a single mesh (the plain baseball cap): a
  // beanie/bucket hat is a Group of two meshes with no geometry of its own,
  // and outlining both would cost a second draw call per camper for those
  // hat types, so it's skipped there (see the round-2 report on the outline
  // budget). The hat is still the same size as it always was; only the
  // three.js Mesh case gets the extra dark rim.
  if (cap.isMesh) addOutline(cap);

  const armLRig = makeArmRefined(-1, look, build.limb, build.shoulderX);
  const armRRig = makeArmRefined(1, look, build.limb, build.shoulderX);

  const rig = new THREE.Group();
  rig.add(legs, body, head, armLRig.pivot, armRRig.pivot);
  g.add(rig);
  g.userData.parts = {
    body, legs, head, cap, armL: armLRig.pivot, armR: armRRig.pivot, rig,
    legL: legParts.legL, legR: legParts.legR, kneeL: legParts.kneeL, kneeR: legParts.kneeR,
    elbowL: armLRig.elbow, elbowR: armRRig.elbow,
    face: { mouth, eyebrows },
  };
  return g;
}

export function makeCamperMesh(camper) {
  return REFINED_CAMPERS.has(camper.id) ? buildRefinedCamper(camper) : buildClassicCamper(camper);
}

// Named exports of both builders (bypassing the REFINED_CAMPERS check) for
// dev/camper-refine.html's side-by-side comparison sheet -- not used by the
// real game, which always goes through makeCamperMesh above.
export { buildClassicCamper, buildRefinedCamper };

// Bends the hip and knee pivots for a seated camper (thighs forward, shins
// down and forward of the knee) and drops the whole mesh so the hips take the
// chair seat's weight, then nudges the rig back so the rear settles against
// the seat back. Standing/walking/leaving states call setSeated(mesh, false)
// to reset the legs.
export function setSeated(mesh, on) {
  const p = mesh.userData.parts;
  if (!p.legL) return;
  p.legL.rotation.x = on ? HIP_SIT_ANGLE : 0;
  p.legR.rotation.x = on ? HIP_SIT_ANGLE : 0;
  p.kneeL.rotation.x = on ? KNEE_SIT_ANGLE : 0;
  p.kneeR.rotation.x = on ? KNEE_SIT_ANGLE : 0;
  mesh.position.y = on ? SEATED_DROP : 0;
  if (p.rig) p.rig.position.z = on ? -SEATED_BACK_OFFSET : 0;
  // Refined-only: elbows bend more and rest toward the lap when seated,
  // back to the idle bend when standing. No-op on a classic camper (no
  // elbowL/elbowR in its parts).
  if (p.elbowL && p.elbowR) {
    p.elbowL.rotation.x = on ? ELBOW_SEATED : ELBOW_IDLE;
    p.elbowR.rotation.x = on ? ELBOW_SEATED : ELBOW_IDLE;
  }
}

// Walk cycle: swings the hip pivots (and, unless armsBusy, the arm pivots)
// based on the actual distance moved this frame, so the swing stops the
// instant the mover stops. Safe to call every frame with movedDist 0. Also
// bends the knee pivots (every camper has them) so a walking leg's knee
// lifts on its backward swing instead of the whole leg swinging as one rigid
// rod, and, on a refined camper only, adds a matching elbow bend.
export function stepWalkCycle(mesh, movedDist, dt, armsBusy) {
  const p = mesh.userData.parts;
  if (!p.legL) return;
  const walk = (mesh.userData.walk = mesh.userData.walk || { phase: 0 });
  const moving = movedDist > 0.0008;
  if (moving) walk.phase += movedDist * 6.5;
  const s = Math.sin(walk.phase);
  const lerp = Math.min(1, dt * 10);
  const legL = moving ? s * 0.5 : 0, legR = moving ? -s * 0.5 : 0;
  p.legL.rotation.x += (legL - p.legL.rotation.x) * lerp;
  p.legR.rotation.x += (legR - p.legR.rotation.x) * lerp;
  if (p.kneeL && p.kneeR) {
    // Each knee bends on its own leg's backward swing (foot lifting clear of
    // the ground to come back through), and straightens on the forward
    // swing/plant -- opposite phase between the two legs, same `s` the hips
    // use so it stays locked to actual distance moved.
    const kneeL = moving ? Math.max(0, -s) * 0.9 : 0;
    const kneeR = moving ? Math.max(0, s) * 0.9 : 0;
    p.kneeL.rotation.x += (kneeL - p.kneeL.rotation.x) * lerp;
    p.kneeR.rotation.x += (kneeR - p.kneeR.rotation.x) * lerp;
  }
  if (!armsBusy) {
    const armL = moving ? -s * 0.32 : 0, armR = moving ? s * 0.32 : 0;
    p.armL.rotation.x += (armL - p.armL.rotation.x) * lerp;
    p.armR.rotation.x += (armR - p.armR.rotation.x) * lerp;
    if (p.elbowL && p.elbowR) {
      const elbowL = moving ? ELBOW_IDLE + Math.max(0, s) * 0.5 : ELBOW_IDLE;
      const elbowR = moving ? ELBOW_IDLE + Math.max(0, -s) * 0.5 : ELBOW_IDLE;
      p.elbowL.rotation.x += (elbowL - p.elbowL.rotation.x) * lerp;
      p.elbowR.rotation.x += (elbowR - p.elbowR.rotation.x) * lerp;
    }
  }
}

// ---------- Bear ----------
// Same footprint (~2.6 long) and head height (1.8) as the old two-box bear,
// same +Z facing convention as the camper rig, so game.js's lookAt/lerp calls
// need no changes.
function buildBear() {
  const g = new THREE.Group();
  const furMat = new THREE.MeshLambertMaterial({ color: "#161210" });
  const snoutMat = new THREE.MeshLambertMaterial({ color: "#6b4a2e" });
  const eyeMat = new THREE.MeshBasicMaterial({ color: "#ffe680" });

  // Rump, shoulder hump, neck bridge, skull and ears: one fur-colored mesh.
  const rump = new THREE.BoxGeometry(1.15, 0.9, 0.85); rump.translate(0, 0.55, -0.55);
  const hump = new THREE.BoxGeometry(1.2, 1.0, 0.75); hump.translate(0, 0.65, 0.25);
  const neckB = new THREE.BoxGeometry(0.65, 0.6, 0.35); neckB.translate(0, 1.05, 0.75);
  const skull = new THREE.BoxGeometry(0.72, 0.68, 0.55); skull.translate(0, 1.46, 1.15);
  const earGeo = new THREE.BoxGeometry(0.16, 0.16, 0.08);
  const earL = earGeo.clone(); earL.translate(-0.24, 1.82, 1.0);
  const earR = earGeo.clone(); earR.translate(0.24, 1.82, 1.0);
  const body = new THREE.Mesh(mergeGeometries([rump, hump, neckB, skull, earL, earR]), furMat);
  body.castShadow = true;
  g.add(body);

  const snout = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.26, 0.34), snoutMat);
  snout.position.set(0, 1.35, 1.55);
  snout.castShadow = true;
  g.add(snout);

  const eyeGeo = new THREE.SphereGeometry(0.06, 6, 6);
  const eyeL = eyeGeo.clone(); eyeL.translate(-0.14, 1.45, 1.48);
  const eyeR = eyeGeo.clone(); eyeR.translate(0.14, 1.45, 1.48);
  g.add(new THREE.Mesh(mergeGeometries([eyeL, eyeR]), eyeMat));

  // Four legs, each a hip pivot with one swinging box, so a walk cycle reads
  // even at this low a poly count. Order: backL, backR, frontL, frontR.
  const legGeo = new THREE.BoxGeometry(0.26, 0.75, 0.26);
  const legs = [];
  [[-0.5, -0.5], [0.5, -0.5], [-0.55, 0.35], [0.55, 0.35]].forEach(([x, z]) => {
    const hip = new THREE.Group();
    hip.position.set(x, 0.75, z);
    const leg = new THREE.Mesh(legGeo, furMat);
    leg.position.y = -0.375;
    leg.castShadow = true;
    hip.add(leg);
    g.add(hip);
    legs.push(hip);
  });
  g.userData.legs = legs;
  return g;
}

// Diagonal gait (backL+frontR swing together, backR+frontL opposite), driven
// by actual distance moved so it starts and stops with the bear.
export function stepBearWalk(mesh, movedDist, dt) {
  const legs = mesh.userData.legs;
  if (!legs) return;
  const walk = (mesh.userData.walk = mesh.userData.walk || { phase: 0 });
  const moving = movedDist > 0.001;
  if (moving) walk.phase += movedDist * 5;
  const s = moving ? Math.sin(walk.phase) * 0.45 : 0;
  const lerp = Math.min(1, dt * 8);
  const targets = [s, -s, -s, s];
  legs.forEach((hip, i) => { hip.rotation.x += (targets[i] - hip.rotation.x) * lerp; });
}

export function makeChairMesh() {
  return buildCampChair();
}

export function makeLogMesh() {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.8, 7), new THREE.MeshLambertMaterial({ color: "#8a5a2b" }));
  m.rotation.z = Math.PI / 2;
  return m;
}

// ---------- Pallet powerup prop (09/27/2026) ----------
// A simple low-poly pallet: three stringers under six deck slats, chunky and
// flat-shaded, pale grey-brown ("#b7ac95"/"#8d8371") to match the weathered-wood
// tones the wood pile's overflow logs already use, so it reads as the same
// family of reclaimed lumber. Built flat, as if resting on the ground with the
// deck facing up: buildWorld's world-standing instance is rotated to lean it
// against the cabin, and game.js's showCarry (a smaller, scaled instance) tips
// it into the player's arms, the same way both already handle the log and the
// mini keg.
const PALLET_LEN = 1.1, PALLET_WID = 0.9;
export function makePalletMesh() {
  const g = new THREE.Group();
  const slatMat = new THREE.MeshLambertMaterial({ color: "#b7ac95", flatShading: true });
  const stringerMat = new THREE.MeshLambertMaterial({ color: "#8d8371", flatShading: true });
  const stringerH = 0.09, stringerW = 0.1, slatT = 0.045;
  const stringerGeo = new THREE.BoxGeometry(PALLET_LEN, stringerH, stringerW);
  [-(PALLET_WID / 2 - stringerW / 2), 0, PALLET_WID / 2 - stringerW / 2].forEach((z) => {
    const s = new THREE.Mesh(stringerGeo, stringerMat);
    s.position.set(0, stringerH / 2, z);
    s.castShadow = true;
    g.add(s);
  });
  const slatCount = 6, slatGap = 0.02;
  const slatW = PALLET_LEN / slatCount - slatGap;
  const slatGeo = new THREE.BoxGeometry(slatW, slatT, PALLET_WID);
  for (let i = 0; i < slatCount; i++) {
    const slat = new THREE.Mesh(slatGeo, slatMat);
    slat.position.set(-PALLET_LEN / 2 + slatW / 2 + i * (PALLET_LEN / slatCount), stringerH + slatT / 2, 0);
    slat.castShadow = true;
    g.add(slat);
  }
  return g;
}

// ---------- Wood pile (depletes with state.wood, 09/26) ----------
// Hex-prism logs (instanced, 2 draw calls) in a stacked pile that shows a share of its slots in
// proportion to the wood left (top row empties first), a small overflow heap once
// wood is stocked past the pile's own capacity, and kindling chips at zero. sync()
// is called every frame from game.js and does nothing unless wood or capacity
// actually changed.
//
// Pallet redesign (09/27/2026): this overflow heap used to be gated on the pallet
// powerup (a crate of slats on blocks, only shown once "earned") because the old
// pallet mechanic just deposited wood directly with no physical prop. Now the
// pallet is its own carryable prop (makePalletMesh, leaning against the cabin
// until grabbed) that gets broken up *at* the wood pile for +6 wood, so having a
// second, different-looking "pallet" sitting at the pile too would read as two
// pallets in the scene. This overflow visual is keyed on wood > capacity alone
// (the only way to get there is breaking the real pallet up here) and drawn as
// loose logs, ground height, no crate, so it reads as "extra logs someone stacked
// up" rather than a pallet.
const OVERFLOW_MAX_LOGS = 6;   // matches POWERUPS.palletBreakWood: the only source of overflow
const OVERFLOW_ROWS = [2, 1];

// Solid six-sided logs with pale cut ends, the shape of the old Kenney stack.
// (Kenney's single log_large is an open tube with no end caps, so it reads hollow.)
const LOG_R = 0.17, LOG_LEN = 0.9;
const LOG_W = LOG_R * 2;                        // side-by-side pitch, corner to corner
const LOG_RISE = LOG_R * Math.sqrt(3) * 0.86;   // row rise, nested into the gap below
// Full-pile row shapes by starting wood (bigger pile = more wood): bottom row first.
function pileRows(capacity) { return capacity >= 20 ? [4, 3, 2, 1] : capacity >= 16 ? [4, 3, 2] : [4, 3]; }

// Slot positions for a stack with the given row shape, bottom row first. This order
// is the depletion order: showing the first n slots empties the top row first.
function rowSlots(rows, yBase) {
  const out = [];
  rows.forEach((count, r) => {
    const y = yBase + r * LOG_RISE;
    for (let j = 0; j < count; j++) out.push({ y, z: (j - (count - 1) / 2) * LOG_W });
  });
  return out;
}
// How many slots to show for `wood` out of `capacity`: any wood at all shows a log.
function shownSlots(wood, capacity, slots) {
  if (wood <= 0) return 0;
  return Math.max(1, Math.min(slots, Math.round((wood / capacity) * slots)));
}

// A few bark chips and kindling twigs left at the empty spot (built once, fixed
// layout — this only ever toggles .visible, never rebuilds), so 0 wood reads as
// "out" rather than a patch of bare ground. Kenney bark/inner tones (matching
// the pile), sized up from the first pass so they still read at gameplay
// camera distance instead of vanishing into the dirt.
function buildKindling() {
  const g = new THREE.Group();
  const chipMat = new THREE.MeshLambertMaterial({ color: "#7a4c22", flatShading: true });
  const chipInnerMat = new THREE.MeshLambertMaterial({ color: "#c9a27a", flatShading: true });
  const chipGeo = new THREE.BoxGeometry(0.22, 0.035, 0.15);
  for (let i = 0; i < 5; i++) {
    const chip = new THREE.Mesh(chipGeo, i % 2 ? chipInnerMat : chipMat);
    const a = (i / 5) * Math.PI * 2;
    chip.position.set(Math.cos(a) * 0.34, 0.02, Math.sin(a) * 0.3);
    chip.rotation.y = a * 1.7;
    chip.castShadow = true;
    g.add(chip);
  }
  const twigGeo = new THREE.CylinderGeometry(0.026, 0.034, 0.6, 6);
  [[-0.14, 0.08, 0.4], [0.2, -0.16, -0.5]].forEach(([x, z, ry]) => {
    const twig = new THREE.Mesh(twigGeo, chipMat);
    twig.rotation.z = Math.PI / 2;
    twig.rotation.y = ry;
    twig.position.set(x, 0.03, z);
    twig.castShadow = true;
    g.add(twig);
  });
  return g;
}

// Builds the whole wood-pile prop: the depleting log stack, the (initially
// hidden) overflow heap for wood stocked past capacity, and the (initially
// hidden) empty-spot kindling. Returns { group, sync }: game.js positions/rotates
// `group` like any other station and calls sync(wood, capacity) once a frame;
// sync no-ops unless wood or capacity actually changed since the last call. The
// log geometry loads asynchronously (once, cached); sync() before it's ready
// just records the request and the load's .then() replays the latest one.
export function buildWoodPile(defaultCapacity) {
  const group = new THREE.Group();
  // One hex prism along X; cylinder groups are side, top, bottom -> bark, end, end.
  const logGeo = new THREE.CylinderGeometry(LOG_R, LOG_R, LOG_LEN, 6);
  logGeo.rotateZ(Math.PI / 2);
  logGeo.translate(0, LOG_R * Math.sqrt(3) / 2, 0); // flat face down, resting on y=0
  const logMats = [
    new THREE.MeshLambertMaterial({ color: "#7a4c22", flatShading: true }),
    new THREE.MeshLambertMaterial({ color: "#c9a27a", flatShading: true }),
    new THREE.MeshLambertMaterial({ color: "#c9a27a", flatShading: true }),
  ];
  function makeLogs(n, parent) {
    const m = new THREE.InstancedMesh(logGeo, logMats, n);
    m.castShadow = true; m.count = 0; // no receiveShadow: the old stack did not take camper shadows either
    parent.add(m);
    return m;
  }
  const mainLogs = makeLogs(10, group);

  const overflowGroup = new THREE.Group();
  overflowGroup.position.set(1.3, 0, 0.05);
  overflowGroup.visible = false;
  const overflowLogs = makeLogs(3, overflowGroup);
  group.add(overflowGroup);

  const kindling = buildKindling();
  kindling.visible = false;
  group.add(kindling);

  const m4 = new THREE.Matrix4();
  function place(mesh, positions, shown) {
    const n = Math.min(shown, positions.length);
    for (let i = 0; i < n; i++) {
      // A small fixed twist per slot so the stack is not machine-perfect.
      // Logs run front to back (toward the camera) so their bark faces the firelight
      // and the pale cut ends face the player, like the old Kenney stack.
      m4.makeRotationY(Math.PI / 2 + ((i * 37) % 7 - 3) * 0.02).setPosition(positions[i].z, positions[i].y, 0);
      mesh.setMatrixAt(i, m4);
    }
    mesh.count = n;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }
  let lastWood = null, lastCapacity = null;
  function sync(wood, capacity) {
    if (wood === lastWood && capacity === lastCapacity) return;
    lastWood = wood; lastCapacity = capacity;
    const main = rowSlots(pileRows(capacity), 0);
    place(mainLogs, main, shownSlots(Math.min(wood, capacity), capacity, main.length));
    const overflow = Math.max(0, Math.min(wood - capacity, OVERFLOW_MAX_LOGS));
    overflowGroup.visible = overflow > 0;
    const pile = rowSlots(OVERFLOW_ROWS, 0);
    place(overflowLogs, pile, shownSlots(overflow, OVERFLOW_MAX_LOGS, pile.length));
    kindling.visible = wood <= 0;
  }
  sync(defaultCapacity, defaultCapacity);
  return { group, sync };
}

function makeSmokeTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d");
  const grad = g.createRadialGradient(32, 32, 4, 32, 32, 30);
  grad.addColorStop(0, "rgba(255,255,255,0.55)");
  grad.addColorStop(0.6, "rgba(255,255,255,0.18)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}
