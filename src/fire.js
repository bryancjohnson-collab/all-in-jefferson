// Fire visuals: a handful of large banded flame tongues, a small capped hot-core
// glow, rising sparks, a mostly-dark glowing coal bed, and charred pit-log ends,
// all sitting on a dark ash disk instead of the lit dirt. Pure visuals only.
// state.fire.level, hot and hotTier stay authoritative in game.js; this module only
// reads them (plus dt, the shared flicker value and the wind) and draws accordingly.
// Art direction: docs/mockups/concept-A-bear-right.png (clean, banded, chunky flame
// tongues, not a soft blur).
import * as THREE from "three";

const SPARK_COUNT = 50;   // pool, kept under the 60-spark budget
const COAL_COUNT = 15;

const rand = (a, b) => a + Math.random() * (b - a);

// FOOT_FRAC: the ground-contact width as a fraction of the full lick width. Keeping
// the foot narrow while the belly (see below) carries the full width is what lets a
// lick grow visibly wider at higher tiers without its base spreading over the rocks.
// updateFireVisuals' width clamp is keyed to this same fraction, so the two must
// move together.
const FOOT_FRAC = 0.36;

// A bottom-anchored flame shape: a narrow, rounded foot at ground level that flares
// out to the full width at the belly partway up, then tapers to a point. The foot is
// deliberately narrow (see FOOT_FRAC) so growth reads as the flame widening as it
// rises, not its base spreading. The foot is a shallow curve, not a flat line, so the
// alpha-tested cutout edge isn't a hard horizontal seam where it meets the coals.
// Nested smaller copies drawn on top read as concentric color bands (red-orange
// edge, orange, yellow, near-white core) the way the mockup's flames are cel-shaded,
// not a blurred glow.
function teardrop(g, cx, baseY, w, h) {
  const footW = w * FOOT_FRAC;
  const bellyW = w;
  const bellyY = baseY - h * 0.32;
  const tipY = baseY - h;
  g.beginPath();
  g.moveTo(cx - footW / 2, baseY - h * 0.015);
  g.quadraticCurveTo(cx, baseY + h * 0.02, cx + footW / 2, baseY - h * 0.015);
  g.bezierCurveTo(cx + footW / 2, bellyY + h * 0.16, cx + bellyW / 2, bellyY + h * 0.08, cx + bellyW / 2, bellyY);
  g.bezierCurveTo(cx + bellyW * 0.32, bellyY - h * 0.4, cx + w * 0.12, tipY + h * 0.1, cx, tipY);
  g.bezierCurveTo(cx - w * 0.12, tipY + h * 0.1, cx - bellyW * 0.32, bellyY - h * 0.4, cx - bellyW / 2, bellyY);
  g.bezierCurveTo(cx - bellyW / 2, bellyY + h * 0.08, cx - footW / 2, bellyY + h * 0.16, cx - footW / 2, baseY - h * 0.015);
  g.closePath();
}
// withCore: the wide outer tongues that only switch on at a Hell's Anus tier skip
// the near-white band entirely, so the tier growth reads as more orange and yellow
// around the core instead of more white (the small, separately-capped `core` sprite
// is the only thing allowed to read as near-white at the top tiers).
function makeFlameTexture(withCore) {
  const c = document.createElement("canvas");
  c.width = 96; c.height = 128;
  const g = c.getContext("2d");
  const cx = 48, baseY = 118;
  const bands = [
    { w: 88, h: 116, color: "#ff4a12", alpha: 1 },
    { w: 60, h: 88, color: "#ff8a1c", alpha: 1 },
    { w: 30, h: 48, color: "#ffc42e", alpha: 1 },
  ];
  if (withCore) bands.push({ w: 13, h: 20, color: "#fff2b0", alpha: 1 });
  bands.forEach((b) => {
    g.globalAlpha = b.alpha;
    g.fillStyle = b.color;
    teardrop(g, cx, baseY, b.w, b.h);
    g.fill();
  });
  g.globalAlpha = 1;
  return new THREE.CanvasTexture(c);
}
// Small soft round dot: sparks and the capped hot-core glow, neither of which needs
// the banded silhouette.
function makeDotTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 48;
  const g = c.getContext("2d");
  const grad = g.createRadialGradient(24, 24, 0, 24, 24, 22);
  grad.addColorStop(0, "rgba(255,250,224,1)");
  grad.addColorStop(0.4, "rgba(255,214,120,0.85)");
  grad.addColorStop(0.75, "rgba(255,130,40,0.35)");
  grad.addColorStop(1, "rgba(255,90,20,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 48, 48);
  return new THREE.CanvasTexture(c);
}

// Hand-placed so the base cluster reads as a fire, not a scatter: one dominant
// tongue plus a few smaller flanking ones, always eligible (tierMin 0) but staggered
// on with `appearAt` (a fraction of `level`) so a low fire only shows the smallest.
// The wider/outer tongues only switch on at each Hell's Anus tier, which is what
// packs the base fuller and fills the tier out instead of just scaling one blob
// taller. Offsets are pulled in tight (every anchor under radius 0.6) so the base
// cluster stays well inside the stone ring's inner edge (radius 0.95) at every
// tier: tiers grow the fire by height and by more licks packed inside that circle,
// never by spreading anchors toward the rocks.
// `core: true` marks a tongue that carries the small near-white band in its own
// texture; the wide tier-gated outer tongues never do, so tier growth reads as
// more orange/yellow bulk, not more white (see makeFlameTexture).
const LICK_DEFS = [
  { ox: 0, oz: 0.02, baseW: 1.0, baseH: 1.6, appearAt: 0.12, tierMin: 0, core: true },
  { ox: 0.39, oz: 0.12, baseW: 0.6, baseH: 1.05, appearAt: 0.2, tierMin: 0, core: true },
  { ox: -0.37, oz: 0.1, baseW: 0.58, baseH: 1.0, appearAt: 0.24, tierMin: 0, core: false },
  { ox: 0.2, oz: -0.27, baseW: 0.48, baseH: 0.85, appearAt: 0.3, tierMin: 0, core: false },
  { ox: -0.24, oz: -0.26, baseW: 0.46, baseH: 0.8, appearAt: 0.36, tierMin: 0, core: false },
  { ox: 0.58, oz: -0.07, baseW: 0.68, baseH: 1.15, appearAt: 0, tierMin: 1, core: false },
  { ox: -0.58, oz: -0.05, baseW: 0.66, baseH: 1.1, appearAt: 0, tierMin: 1, core: false },
  { ox: 0.43, oz: 0.37, baseW: 0.58, baseH: 0.95, appearAt: 0, tierMin: 2, core: false },
  { ox: -0.43, oz: 0.36, baseW: 0.58, baseH: 0.95, appearAt: 0, tierMin: 2, core: false },
  { ox: 0.02, oz: 0.53, baseW: 0.6, baseH: 1.05, appearAt: 0, tierMin: 3, core: false },
];
// Tiny always-on flicker so a dying fire still shows a sliver of flame above the
// coals (approved look, docs/HANDOFF art pass step 3): small, never tier-gated.
const EMBER_DEFS = [
  { ox: 0.05, oz: 0, baseW: 0.26, baseH: 0.42 },
  { ox: -0.08, oz: 0.06, baseW: 0.2, baseH: 0.34 },
];

// Wide, very soft falloff for the bloom halo: no hard core, so it reads as light
// bleeding off the fire rather than as a second flame shape.
function makeBloomTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d");
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, "rgba(255,170,80,0.5)");
  grad.addColorStop(0.2, "rgba(255,150,60,0.4)");
  grad.addColorStop(0.5, "rgba(255,120,40,0.16)");
  grad.addColorStop(0.78, "rgba(255,96,24,0.04)");
  grad.addColorStop(1, "rgba(255,90,20,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

export function buildFire(scene) {
  const flameTexCore = makeFlameTexture(true);
  const flameTexPlain = makeFlameTexture(false);
  const dotTex = makeDotTexture();

  // Licks are opaque alpha-tested cutouts, not blended transparency: at ~15 units
  // from the camera, any partial alpha let the scene fog (#0b1020, dense by 15-26)
  // and the dark background bleed through, washing the bands to salmon/pink and
  // making the top tier read as ghostly. alphaTest gives a hard silhouette edge
  // with the full saturated color inside it, and opaque objects depth-sort properly
  // (no additive/blend stacking, no sprite-vs-sprite sort flicker).
  const flames = new THREE.Group();
  const makeLick = (def, tiny) => {
    const mat = new THREE.SpriteMaterial({
      map: tiny ? flameTexPlain : (def.core ? flameTexCore : flameTexPlain),
      color: new THREE.Color(1, 1, 1).multiplyScalar(rand(0.94, 1.0)),
      transparent: false, alphaTest: 0.5, depthWrite: true, fog: false, toneMapped: false,
    });
    const spr = new THREE.Sprite(mat);
    spr.userData = {
      tierMin: def.tierMin || 0, appearAt: tiny ? 0 : def.appearAt, show: 0, hasCore: !!def.core,
      ox: def.ox + rand(-0.03, 0.03), oz: def.oz + rand(-0.03, 0.03),
      baseW: def.baseW * rand(0.92, 1.08), baseH: def.baseH * rand(0.92, 1.08),
      phase: rand(0, Math.PI * 2), flickSpeed: rand(4, 7.5), swaySpeed: rand(0.6, 1.5),
      swayAmt: rand(0.03, 0.08), wobbleSpeed: rand(1.0, 2.2), matRotation: rand(-0.12, 0.12),
    };
    spr.visible = false;
    flames.add(spr);
    return spr;
  };
  // Soft ambient glow behind the crisp licks: low-opacity additive, so the fire
  // still reads as a light source without washing the flame shapes themselves out.
  const glowMat = new THREE.SpriteMaterial({
    map: dotTex, color: "#ff8c30", transparent: true, depthWrite: false, fog: false,
    blending: THREE.AdditiveBlending, toneMapped: false, opacity: 0.3,
  });
  const glow = new THREE.Sprite(glowMat);
  glow.userData = { baseH: 1.1 };
  glow.position.set(0, 0.3, 0.03);
  flames.add(glow);
  flames.userData.glow = glow;

  // Bloom halo (10/07/2026, the last open step of the art pass). One additive
  // sprite, not a post-processing pass: a real bloom pass would re-tone-map every
  // toneMapped:false material in the scene (the flames, the outline, the coals),
  // drop the canvas's antialiasing and add full-screen passes on phones, all to
  // light up this one object. depthTest off so the light spills over whatever
  // stands in front of the fire, the way bloom does.
  const bloom = new THREE.Sprite(new THREE.SpriteMaterial({
    map: makeBloomTexture(), transparent: true, depthWrite: false, depthTest: false, fog: false,
    blending: THREE.AdditiveBlending, toneMapped: false, opacity: 0,
  }));
  bloom.renderOrder = 5;
  bloom.position.set(0, 0.7, 0);
  scene.add(bloom);
  flames.userData.bloom = bloom;

  LICK_DEFS.forEach((d) => makeLick(d, false));
  EMBER_DEFS.forEach((d) => makeLick(d, true));
  scene.add(flames);

  // Hot-core glow: one small, brightness- and size-capped sprite that carries the
  // "hotter at higher tiers" read without ever growing into a white blob. The
  // orange/red tongues above never recolor, so the silhouette stays readable.
  const coreMat = new THREE.SpriteMaterial({
    map: dotTex, color: "#fff6d0", transparent: true, depthWrite: false, fog: false,
    blending: THREE.AdditiveBlending, toneMapped: false,
  });
  const core = new THREE.Sprite(coreMat);
  core.userData = { baseH: 0.42 };
  core.position.set(0, 0.22, 0.04);
  flames.add(core);
  flames.userData.core = core; // stashed on the group so updateFireVisuals can find it without a new plumbed field

  // Sparks: a small bright pool recycled upward from the coals, tiny and round.
  const sparks = new THREE.Group();
  for (let i = 0; i < SPARK_COUNT; i++) {
    const mat = new THREE.SpriteMaterial({
      map: dotTex, color: "#ffb347", transparent: true, depthWrite: false, fog: false,
      blending: THREE.AdditiveBlending, toneMapped: false, opacity: 0,
    });
    const spr = new THREE.Sprite(mat);
    spr.userData = { age: 999, life: 1 };
    spr.visible = false;
    sparks.add(spr);
  }
  scene.add(sparks);

  // Dark ash disk inside the stone ring: unlit (MeshBasicMaterial ignores
  // fireLight), so the coals and flames sit on black instead of the fire washing
  // the dirt out to pale beige. No shadows, sits just above the dirt patch.
  const ash = new THREE.Mesh(new THREE.CircleGeometry(0.95, 28), new THREE.MeshBasicMaterial({ color: "#1c1714", toneMapped: false, fog: false }));
  ash.rotation.x = -Math.PI / 2;
  ash.position.y = 0.02;
  scene.add(ash);

  // Coal bed: mostly plain dark charcoal chunks, a minority glowing orange-red,
  // never lemon yellow. Half-buried (low, squashed) and varied in size/rotation.
  const coals = new THREE.Group();
  const coalGeo = new THREE.IcosahedronGeometry(1, 0);
  const CHAR_COLORS = ["#1a1210", "#201713", "#241a15", "#2a1c14"];
  for (let i = 0; i < COAL_COUNT; i++) {
    const glows = rand(0, 1) < 0.35; // minority actually pulse
    const mat = new THREE.MeshStandardMaterial({
      color: CHAR_COLORS[i % CHAR_COLORS.length], emissive: "#ff3a15", emissiveIntensity: 0,
      roughness: 1, metalness: 0, flatShading: true, toneMapped: false, fog: false,
    });
    const chunk = new THREE.Mesh(coalGeo, mat);
    const r = rand(0, 0.6), a = rand(0, Math.PI * 2), s = rand(0.06, 0.15);
    chunk.position.set(Math.sin(a) * r, s * 0.28, Math.cos(a) * r); // low, half-buried
    chunk.scale.set(s * rand(0.85, 1.15), s * rand(0.4, 0.65), s * rand(0.85, 1.15));
    chunk.rotation.set(rand(0, Math.PI), rand(0, Math.PI), rand(0, Math.PI));
    chunk.userData = { phase: rand(0, Math.PI * 2), glows };
    coals.add(chunk);
  }
  scene.add(coals);

  // Pit logs: same four-slot footprint game.js already drives (position/rotation/
  // visible per drop), now charred with glowing ends so a landed log reads as
  // burning instead of just sitting in the pit.
  const pitLogs = [];
  const endGeo = new THREE.SphereGeometry(0.13, 6, 5);
  for (let i = 0; i < 4; i++) {
    const l = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.7, 7), new THREE.MeshLambertMaterial({ color: "#2b1c10" }));
    const endA = new THREE.Mesh(endGeo, new THREE.MeshStandardMaterial({ color: "#241a12", emissive: "#ff6a24", emissiveIntensity: 0.5, flatShading: true, toneMapped: false, fog: false }));
    const endB = new THREE.Mesh(endGeo, endA.material.clone());
    endA.position.y = 0.35; endB.position.y = -0.35;
    l.add(endA, endB);
    l.userData.ends = [endA, endB];
    l.visible = false; scene.add(l); pitLogs.push(l);
  }

  return { flames, sparks, coals, pitLogs, core };
}

let clock = 0;
let sparkAcc = 0;
const CORE_CAP = 0.5; // hard ceiling on the hot-core sprite so it can brighten without ballooning
// MAX_RADIUS bounds the FOOT (ground contact), not the whole lick: the belly above
// can flare past this and tower over the ring, but no lick's base reaches past it.
// 0.75 sits well inside the stone ring's inner edge (0.95) so the flat foot never
// lands on or in front of a rock. A looser cap here let the outer tongues' bellies
// balloon into one fused blob at tier 3, losing the separate chunky-tongue
// silhouette, so this stays tight even though it leaves some belly growth on the
// table between tiers.
const MAX_RADIUS = 0.75;
const MIN_ROOM = 0.14; // floor so a far-offset lick's foot never collapses to nothing
const MAX_HEIGHT = 3.0; // tallest a tongue can stand, at any tier
const BASE_SINK = 0.16; // sinks the foot below the coal/rock rim so they occlude it

// level: state.fire.level / FIRE.hot (1.0 at the Hell's Anus line, matching the old
// cone driver). hot/tier: read straight off state.fire.hot/hotTier, already computed
// from HOT_LEVELS in game.js, so bigness stays keyed to the same thresholds without
// this module redefining them. wind: state.wind (dir + a leanAmt game.js computes).
export function updateFireVisuals(vis, { level, hot, tier, dt, flicker, wind }) {
  clock += dt;
  const { flames, sparks, coals, pitLogs } = vis;
  const core = flames.userData.core;
  const glow = flames.userData.glow;
  const growth = 0.15 + level;
  const tierBoost = tier * 0.22;
  // Tongues that carry a baked-in white band (the dominant lick and its two
  // flanking ones) scale up less with tier than the plain orange/yellow ones, so
  // the white portion of the silhouette doesn't balloon along with everything else.
  const widthBoost = 1 + tierBoost * 0.85;
  const heightBoost = 1 + tierBoost * 0.6;
  const coreWidthBoost = 1 + tierBoost * 0.3;
  const coreHeightBoost = 1 + tierBoost * 0.22;

  const leanAmt = wind && wind.active ? (wind.leanAmt || 0) : 0;
  const windX = wind ? -wind.dir.x : 0, windZ = wind ? -wind.dir.y : 0;

  flames.children.forEach((spr) => {
    if (spr === core || spr === glow) return;
    const u = spr.userData;
    const target = tier >= u.tierMin && level >= u.appearAt ? 1 : 0;
    u.show += (target - u.show) * Math.min(1, dt * 4);
    if (u.show < 0.01) { spr.visible = false; return; }
    spr.visible = true;

    const flick = 1 + Math.sin(clock * u.flickSpeed + u.phase) * 0.14 + Math.sin(clock * u.flickSpeed * 2.1 + u.phase) * 0.06;
    const wobble = 1 + Math.sin(clock * u.wobbleSpeed + u.phase * 1.7) * 0.08;
    const sway = Math.sin(clock * u.swaySpeed + u.phase * 0.6) * u.swayAmt;

    const wBoost = u.hasCore ? coreWidthBoost : widthBoost;
    const hBoost = u.hasCore ? coreHeightBoost : heightBoost;
    let h = u.baseH * growth * hBoost * flick * wobble * flicker * u.show;
    let w = u.baseW * growth * wBoost * flick * flicker * u.show;
    // Hard caps so the top tier never spills past the ring onto the chairs: none
    // stands taller than MAX_HEIGHT, and no lick's FOOT (ground contact, a fraction
    // FOOT_FRAC of the full width) reaches past MAX_RADIUS from the pit center. The
    // belly above the foot still gets the full w, so a big fire can flare and tower
    // wide above the rocks, whatever the tier math above works out to.
    h = Math.min(h, MAX_HEIGHT);
    const room = Math.max(MIN_ROOM, MAX_RADIUS - Math.hypot(u.ox, u.oz));
    w = Math.min(w, (room * 2) / FOOT_FRAC);
    spr.scale.set(w, h, 1);

    const shear = leanAmt * (h * 0.5) * 0.6;
    // Sink the anchor below the coal bed / rock rim so the front stones and coals
    // occlude the foot instead of it pasting flat over them. Scaled by h (capped at
    // BASE_SINK) so the tiny always-on ember sliver doesn't get sunk out of sight.
    const sink = Math.min(BASE_SINK, h * 0.25);
    spr.position.set(u.ox + sway + windX * shear, h * 0.46 - sink, u.oz + windZ * shear);
    spr.material.rotation = u.matRotation + Math.sin(clock * u.swaySpeed * 0.6 + u.phase) * 0.05;
  });

  // Ambient glow: same growth curve as the licks but capped low opacity, so it
  // stays a soft light-source halo and never competes with the crisp silhouette.
  const glowH = Math.min(1.8, glow.userData.baseH * growth * (1 + tierBoost * 0.5));
  glow.scale.set(glowH, glowH * 0.9, 1);
  glow.position.set(0, glowH * 0.4, 0.02);
  glow.material.opacity = Math.min(0.4, 0.15 + growth * 0.12);

  // Bloom halo: wider and brighter as the fire builds, nearly gone when it is
  // down to embers, with a slow breathing flicker so it is never a static disc.
  const bloom = flames.userData.bloom;
  const lv = Math.max(0, Math.min(1.2, level));
  const breathe = 1 + Math.sin(clock * 5.3) * 0.035 + Math.sin(clock * 11.7) * 0.02;
  const bloomSize = (2.8 + lv * 3.6 + tier * 0.8) * breathe;
  bloom.scale.set(bloomSize, bloomSize * 0.92, 1);
  bloom.position.y = 0.55 + lv * 0.5;
  bloom.material.opacity = Math.min(0.3, (0.05 + lv * 0.15 + tier * 0.02) * breathe);

  // Hot core: brightens and grows a little hotter with level/tier, but hard-capped
  // so it never becomes the dominant white shape (requirement: cap its size).
  const hotness = Math.min(1, Math.max(0, level - 0.15) * 0.9 + tier * 0.22);
  const coreH = Math.min(CORE_CAP, core.userData.baseH * growth * (1 + tier * 0.1));
  core.scale.set(coreH * 0.7, coreH, 1);
  core.position.set(0.02, coreH * 0.4 + 0.05, 0.05);
  core.material.opacity = 0.3 + hotness * 0.4;

  // Coal bed: only the "glows" minority pulse, brighter and more red-orange as the
  // fire builds, a dim red pulse when it's almost out. The rest stay plain charcoal.
  const dying = 1 - Math.min(1, level);
  const built = Math.min(1, level) * 0.6 + tier * 0.18;
  coals.children.forEach((c) => {
    if (!c.userData.glows) return;
    const pulse = 0.85 + Math.sin(clock * 2.4 + c.userData.phase) * 0.15;
    c.material.emissiveIntensity = (0.18 + built * 0.55 + dying * 0.22) * pulse;
    // Hue stays in the red/orange range (0.01 to 0.055), never toward yellow (~0.13+).
    c.material.emissive.setHSL(THREE.MathUtils.lerp(0.012, 0.05, Math.min(1, level)), 0.9, 0.42);
  });

  // Pit logs: charred ends glow with the same built/dying read as the coal bed.
  pitLogs.forEach((l) => {
    if (!l.visible) return;
    l.userData.ends.forEach((end, i) => {
      const pulse = 0.85 + Math.sin(clock * 2.2 + i * 2.1) * 0.15;
      end.material.emissiveIntensity = (0.25 + Math.min(1, level) * 0.75 + dying * 0.25) * pulse;
    });
  });

  // Sparks: spawn rate follows the fire, more of them at higher tiers.
  const rate = level <= 0.04 ? 0 : (hot ? 16 : 5 + 6 * Math.min(level, 1)) + tier * 8;
  sparkAcc += rate * dt;
  sparks.children.forEach((spr) => {
    const u = spr.userData;
    if (u.age >= u.life) {
      if (sparkAcc < 1) return;
      sparkAcc -= 1;
      u.age = 0; u.life = 0.6 + Math.random() * 0.9;
      const a = Math.random() * Math.PI * 2, r = Math.random() * 0.5;
      spr.position.set(Math.sin(a) * r, 0.15 + Math.random() * 0.2, Math.cos(a) * r);
      u.vx = (Math.random() - 0.5) * 0.5; u.vy = 1.4 + Math.random() * 1.4; u.vz = (Math.random() - 0.5) * 0.5;
      u.size = 0.05 + Math.random() * 0.06;
      spr.material.color.set(Math.random() > 0.5 ? "#ffb347" : "#ff8a2e");
      spr.visible = true;
    }
    u.age += dt;
    const k = u.age / u.life;
    spr.position.x += (u.vx + windX * 0.6) * dt;
    spr.position.z += (u.vz + windZ * 0.6) * dt;
    spr.position.y += u.vy * dt * (1 - k * 0.4);
    const s = u.size * (1 - k * 0.5);
    spr.scale.set(s, s, 1);
    spr.material.opacity = Math.sin(Math.PI * Math.min(1, k)) * 0.9;
    if (k >= 1) spr.visible = false;
  });

  // A small flicker nudge for fireLight, visual only (game.js keeps driving the
  // main intensity/color off state.fire directly).
  vis.lightNudge = Math.sin(clock * 17 + 1.3) * 0.02;
}
