// All In Jefferson, prototype 1: the fire loop on a flat plane with box campers.
import * as THREE from "three";
import { NIGHT_SECONDS, NIGHT_START_MIN, NIGHT_END_MIN, MIDNIGHT_MIN, FIRE, WIND, CAMPER, BEAR, PLAYER, LAYOUT, POWERUPS, EVENTS, HOT_LEVELS, SMOKE, DIFFICULTY, HINTS } from "./config.js?v=74";
import { initSound, coyoteYip, whoosh, growl, bang, startCrackle, setCrackle, footstep, logLand, pokeSound, buzz, playRiff, startLoop, stopMusic, playDawn, toggleMusic, musicEnabled, bearTheme, bearRideTheme, bearWomp } from "./sound.js?v=74";
import { campers as roster, pickPlayer, commitPick, snacks, emotes, comments, coolerComments } from "./campers.js?v=74";
import { buildWorld, makeCamperMesh, makeChairMesh, makeLogMesh, setSeated, stepWalkCycle, stepBearWalk, SEATED_DROP } from "./world.js?v=74";
import { updateFireVisuals } from "./fire.js?v=74";

const canvas = document.getElementById("scene");
const world = buildWorld(canvas);
const { renderer, scene, camera, fireLight, keyLight, flames, sparks, coals, bear: bearMesh, streaks, don: donMesh, alan: alanMesh, bees: beesMesh, breath: breathMesh, pitLogs, hintArrow, snackToken, stick: stickMesh, star: starMesh, starlink: starlinkMesh, trees, smoke } = world;
// Bundle for the single fire.js visual hook driven from render(): flame sprites,
// sparks, the coal bed and the pit logs, all purely cosmetic and keyed off
// state.fire's authoritative level/hot/hotTier.
const fireVis = { flames, sparks, coals, pitLogs };

const ui = {
  fireFill: document.getElementById("fire-fill"),
  fireLabel: document.getElementById("fire-label"),
  musicChip: document.getElementById("music-chip"),
  bottle: document.getElementById("bottle-chip"),
  banner: document.getElementById("banner"),
  clock: document.getElementById("clock"),
  wood: document.getElementById("wood-count"),
  gas: document.getElementById("gas-count"),
  message: document.getElementById("message"),
  playerName: document.getElementById("player-name"),
  wind: document.getElementById("wind"),
  bubbles: document.getElementById("bubbles"),
  start: document.getElementById("start"),
  startBtn: document.getElementById("start-btn"),
  select: document.getElementById("select"),
  playBtn: document.getElementById("play-btn"),
  prevBtn: document.getElementById("prev-btn"),
  nextBtn: document.getElementById("next-btn"),
  lobbyName: document.getElementById("lobby-name"),
  lobbyQuote: document.getElementById("lobby-quote"),
  lobbyEmote: document.getElementById("lobby-emote"),
  end: document.getElementById("end"),
  endTitle: document.getElementById("end-title"),
  endBody: document.getElementById("end-body"),
  restartBtn: document.getElementById("restart-btn"),
};

// ---------- State ----------
const playerData = pickPlayer();
const state = {
  phase: "start",
  t: 0,
  fire: { level: FIRE.start, pokeCd: 0, gasBoostUntil: -1, catching: [], zeroTimer: 0, hot: false, hotSeconds: 0, hotTier: 0, peakTier: 0, lastSector: null, prevSector: null, drops: 0, smothers: 0, spreads: 0 },
  bottle: { at: rand(EVENTS.bottleMin, EVENTS.bottleMax), given: false, used: false, breath: 0 },
  diff: "camp",
  burn: FIRE.burnPerSec,
  alan: { at: rand(EVENTS.alanMin, EVENTS.alanMax), running: false, t: 0, a0: 0, done: false, mesh: null, bubble: { text: "", until: 0, cls: "" } },
  stepClock: 0,
  hints: { woodEver: false, gasEver: false, lastStick: -999, lastWood: -999, lastGas: -999, donShown: false, target: null, until: 0 },
  stick: { held: false },
  beer: { available: true, thrown: false, fuse: 0, exploded: false },
  shake: 0,
  don: { mesh: null, bubble: { text: "", until: 0, cls: "" }, gaveLog: false },
  smoke: { inIt: false, coughIn: 0 },
  sky: { kind: null, t: 0, nextIn: rand(EVENTS.skyMinGap, EVENTS.skyMaxGap) },
  pokeAnim: 0,
  powerups: { woodEarned: false, gasEarned: false, gustsBlocked: 0 },
  wood: FIRE.woodPile,
  gas: FIRE.gasCount,
  gasUsed: 0,
  wind: { active: false, nextIn: rand(WIND.minGap, WIND.maxGap), remaining: 0, dir: new THREE.Vector2(1, 0), blocked: false, blockedSeconds: 0 },
  bear: { state: "idle", timer: 0, target: null, cooldownUntil: 0, from: new THREE.Vector3(), to: new THREE.Vector3(), rideBack: null, returnAt: 0 },
  events: {
    coolerIn: rand(EVENTS.coolerMinGap, EVENTS.coolerMaxGap), plateIn: rand(EVENTS.plateMinGap, EVENTS.plateMaxGap), plate: null, coyoteIn: 3,
    guitarIn: rand(EVENTS.guitarMinGap, EVENTS.guitarMaxGap), guitar: 0,
    yogurtIn: rand(EVENTS.yogurtMinGap, EVENTS.yogurtMaxGap),
    donIn: rand(EVENTS.donMinGap, EVENTS.donMaxGap), don: 0,
    snackIn: rand(EVENTS.snackMinGap, EVENTS.snackMaxGap), snack: null,
  },
  chatterIn: rand(CAMPER.chatterMin, CAMPER.chatterMax),
  message: { text: "", until: 0 },
  midnightDone: false,
  log: [],
};

const keys = new Set();
let spacePressed = false;

// Player and crew. Rebuilt when a different camper is picked on the title screen.
let player = null;
let campers = [];
function buildCrew(data) {
  if (player) scene.remove(player.mesh);
  campers.forEach((c) => { scene.remove(c.mesh); scene.remove(c.chairMesh); if (c.bubble.el) c.bubble.el.remove(); });
  ui.bubbles.innerHTML = "";
  player = { data, mesh: makeCamperMesh(data), pos: new THREE.Vector3(0, 0, 4.6), carrying: null, carryMesh: null, bubble: { text: "", until: 0, cls: "" }, stickMesh: null };
  player.mesh.position.copy(player.pos);
  scene.add(player.mesh);
  ui.playerName.textContent = data.name;
  ui.lobbyName.textContent = data.name;
  ui.lobbyName.style.animation = "none"; void ui.lobbyName.offsetWidth; ui.lobbyName.style.animation = "";
  ui.lobbyQuote.textContent = `"${data.warm}"`;
  ui.lobbyEmote.textContent = `EMOTE: ${(emotes[data.id] || "Idle").toUpperCase()}`;
  if (state.phase === "select") { player.pos.copy(LOBBY_SPOT); player.mesh.position.copy(player.pos); }

  // Everyone but the player sits. Tom W's chair stays empty until midnight.
  const seated = roster.filter((c) => c.id !== data.id);
  campers = seated.map((cd, i) => {
    const a = THREE.MathUtils.degToRad(LAYOUT.chairStartDeg + i * LAYOUT.chairStepDeg);
    const chair = new THREE.Vector3(Math.sin(a) * LAYOUT.chairRadius, 0, Math.cos(a) * LAYOUT.chairRadius);
    const chairMesh = makeChairMesh();
    chairMesh.position.copy(chair);
    chairMesh.lookAt(0, 0.45, 0);
    scene.add(chairMesh);
    const mesh = makeCamperMesh(cd);
    mesh.position.copy(chair);
    mesh.lookAt(0, 0, 0);
    scene.add(mesh);
    const c = {
      data: cd, mesh, chair, chairMesh, scoot: 0,
      comfort: CAMPER.startComfort,
      chill: cd.id === CAMPER.firstToBedId ? CAMPER.firstToBedChill : rand(CAMPER.chillMin, CAMPER.chillMax),
      fall: 0,
      state: cd.arrivesAtMidnight ? "away" : "seated",
      leaveTimer: 0,
      saidCold: false,
      walkTarget: null,
      walkTo: i % 2 === 0 ? LAYOUT.cabinDoor : LAYOUT.camperDoor,
      bubble: { text: "", until: 0, cls: "" },
    };
    if (c.state === "away") mesh.visible = false;
    return c;
  });
  window.__aij = { state, player, campers, keys, renderer, press: () => { spacePressed = true; }, speed: (window.__aij && window.__aij.speed) || 1, cfg: { FIRE, WIND, CAMPER, BEAR, EVENTS, PLAYER, LAYOUT, SMOKE, POWERUPS },
    // Headless stepping for tuning runs: advances the logic without waiting for animation frames
    step: (dt, n) => { for (let i = 0; i < n && state.phase === "playing"; i++) { update(dt); if (window.__aij.bot) window.__aij.bot(dt); } return state.phase; },
    start: () => { if (state.phase === "start") goToLobby(); if (state.phase === "select") startNight(); return state.phase; } };
}
buildCrew(playerData);

// Lobby picker: chips across the bottom, arrows on the sides, arrow keys too
const playable = roster.filter((c) => !c.arrivesAtMidnight);
const pickEl = document.getElementById("pick");
let currentPick = playerData.id;
function pickCamper(c) {
  if (state.phase !== "select" && state.phase !== "start") return;
  commitPick(currentPick, c.id);
  currentPick = c.id;
  buildCrew(c);
  pickEl.querySelectorAll(".pick-btn").forEach((x) => x.classList.toggle("on", x.dataset.id === c.id));
}
function cyclePick(delta) {
  const i = playable.findIndex((c) => c.id === currentPick);
  pickCamper(playable[(i + delta + playable.length) % playable.length]);
}
// Lobby swatches: head color (the cap, or the hair color if there's no cap,
// or skin if bald) and the top color. Visual only, reads off `look` (art pass
// step 4) instead of the old flat cap/shirt fields.
function headSwatch(c) {
  const look = c.look;
  if (!look) return c.cap;
  if (look.cap) return look.cap;
  if (look.hair && look.hair !== "bald") return look.hair.color;
  return "#e8b48f"; // bald: skin
}
function topSwatch(c) { return c.look ? c.look.topColor : c.shirt; }

playable.forEach((c) => {
  const b = document.createElement("button");
  b.className = "pick-btn" + (c.id === playerData.id ? " on" : "");
  b.dataset.id = c.id;
  b.innerHTML = `<span class="sw" style="background:${headSwatch(c)}"></span><span class="sw" style="background:${topSwatch(c)}"></span>${c.name}`;
  b.addEventListener("click", () => pickCamper(c));
  pickEl.appendChild(b);
});
ui.prevBtn.addEventListener("click", () => cyclePick(-1));
ui.nextBtn.addEventListener("click", () => cyclePick(1));

// ---------- Input ----------
window.addEventListener("keydown", (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey) return; // let the browser have its shortcuts, and never record them as held
  const k = e.key.toLowerCase();
  if (["arrowup", "arrowdown", "arrowleft", "arrowright", " ", "w", "a", "s", "d"].includes(k)) e.preventDefault();
  if (k === " " && !e.repeat) spacePressed = true;
  keys.add(k);
});
window.addEventListener("keyup", (e) => keys.delete(e.key.toLowerCase()));
// Anything that takes focus away drops every held key, so nothing sticks
window.addEventListener("blur", () => keys.clear());
document.addEventListener("visibilitychange", () => { if (document.hidden) keys.clear(); });

function goToLobby() {
  if (state.phase !== "start") return;
  ui.start.hidden = true;
  ui.select.hidden = false;
  state.phase = "select";
  player.pos.copy(LOBBY_SPOT);
  player.mesh.position.copy(player.pos);
  initSound();
  playRiff();
  ui.musicChip.textContent = musicEnabled() ? "MUSIC ON  (M)" : "MUSIC OFF  (M)";
}
const DIFF_KEY = "aij-diff";
function setDifficulty(key) {
  if (!DIFFICULTY[key]) key = "camp";
  state.diff = key;
  try { localStorage.setItem(DIFF_KEY, key); } catch (e) { /* ignore */ }
  document.querySelectorAll(".diff-btn").forEach((b) => b.classList.toggle("on", b.dataset.diff === key));
}
document.querySelectorAll(".diff-btn").forEach((b) => b.addEventListener("click", () => setDifficulty(b.dataset.diff)));
try { setDifficulty(localStorage.getItem(DIFF_KEY) || "camp"); } catch (e) { setDifficulty("camp"); }

function startNight() {
  if (state.phase !== "select") return;
  const d = DIFFICULTY[state.diff];
  state.wood = d.wood; state.gas = d.gas; state.burn = d.burn;
  ui.select.hidden = true;
  startCrackle();
  startLoop();
  document.getElementById("hud").hidden = false;
  state.phase = "playing";
  resetPose(player.mesh);
  player.pos.set(0, 0, 4.6);
  player.mesh.position.copy(player.pos);
  say(`${player.data.name}, it's 9 PM. Keep the fire going until 5:30.`, 6);
}
ui.startBtn.addEventListener("click", goToLobby);
ui.playBtn.addEventListener("click", startNight);
window.addEventListener("keydown", (e) => {
  if (e.key.toLowerCase() === "m" && !e.metaKey && !e.ctrlKey) { initSound(); const on = toggleMusic(); ui.musicChip.textContent = on ? "MUSIC ON  (M)" : "MUSIC OFF  (M)"; return; }
  if (state.phase === "start" && (e.key === " " || e.key === "Enter")) { e.preventDefault(); goToLobby(); }
  else if (state.phase === "select") {
    if (e.key === " " || e.key === "Enter") { e.preventDefault(); startNight(); }
    else if (e.key === "ArrowLeft" || e.key.toLowerCase() === "a") { e.preventDefault(); cyclePick(-1); }
    else if (e.key === "ArrowRight" || e.key.toLowerCase() === "d") { e.preventDefault(); cyclePick(1); }
  }
});

const GAME_CAM = new THREE.Vector3(0, 12.5, 14);
const GAME_LOOK = new THREE.Vector3(0, 0, 0);
const LOBBY_SPOT = new THREE.Vector3(1.9, 0, 4.3);   // forward of the empty chair so emotes do not clip it (Bryan, 09/25)
const LOBBY_CAM = new THREE.Vector3(1.0, 2.3, 10.3);   // camera and look moved with the spot, same framing
const LOBBY_LOOK = new THREE.Vector3(1.4, 1.0, 3.9);
const camLook = new THREE.Vector3(0, 1, 0);
let titleClock = 0;
function updateCamera(dt) {
  if (state.phase === "start") {
    titleClock += dt;
    const a = titleClock * 0.09;
    const target = new THREE.Vector3(Math.sin(a) * 15, 5.5 + Math.sin(titleClock * 0.3) * 0.6, Math.cos(a) * 15);
    camera.position.lerp(target, Math.min(1, dt * 3));
    camLook.lerp(new THREE.Vector3(0, 1.2, 0), Math.min(1, dt * 3));
  } else if (state.phase === "select") {
    titleClock += dt;
    camera.position.lerp(LOBBY_CAM, Math.min(1, dt * 2.2));
    camLook.lerp(LOBBY_LOOK, Math.min(1, dt * 2.2));
    keyLight.intensity += (34 - keyLight.intensity) * Math.min(1, dt * 3);
    animateEmote(player, titleClock);
  } else {
    keyLight.intensity += (0 - keyLight.intensity) * Math.min(1, dt * 3);
    camera.position.lerp(GAME_CAM, Math.min(1, dt * 1.8));
    camLook.lerp(GAME_LOOK, Math.min(1, dt * 1.8));
  }
  camera.lookAt(camLook);
  if (state.shake > 0) {
    state.shake = Math.max(0, state.shake - dt);
    const k = state.shake / EVENTS.beerShake;
    camera.position.x += (Math.random() - 0.5) * 0.5 * k;
    camera.position.y += (Math.random() - 0.5) * 0.4 * k;
  }
}

// ---------- Emotes (lobby only) ----------
function resetPose(mesh) {
  const p = mesh.userData.parts;
  mesh.rotation.set(0, 0, 0); mesh.scale.set(1, 1, 1);
  p.armL.rotation.set(0, 0, 0); p.armR.rotation.set(0, 0, 0);
  p.head.rotation.set(0, 0, 0); p.body.rotation.set(0, 0, 0);
}
function animateEmote(pl, t) {
  const m = pl.mesh, p = m.userData.parts;
  resetPose(m);
  m.position.copy(pl.pos);
  m.rotation.y = 0; // face the camera
  const bob = Math.sin(t * 3) * 0.04;
  switch (pl.data.id) {
    case "tom-s": // coffee mug sip: right arm up to the mouth, head tips back
      p.armR.rotation.x = -1.7 + Math.sin(t * 2) * 0.25; p.armR.rotation.z = -0.5;
      p.head.rotation.x = -0.15 + Math.sin(t * 2) * 0.12; m.position.y = bob; break;
    case "chris-occ": // air guitar
      p.armL.rotation.x = -1.2; p.armL.rotation.z = 0.5;
      p.armR.rotation.x = -0.9 + Math.sin(t * 12) * 0.35; p.armR.rotation.z = -0.3;
      m.rotation.y = Math.sin(t * 1.5) * 0.35; m.position.y = Math.abs(Math.sin(t * 6)) * 0.08; break;
    case "bryan-j": // bourbon toast
      p.armR.rotation.z = -2.3 + Math.sin(t * 3) * 0.12; p.armR.rotation.x = -0.4;
      m.rotation.z = Math.sin(t * 1.5) * 0.06; m.position.y = bob; break;
    case "brian-r": // pond ski: crouch, arms back, lean
      m.scale.set(1, 0.85, 1); p.armL.rotation.x = 1.0; p.armR.rotation.x = 1.0;
      p.body.rotation.x = 0.25; p.head.rotation.x = 0.15;
      m.rotation.z = Math.sin(t * 2.2) * 0.18; m.position.y = Math.abs(Math.sin(t * 4.4)) * 0.05; break;
    case "perry-s": { // cheese puff toss into the mouth
      const k = (t * 1.4) % 1; const toss = k < 0.5 ? -0.6 - k * 3.2 : -2.2 + (k - 0.5) * 3.2;
      p.armR.rotation.x = toss; p.head.rotation.x = -0.35; m.position.y = bob; break; }
    case "johnny-d": { // cornhole toss: underhand swing
      const k = (t * 1.1) % 1; const swing = k < 0.4 ? 0.9 - k * 7 : k < 0.6 ? -1.9 : -1.9 + (k - 0.6) * 7;
      p.armR.rotation.x = swing; m.rotation.y = -0.4 + Math.min(0.6, Math.max(0, (k - 0.3))) * 0.8;
      m.position.y = k > 0.35 && k < 0.5 ? 0.06 : 0; break; }
    case "spitty": // yogurt spoon
      p.armL.rotation.x = -1.3; p.armL.rotation.z = 0.35;
      p.armR.rotation.x = -1.2 + Math.sin(t * 5) * 0.55; p.armR.rotation.z = -0.4;
      p.head.rotation.x = -0.1; m.position.y = bob; break;
    case "razoo": // trumpet solo: both arms up front, lean back, bounce
      p.armL.rotation.x = -1.6; p.armR.rotation.x = -1.5; p.armL.rotation.z = 0.25; p.armR.rotation.z = -0.25;
      p.body.rotation.x = -0.15; p.head.rotation.x = -0.35 + Math.sin(t * 9) * 0.06;
      m.position.y = Math.abs(Math.sin(t * 7)) * 0.07; break;
    case "scott-k": // black hawk: arms out, spin, hover
      p.armL.rotation.z = -1.5; p.armR.rotation.z = 1.5;   // signs swapped 09/25: the old ones folded the arms behind his chest
      m.rotation.y = t * 4.5; m.position.y = 0.35 + Math.sin(t * 2) * 0.12; break;
    default:
      m.position.y = bob;
  }
}
ui.restartBtn.addEventListener("click", () => location.reload());


// ---------- Loop ----------
let last = performance.now();
let errorCount = 0;
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  try {
    if (state.phase === "playing") {
      const steps = Math.max(1, Math.min(60, Math.round(window.__aij.speed || 1)));
      for (let i = 0; i < steps; i++) { update(dt); if (window.__aij.bot) window.__aij.bot(dt); if (state.phase !== "playing") break; }
    }
    updateCamera(dt);
    guardNumbers();
    render(dt);
  } catch (err) {
    errorCount += 1;
    console.error("[AIJ] frame error", err);
    if (errorCount <= 3) reportError(err);
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// A NaN anywhere in a position makes the whole scene vanish with no error. Catch it and snap back.
function guardNumbers() {
  if (player && !Number.isFinite(player.pos.x + player.pos.y + player.pos.z)) { player.pos.set(0, 0, 4.6); player.mesh.position.copy(player.pos); reportError(new Error("player position went NaN, reset")); }
  if (!Number.isFinite(state.fire.level)) { state.fire.level = FIRE.start; reportError(new Error("fire level went NaN, reset")); }
  campers.forEach((c) => {
    if (!Number.isFinite(c.mesh.position.x + c.mesh.position.z)) { c.mesh.position.copy(c.chair); reportError(new Error(`${c.data.name} position went NaN, reset`)); }
    if (!Number.isFinite(c.comfort)) c.comfort = CAMPER.startComfort;
  });
}
function reportError(err) {
  const el = document.getElementById("errbox");
  if (!el) return;
  el.hidden = false;
  el.textContent = `Something hiccupped and was caught: ${err.message}. Tell Bryan. The game kept going.`;
  clearTimeout(reportError.t);
  reportError.t = setTimeout(() => { el.hidden = true; }, 8000);
}
window.addEventListener("error", (e) => reportError(e.error || new Error(e.message)));

// Lost WebGL context: the logic keeps running (sounds still fire) but the picture freezes.
// preventDefault lets the browser restore the context; three.js re-uploads what it needs.
canvas.addEventListener("webglcontextlost", (e) => {
  e.preventDefault();
  reportError(new Error("graphics context lost, waiting for the browser to restore it"));
  state.log.push(`Graphics context lost at ${clockText()}`);
});
canvas.addEventListener("webglcontextrestored", () => {
  reportError(new Error("graphics context restored"));
  renderer.resetState();
});

function update(dt) {
  state.t += dt;
  updatePlayer(dt);
  updateFire(dt);
  updateWind(dt);
  updateCampers(dt);
  updateEvents(dt);
  updateSky(dt);
  updateHints(dt);
  updateBear(dt);
  animateBearWalk(dt);
  updateMidnight();
  checkEnd();
}

// Bear leg swing, purely visual: driven by how far bearMesh actually moved
// this frame (in.../out/ride/scared all update its position via lerpVectors).
let bearLastPos = null;
function animateBearWalk(dt) {
  bearLastPos = bearLastPos || bearMesh.position.clone();
  const moved = bearMesh.visible ? bearMesh.position.distanceTo(bearLastPos) : 0;
  bearLastPos.copy(bearMesh.position);
  stepBearWalk(bearMesh, moved, dt);
}

// ---------- Player ----------
function updatePlayer(dt) {
  const v = new THREE.Vector3();
  if (keys.has("arrowup") || keys.has("w")) v.z -= 1;
  if (keys.has("arrowdown") || keys.has("s")) v.z += 1;
  if (keys.has("arrowleft") || keys.has("a")) v.x -= 1;
  if (keys.has("arrowright") || keys.has("d")) v.x += 1;
  // Smoke trap: downwind of the fire during a gust, inside the stream
  const w = state.wind;
  let inSmoke = false;
  if (w.active) {
    const along = -(player.pos.x * w.dir.x + player.pos.z * w.dir.y);      // distance downwind
    const lateral = Math.abs(player.pos.x * -w.dir.y + player.pos.z * w.dir.x);
    inSmoke = along > 0.8 && along < SMOKE.reach && lateral < SMOKE.halfWidth;
  }
  if (inSmoke && !state.smoke.inIt) say("You're in the smoke. Get out of it.", 3);
  state.smoke.inIt = inSmoke;
  if (inSmoke) {
    state.smoke.coughIn -= dt;
    if (state.smoke.coughIn <= 0) { state.smoke.coughIn = 1.2; pbubble(pick(["*cough*", "*cough* *cough*", "*hack*"]), 1.1, "cold"); }
  }

  let movedDist = 0;
  if (v.lengthSq() > 0) {
    v.normalize().multiplyScalar((player.carrying ? PLAYER.carrySpeed : PLAYER.speed) * (inSmoke ? SMOKE.slow : 1) * dt);
    state.stepClock += dt;
    if (state.stepClock >= (player.carrying ? 0.42 : 0.32)) { state.stepClock = 0; footstep(); }
    const next = player.pos.clone().add(v);
    if (next.lengthSq() < 0.0001) next.set(0, 0, PLAYER.minRadius);
    const r = next.length();
    if (r < PLAYER.minRadius) next.setLength(PLAYER.minRadius);
    if (r > PLAYER.maxRadius) next.setLength(PLAYER.maxRadius);
    // A camper standing at the cooler is in the way
    campers.forEach((c) => {
      if (c.state !== "atCooler" && c.state !== "toCooler") return;
      const away = next.clone().sub(c.mesh.position); away.y = 0;
      if (away.lengthSq() < 0.0001) away.set(0.7, 0, 0.7);
      if (away.length() < 0.95) { next.copy(c.mesh.position).add(away.setLength(0.95)); next.y = 0; }
    });
    movedDist = player.pos.distanceTo(next);
    player.pos.copy(next);
    player.mesh.rotation.y = Math.atan2(v.x, v.z);
  }
  player.mesh.position.copy(player.pos);
  // Legs swing (and arms too, unless the poker is in hand or something's being
  // carried) purely from how far the player actually moved this frame.
  stepWalkCycle(player.mesh, movedDist, dt, !!player.carrying || state.stick.held);

  const nearFire = player.pos.length() < PLAYER.minRadius + PLAYER.reach;
  const nearWood = dist2(player.pos, LAYOUT.woodPile) < PLAYER.reach;
  const nearGas = dist2(player.pos, LAYOUT.gasCan) < PLAYER.reach;
  const nearStick = !state.stick.held && dist2(player.pos, LAYOUT.stick) < PLAYER.reach;
  const nearCooler = dist2(player.pos, LAYOUT.cooler) < PLAYER.reach + 0.2;
  const nearDon = donMesh.visible && !player.carrying && dist2(player.pos, donMesh.position) < PLAYER.reach + 0.6;
  ui.bottle.hidden = !(state.bottle.given && !state.bottle.used);

  // Contextual hint
  let hint = "";
  if (player.carrying === "log") hint = nearFire ? "Space: drop the log on the fire" : "Carry the log to the fire";
  else if (player.carrying === "gas") hint = nearFire ? "Space: pour the gas (careful)" : nearGas ? "Space: put the gas back" : "Carry the gas to the fire";
  else if (player.carrying === "beer") hint = nearFire ? (state.fire.level > FIRE.hot ? "Space: toss the full beer in. It's hot enough." : "Space: toss it in (it needs Hell's Anus to go off)") : "Carry the full beer to the fire. Don't drink it.";
  else if (nearCooler && state.beer.available && !(nearWood && state.wood > 0)) hint = "Space: grab a full, unopened beer";
  else if (nearStick) hint = "Space: grab the poker stick";
  else if (nearWood) hint = state.wood > 0 ? "Space: grab a log" : "The wood pile is empty";
  else if (nearGas) hint = state.gas > 0 ? "Space: grab the gas can" : "The gas can is empty";
  else if (nearDon) hint = state.don.gaveLog ? "Don M has nothing else for you." : "Space: see what Don M wants";
  else if (nearFire && state.bottle.given && !state.bottle.used) hint = "Space: take a swig and blow it into the fire";
  else if (nearFire && !state.stick.held) hint = "You need the poker stick. It's leaning by the wood pile.";
  else if (nearFire) hint = state.fire.pokeCd > 0 ? "Poker is hot, wait a second" : "Space: poke the fire";
  if (inSmoke) hint = "*cough* You can't do anything in the smoke.";
  setHint(hint);

  if (!spacePressed) return;
  spacePressed = false;
  if (inSmoke) return;

  if (nearDon) {
    if (!state.don.gaveLog) {
      state.don.gaveLog = true;
      player.carrying = "log"; showCarry("log");
      bubble(state.don, "Gentlemen. Here.", 4, "");
      say("Don M hands you a log and goes back to standing there.", 5);
      state.log.push("Don M gave a log");
    } else bubble(state.don, "Gentlemen.", 2, "");
    return;
  }
  if (nearStick && !player.carrying) {
    state.stick.held = true;
    stickMesh.visible = false;
    const held = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 1.3, 6), new THREE.MeshLambertMaterial({ color: "#6b4a2b" }));
    held.position.set(0, -0.55, 0.35); held.rotation.x = -1.1;
    player.mesh.userData.parts.armR.add(held);
    player.stickMesh = held;
    showBanner("YOU HAVE GANDALF");
    say("You have Gandalf.", 3);
    return;
  }

  if (player.carrying === "log" && nearFire) {
    player.carrying = null; dropCarry();
    const sector = Math.round(Math.atan2(player.pos.x, player.pos.z) / (Math.PI / 4)) & 7;
    const f = state.fire;
    let heat = FIRE.logHeat, dur = FIRE.logCatchSeconds, dip = FIRE.logDip, smother = false;
    if (sector === f.lastSector) {
      heat *= FIRE.smotherHeat; dur = FIRE.smotherCatch; dip = FIRE.smotherDip; f.smothers += 1; smother = true;
      say("Same spot. That's smothering it. Spread the wood around the pit.", 4);
    } else if (f.lastSector !== null && sector !== f.prevSector) {
      heat *= FIRE.spreadBonus; f.spreads += 1;
      say("Nice spread. That one caught fast.", 3);
    } else {
      say("The log lands. Give it a second to catch.", 3);
    }
    f.prevSector = f.lastSector; f.lastSector = sector;
    f.level = Math.max(0, f.level - dip);
    f.catching.push({ t: dur, dur, heat, smother }); // smother flag is visual only, read by updateSmoke below
    const pl = pitLogs[f.drops % pitLogs.length]; f.drops += 1;
    const a = sector * Math.PI / 4;
    pl.position.set(Math.sin(a) * 0.5, 0.22, Math.cos(a) * 0.5); pl.rotation.set(0, a + Math.PI / 2, Math.PI / 2); pl.visible = true;
    logLand();
  } else if (player.carrying === "gas" && nearFire) {
    player.carrying = null; dropCarry();
    state.gas -= 1; state.gasUsed += 1;
    state.fire.level = Math.min(FIRE.max, state.fire.level + FIRE.gasHeat);
    state.fire.gasBoostUntil = state.t + FIRE.gasBurnSeconds;
    const victim = pick(campers.filter((c) => c.state === "seated"));
    say(victim ? `FIREBALL. ${victim.data.name} has no eyebrows. It'll burn hot, and fast.` : "FIREBALL. It'll burn hot, and fast.", 5);
    campers.forEach((c) => { if (c.state === "seated") c.comfort = Math.min(100, c.comfort + 8); });
    state.log.push(`Gas at ${clockText()}`);
    whoosh();
    scareBear();
  } else if (player.carrying === "beer" && nearFire) {
    player.carrying = null; dropCarry();
    state.beer.thrown = true;
    if (state.fire.level > FIRE.hot) { state.beer.fuse = EVENTS.beerFuse; say("Full beer in the fire. Everybody wait for it...", 4); }
    else { state.beer.fuse = 0; say("It just sat there and hissed. Waste of a beer.", 4); state.log.push("Wasted a beer"); }
  } else if (!player.carrying && nearCooler && state.beer.available && !(nearWood && state.wood > 0)) {
    state.beer.available = false; player.carrying = "beer"; showCarry("beer");
    say("A full one. Unopened. You know what to do.", 4);
  } else if (player.carrying === "gas" && nearGas) {
    player.carrying = null; dropCarry();
  } else if (!player.carrying && nearWood && state.wood > 0) {
    state.wood -= 1; player.carrying = "log"; showCarry("log"); state.hints.woodEver = true;
  } else if (!player.carrying && nearGas && state.gas > 0) {
    player.carrying = "gas"; showCarry("gas"); state.hints.gasEver = true;
  } else if (!player.carrying && nearFire && state.bottle.given && !state.bottle.used) {
    state.bottle.used = true;
    state.bottle.breath = 1.7;
    breathMesh.visible = true;
    state.fire.level = Math.min(FIRE.max, state.fire.level + FIRE.bottleFlare);
    showBanner("FIRE BREATHER");
    say(`${player.data.name} takes a swig and blows it into the fire. The tree line lights up.`, 5);
    campers.forEach((c) => { if (c.state === "seated") c.comfort = Math.min(100, c.comfort + 10); });
    state.log.push(`Fire-breathing at ${clockText()}`);
    whoosh();
    scareBear();
  } else if (!player.carrying && nearFire && state.stick.held && state.fire.pokeCd <= 0) {
    state.fire.level = Math.min(FIRE.max, state.fire.level + FIRE.pokeHeat);
    state.fire.pokeCd = FIRE.pokeCooldown;
    state.pokeAnim = 0.4;
    pokeSound();
    scareBear();
  }
}

function showCarry(kind) {
  dropCarry();
  const m = kind === "log" ? makeLogMesh()
    : kind === "beer" ? new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.32, 10), new THREE.MeshLambertMaterial({ color: "#c0c8d0" }))
    : new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.45, 0.28), new THREE.MeshLambertMaterial({ color: "#d62828" }));
  m.position.set(0.45, 0.95, 0.1);
  player.mesh.add(m);
  player.carryMesh = m;
}
function dropCarry() {
  if (player.carryMesh) { player.mesh.remove(player.carryMesh); player.carryMesh = null; }
}

// ---------- Fire ----------
function updateFire(dt) {
  const f = state.fire;
  let burn = state.burn;
  if (state.t < f.gasBoostUntil) burn *= FIRE.gasBurnMultiplier;
  if (f.level > FIRE.hot) burn *= FIRE.hotBurnMultiplier;
  if (state.wind.active && !state.wind.blocked) burn += WIND.extraBurnPerSec;
  f.level -= burn * dt;
  for (let i = f.catching.length - 1; i >= 0; i--) {
    const c = f.catching[i];
    const step = Math.min(dt, c.t);
    f.level += (c.heat / c.dur) * step;
    c.t -= step;
    if (c.t <= 0) f.catching.splice(i, 1);
  }
  f.level = THREE.MathUtils.clamp(f.level, 0, FIRE.max);
  f.pokeCd = Math.max(0, f.pokeCd - dt);
  if (f.level <= BEAR.fireThreshold) f.zeroTimer += dt; else f.zeroTimer = 0;

  // Hell's Anus
  const hotNow = f.level > FIRE.hot;
  let tier = 0;
  HOT_LEVELS.forEach((h, i) => { if (f.level > h.at) tier = i + 1; });
  if (tier > f.hotTier && state.bottle.breath <= 0) {
    const name = HOT_LEVELS[tier - 1].name;
    say(tier === 1 ? `${name}. Nobody at this fire has eyebrows.` : tier === 2 ? `${name}. The chairs are moving on their own.` : `${name}. Somebody call Jefferson.`, 4);
    showBanner(name);
  }
  f.hotTier = tier;
  f.peakTier = Math.max(f.peakTier, tier);
  f.hot = hotNow;
  if (hotNow) {
    f.hotSeconds += dt;
    if (!state.powerups.woodEarned && f.hotSeconds >= POWERUPS.woodHotSeconds) {
      state.powerups.woodEarned = true;
      state.wood += POWERUPS.woodBonus;
      say(`Johnny D remembered the pallet behind the shed. +${POWERUPS.woodBonus} wood.`, 6);
      const jd = campers.find((c) => c.data.id === "johnny-d");
      if (jd && jd.mesh.visible) bubble(jd, "There's a whole pallet behind the shed!", 5, "");
      state.log.push("Johnny D found the pallet");
    }
  }
}

// ---------- Wind ----------
function updateWind(dt) {
  const w = state.wind;
  if (!w.active) {
    w.nextIn -= dt;
    if (w.nextIn <= 0) {
      w.active = true;
      w.remaining = WIND.gustSeconds;
      const a = Math.random() * Math.PI * 2;
      w.dir.set(Math.sin(a), Math.cos(a)); // direction the wind comes FROM
      say(`Wind gust from the ${compass(w.dir)}. Stand between it and the fire.`, 4);
    }
  } else {
    w.remaining -= dt;
    const p = new THREE.Vector2(player.pos.x, player.pos.z);
    const d = p.length();
    w.blocked = d > 0.01 && d <= WIND.blockDistance && p.normalize().dot(w.dir) >= WIND.blockDot;
    if (w.blocked) w.blockedSeconds += dt;
    if (w.remaining <= 0) {
      w.active = false; w.nextIn = rand(WIND.minGap, WIND.maxGap); w.blocked = false;
      if (w.blockedSeconds >= WIND.gustSeconds * 0.8) {
        state.powerups.gustsBlocked += 1;
        if (!state.powerups.gasEarned && state.powerups.gustsBlocked >= POWERUPS.gasGustsBlocked) {
          state.powerups.gasEarned = true;
          state.gas += POWERUPS.gasBonus;
          const finder = pick(campers.filter((c) => c.state === "seated")) || player;
          say(`${finder.data.name} found a gas can in the truck. +${POWERUPS.gasBonus} gas.`, 6);
          state.log.push("Earned the gas can");
        } else if (!state.powerups.gasEarned) {
          say(`Blocked that one. ${POWERUPS.gasGustsBlocked - state.powerups.gustsBlocked} more and somebody checks the truck.`, 4);
        }
      }
      w.blockedSeconds = 0;
    }
  }
  const lean = w.active ? Math.min(1, w.remaining / 1.5) * Math.min(1, (WIND.gustSeconds - w.remaining) / 1.0) : 0;
  w.leanAmt = lean; // read by fire.js to shear the flame sprites the same way the streaks lean
  const perp = new THREE.Vector2(-w.dir.y, w.dir.x);
  streaks.forEach((st) => {
    st.visible = w.active;
    if (!w.active) return;
    const u = st.userData;
    const prog = ((state.t * u.speed * 0.45) + u.phase) % 1;         // 0 at the source side, 1 past the fire
    const along = -7 + prog * 14;                                      // distance along the wind, source side negative
    const swirl = Math.sin(prog * Math.PI * 4 + u.phase * 6.28) * u.amp;
    const x = -w.dir.x * along + perp.x * (u.lane + swirl);
    const z = -w.dir.y * along + perp.y * (u.lane + swirl);
    st.position.set(x, u.h + Math.sin(prog * 9 + u.phase * 3) * 0.25, z);
    const slope = Math.cos(prog * Math.PI * 4 + u.phase * 6.28) * u.amp * 4 / 14;
    const dx = -w.dir.x + perp.x * slope, dz = -w.dir.y + perp.y * slope;
    st.rotation.y = Math.atan2(-dz, dx);
    st.material.opacity = 0.55 * lean * Math.sin(prog * Math.PI);
  });
  trees.forEach((tree, i) => {
    const k = 0.14 * lean * (0.8 + (i % 3) * 0.1);
    tree.rotation.x = -w.dir.y * k;
    tree.rotation.z = w.dir.x * k;
  });
  ui.wind.hidden = !w.active;
  if (w.active) ui.wind.textContent = w.blocked ? "WIND: you're blocking it" : `WIND from the ${compass(w.dir)}. Stand between it and the fire.`;
}

// ---------- Campers ----------
function updateCampers(dt) {
  const fire = state.fire.level;
  campers.forEach((c) => {
    if (c.state === "seated" || c.state === "leaving") {
      let rate = ((fire - CAMPER.neutralFire) / 25) * c.chill;
      if (rate > 0) rate *= CAMPER.gainMultiplier; else rate *= CAMPER.lossMultiplier;
      if (state.events.guitar > 0) rate += EVENTS.guitarWarmPerSec;
      c.comfort = THREE.MathUtils.clamp(c.comfort + rate * dt, 0, 100);

      if (c.comfort < CAMPER.coolBelow && !c.saidCold) { c.saidCold = true; bubble(c, c.data.cold, 4, "cold"); }
      if (c.comfort > CAMPER.coolBelow + 15) c.saidCold = false;

      if (c.state === "seated" && c.comfort < CAMPER.coldBelow) {
        c.state = "leaving"; c.leaveTimer = CAMPER.leaveGraceSeconds;
        bubble(c, c.forcedLine || c.data.leaving, CAMPER.leaveGraceSeconds, "leaving");
        c.forcedLine = null;
      } else if (c.state === "leaving") {
        if (c.comfort > CAMPER.coldBelow + 10) { c.state = "seated"; c.bubble.until = 0; say(`${c.data.name} sits back down.`, 3); }
        else {
          c.leaveTimer -= dt;
          if (c.leaveTimer <= 0) { c.state = "walking"; c.walkTarget = new THREE.Vector3(c.walkTo.x, 0, c.walkTo.z); state.log.push(`${c.data.name} went to bed at ${clockText()}`); say(`${c.data.name} went to bed.`, 4); }
        }
      }
    }
    if (c.state === "walking") {
      if (!c.walkTarget) c.walkTarget = new THREE.Vector3(c.walkTo.x, 0, c.walkTo.z);
      if (walkToward(c.mesh, c.walkTarget, 2.2 * dt)) { c.state = "gone"; c.mesh.visible = false; }
    }
    if (c.state === "arriving") {
      if (walkToward(c.mesh, c.chair, 2.2 * dt)) { c.state = "seated"; c.mesh.position.copy(c.chair); c.mesh.lookAt(0, 0, 0); }
    }
    if (c.state === "toCooler") {
      const target = new THREE.Vector3(LAYOUT.cooler.x - 0.9, 0, LAYOUT.cooler.z + 0.2);
      if (walkToward(c.mesh, target, 2.0 * dt)) { c.state = "atCooler"; c.eventTimer = EVENTS.coolerStaySeconds; c.mesh.lookAt(LAYOUT.cooler.x, 0, LAYOUT.cooler.z); bubble(c, coolerLine(c), 5, ""); }
    } else if (c.state === "atCooler") {
      c.eventTimer -= dt;
      if (c.eventTimer <= 0) c.state = "arriving";
    }
    // Chair scoot: back away from Hell's Anus, creep back in as it cools
    const wantScoot = state.fire.hot ? 1 : 0;
    c.scoot += (wantScoot - c.scoot) * Math.min(1, dt * 0.9);
    const out = c.chair.clone().setLength(c.chair.length() + c.scoot * CAMPER.scootDistance);
    c.chairMesh.position.copy(out);
    if (c.state === "seated" || c.state === "leaving") { c.mesh.position.x = out.x; c.mesh.position.z = out.z; }
    // Legs (and arms) swing purely from how far this camper actually moved this
    // frame, so walking to the cooler, arriving back and heading to bed all get
    // a walk cycle for free; seated/leaving skip it (their legs are posed above).
    if (c.state !== "seated" && c.state !== "leaving") {
      c.lastPos = c.lastPos || c.mesh.position.clone();
      const moved = c.mesh.position.distanceTo(c.lastPos);
      c.lastPos.copy(c.mesh.position);
      stepWalkCycle(c.mesh, moved, dt, false);
    }
    applyPosture(c, dt);
  });

  // Chatter: warm lines mixed with random comments
  state.chatterIn -= dt;
  if (state.chatterIn <= 0) {
    state.chatterIn = rand(CAMPER.chatterMin, CAMPER.chatterMax);
    const warm = campers.filter((c) => c.state === "seated" && c.comfort >= CAMPER.coolBelow);
    if (Math.random() < EVENTS.chatterRandomChance) {
      const pool = comments.filter((k) => !k.who || warm.some((c) => c.data.id === k.who));
      const k = pick(pool);
      const c = k && (k.who ? warm.find((c) => c.data.id === k.who) : pick(warm));
      if (c) { bubble(c, k.text, 4, ""); if (k.sky) startSky(k.sky); }
    } else {
      const c = pick(warm);
      if (c) bubble(c, c.data.warm, 4, "");
    }
  }
}

function applyPosture(c, dt) {
  const m = c.mesh, p = m.userData.parts;
  if (c.state === "seated" && c.fall > 0) {
    // Tipped over backwards, chair and all, then climbs back up. Legs stay bent
    // from whatever seated pose they were already in; only the whole group tips.
    const k = c.fall > 0.5 ? 1 : c.fall / 0.5;
    m.rotation.x = -1.35 * k; m.position.y = SEATED_DROP + 0.35 * k; m.scale.set(1, 1, 1); m.rotation.z = 0;
    p.body.rotation.set(0, 0, 0); p.head.rotation.set(0, 0, 0);
    return;
  }
  if (c.state === "seated") {
    // Real sitting: hips bent onto the chair, thighs forward, shins to the ground.
    // The cold hunch and relaxed lean now pivot the torso/head (their own joints),
    // not the whole standing-height group, so the seat's feet stay planted.
    setSeated(m, true);
    const cold = c.comfort < CAMPER.coolBelow;
    m.scale.set(1, cold ? 0.9 : 1, 1);
    m.rotation.x = 0; m.rotation.z = 0;
    const lean = cold ? 0.28 : -0.12;
    p.body.rotation.x = lean; p.head.rotation.x = lean * 0.6;
    p.body.rotation.z = cold ? Math.sin(state.t * 14) * 0.03 : 0;
  } else if (c.state === "leaving") {
    setSeated(m, false);
    m.position.y = 0.15 + Math.abs(Math.sin(state.t * 6)) * 0.08;
    m.scale.set(1, 1, 1);
    m.rotation.x = 0; m.rotation.z = 0;
    p.body.rotation.set(0, 0, 0); p.head.rotation.set(0, 0, 0);
  } else {
    setSeated(m, false);
    m.position.y = 0; m.scale.set(1, 1, 1); m.rotation.x = 0; m.rotation.z = 0;
    p.body.rotation.set(0, 0, 0); p.head.rotation.set(0, 0, 0);
  }
}

// Move a camper one step toward a target, sliding around the fire pit instead of through it.
// Returns true on arrival.
const FIRE_KEEPOUT = 1.9;
function walkToward(mesh, target, step) {
  const to = target.clone().sub(mesh.position); to.y = 0;
  if (to.length() <= step) return true;
  const next = mesh.position.clone().add(to.setLength(step));
  const r = Math.hypot(next.x, next.z);
  if (r < FIRE_KEEPOUT) {
    // push out to the keep-out ring, then nudge along it in the direction of travel
    const ang = Math.atan2(next.x, next.z);
    const cross = mesh.position.x * to.z - mesh.position.z * to.x;
    const turn = (cross > 0 ? -1 : 1) * step / FIRE_KEEPOUT;
    next.set(Math.sin(ang + turn) * FIRE_KEEPOUT, 0, Math.cos(ang + turn) * FIRE_KEEPOUT);
  }
  mesh.position.x = next.x; mesh.position.z = next.z;
  mesh.lookAt(target.x, 0, target.z);
  return false;
}

// ---------- Events: cooler run, paper plate, coyotes ----------
function coolerLine(c) {
  if (c.data.id === "perry-s") return "Anyone interested in some 'Great Value' cheese puffs?";
  if (c.data.id === "bryan-j") return "Who used all the big ice?";
  if (c.data.id === "razoo") return "Re-icing the IPA log.";
  return pick(coolerComments);
}
function updateEvents(dt) {
  const ev = state.events;
  // Cooler run: a warm camper wanders to the cooler and stands in your way
  ev.coolerIn -= dt;
  if (ev.coolerIn <= 0) {
    ev.coolerIn = rand(EVENTS.coolerMinGap, EVENTS.coolerMaxGap);
    const busy = campers.some((c) => c.state === "toCooler" || c.state === "atCooler");
    const pool = busy ? [] : campers.filter((c) => c.state === "seated" && c.comfort >= CAMPER.coolBelow);
    const prefer = pool.filter((c) => ["perry-s", "bryan-j", "razoo"].includes(c.data.id));
    const c = pick(prefer.length && Math.random() < 0.7 ? prefer : pool);
    if (c) { c.state = "toCooler"; c.mesh.position.y = 0; c.mesh.scale.set(1, 1, 1); c.mesh.rotation.set(0, 0, 0); }
  }
  // Paper plate: Tom S (or whoever is warm) tosses one in. Flare, then a dip.
  ev.plateIn -= dt;
  if (ev.plateIn <= 0 && !ev.plate) {
    ev.plateIn = rand(EVENTS.plateMinGap, EVENTS.plateMaxGap);
    const pool = campers.filter((c) => c.state === "seated");
    const tom = pool.find((c) => c.data.id === "tom-s");
    const c = tom || pick(pool);
    if (c) {
      bubble(c, "Watch this.", 2.5, "");
      ev.plate = { t: 0, who: c.data.name };
    }
  }
  if (ev.plate) {
    ev.plate.t += dt;
    if (ev.plate.t >= 1.5 && !ev.plate.flared) {
      ev.plate.flared = true;
      state.fire.level = Math.min(FIRE.max, state.fire.level + EVENTS.plateFlare);
      say(`${ev.plate.who} threw a paper plate on the fire. Big flare, then nothing.`, 4);
    }
    if (ev.plate.flared) {
      const step = Math.min(dt, 4.5 - ev.plate.t);
      const total = ev.plate.wrapper ? EVENTS.wrapperDip + EVENTS.wrapperFlare : EVENTS.plateDip + EVENTS.plateFlare;
      if (step > 0) state.fire.level = Math.max(0, state.fire.level - total / 3 * step);
    }
    if (ev.plate.t >= 4.5) ev.plate = null;
  }
  // Guitar: Chris plays and everyone warms up for a while
  ev.guitarIn -= dt;
  if (ev.guitarIn <= 0 && ev.guitar <= 0) {
    ev.guitarIn = rand(EVENTS.guitarMinGap, EVENTS.guitarMaxGap);
    const chris = campers.find((c) => c.data.id === "chris-occ" && c.state === "seated");
    if (chris) { ev.guitar = EVENTS.guitarSeconds; bubble(chris, "Guitar's coming out.", 4, ""); say("Chris is playing. Everybody's warmer for a minute.", 4); }
  }
  if (ev.guitar > 0) ev.guitar -= dt;

  // Bologna Yogurt: Spitty offers, one guy stands up on principle. Save him with fire.
  ev.yogurtIn -= dt;
  if (ev.yogurtIn <= 0) {
    ev.yogurtIn = rand(EVENTS.yogurtMinGap, EVENTS.yogurtMaxGap);
    const spitty = campers.find((c) => c.data.id === "spitty" && c.state === "seated");
    const pool = campers.filter((c) => c.state === "seated" && c.data.id !== "spitty");
    const mark = pick(pool);
    if (spitty && mark) {
      bubble(spitty, spitty.data.warm, 4, "");
      mark.comfort = Math.min(mark.comfort, CAMPER.coldBelow - 1);
      mark.forcedLine = "Not the yogurt. I'm out.";
      say(`Spitty broke out the Bologna Yogurt. ${mark.data.name} is standing up on principle.`, 5);
    }
  }

  // Don M: appears between two trees, stands there, leaves. No effect.
  ev.donIn -= dt;
  if (ev.donIn <= 0 && ev.don <= 0) {
    ev.donIn = rand(EVENTS.donMinGap, EVENTS.donMaxGap);
    ev.don = EVENTS.donSeconds;
    const a = rand(0.6, 5.6);
    donMesh.position.set(Math.sin(a) * EVENTS.donRadius, 0, Math.cos(a) * EVENTS.donRadius);
    state.don.gaveLog = false;
    donMesh.lookAt(0, 0, 0);
    donMesh.visible = true;
    state.don.mesh = donMesh;
    bubble(state.don, "Gentlemen!", 4, "");
    const spotter = pick(campers.filter((c) => c.state === "seated"));
    if (spotter) setTimeout(() => bubble(spotter, "Is that Don M?", 4, ""), 1500);
    say("Don M is standing at the tree line. He's not coming over. You could go over.", 5);
    state.log.push("Don M sighting");
  }
  if (ev.don > 0) { ev.don -= dt; if (ev.don <= 0) donMesh.visible = false; }

  // Snacks: someone offers, it hops chair to chair, the last guy tosses the wrapper in
  ev.snackIn -= dt;
  if (ev.snackIn <= 0 && !ev.snack) {
    ev.snackIn = rand(EVENTS.snackMinGap, EVENTS.snackMaxGap);
    const ring = campers.filter((c) => c.state === "seated" && c.data.id !== "spitty");
    if (ring.length >= 2) {
      const start = Math.floor(Math.random() * ring.length);
      const order = ring.slice(start).concat(ring.slice(0, start));
      const offerer = order[0];
      ev.snack = { order, i: 0, t: 0, done: false };
      bubble(offerer, `Who wants ${snacks[offerer.data.id] || "some of this"}?`, 4, "");
      snackToken.visible = true;
    }
  }
  if (ev.snack && ev.snack.throwing) {
    // Last guy winds up and lobs the (now-restyled) wrapper into the pit; it
    // flares on landing, not on release.
    const sn = ev.snack;
    sn.t += dt;
    const k = Math.min(1, sn.t / EVENTS.wrapperThrowSeconds);
    snackToken.position.lerpVectors(sn.from, sn.to, k).add(new THREE.Vector3(0, Math.sin(k * Math.PI) * 1.3, 0));
    sn.thrower.mesh.userData.parts.armR.rotation.x = -1.6 + k * 2.0;
    if (k >= 1) {
      sn.thrower.mesh.userData.parts.armR.rotation.x = 0;
      snackToken.visible = false;
      snackToken.scale.set(1, 1, 1);
      snackToken.material.color.set("#ffd23c");
      bubble(sn.thrower, "Wrapper's going in.", 3, "");
      state.fire.level = Math.min(FIRE.max, state.fire.level + EVENTS.wrapperFlare);
      ev.plate = { t: 1.5, who: sn.thrower.data.name, flared: true, wrapper: true };
      ev.snack = null;
    }
  } else if (ev.snack) {
    const sn = ev.snack;
    sn.t += dt;
    const from = sn.order[sn.i], to = sn.order[Math.min(sn.i + 1, sn.order.length - 1)];
    const k = Math.min(1, sn.t / EVENTS.snackHopSeconds);
    snackToken.position.lerpVectors(from.mesh.position, to.mesh.position, k).add(new THREE.Vector3(0, 1.2 + Math.sin(k * Math.PI) * 0.6, 0));
    if (k >= 1) {
      sn.t = 0; sn.i += 1;
      if (to.state === "seated") to.comfort = Math.min(100, to.comfort + EVENTS.snackWarm);
      if (sn.i >= sn.order.length - 1) {
        // last guy winds up for the throw; see the throwing branch above for the landing
        snackToken.scale.set(1.3, 0.55, 1.1);
        snackToken.material.color.set("#e8542c");
        ev.snack = { throwing: true, thrower: to, t: 0, from: to.mesh.position.clone(), to: new THREE.Vector3(0, 0, 0) };
      }
    }
  }

  // Alan: once a night he runs a lap around the outside of the chairs, chased by bees
  const al = state.alan;
  if (!al.done && !al.running && state.t >= al.at) {
    al.running = true; al.t = 0; al.a0 = Math.random() * Math.PI * 2; al.mesh = alanMesh;
    alanMesh.visible = true; beesMesh.visible = true;
    bubble(al, "Beeeees! I don't have an Epipen!", 4.5, "leaving");
    const s1 = pick(campers.filter((c) => c.state === "seated"));
    if (s1) setTimeout(() => bubble(s1, "Alan?", 3, ""), 1200);
    const s2 = pick(campers.filter((c) => c.state === "seated" && c !== s1));
    if (s2) setTimeout(() => bubble(s2, "Run, Alan!", 3, ""), 2600);
    say("Alan is here. So are the bees.", 5);
    state.log.push(`Alan and the bees at ${clockText()}`);
    buzz(EVENTS.alanLapSeconds + 1.5);
  }
  if (al.running) {
    al.t += dt;
    const k = al.t / EVENTS.alanLapSeconds;
    const ang = al.a0 + k * Math.PI * 2;
    const r = k < 1 ? EVENTS.alanRadius : EVENTS.alanRadius + (k - 1) * 14;
    alanMesh.position.set(Math.sin(ang) * r, Math.abs(Math.sin(al.t * 14)) * 0.12, Math.cos(ang) * r);
    alanMesh.lookAt(Math.sin(ang + 0.2) * r, 0, Math.cos(ang + 0.2) * r);
    // Arms stay up but flail as he runs (purely visual, on top of the fixed "up" pose set in world.js)
    const ap = alanMesh.userData.parts;
    ap.armL.rotation.x = -0.2 + Math.sin(al.t * 16) * 0.3;
    ap.armR.rotation.x = 0.15 + Math.sin(al.t * 16 + 1.4) * 0.3;
    const back = ang - 0.35;
    beesMesh.position.set(Math.sin(back) * r, 0, Math.cos(back) * r);
    beesMesh.children.forEach((b) => { const u = b.userData; b.position.set(u.ox + Math.sin(al.t * 17 + u.ph) * 0.25, u.oy + Math.sin(al.t * 23 + u.ph) * 0.2, u.oz + Math.cos(al.t * 19 + u.ph) * 0.25); });
    if (k >= 1.4) { al.running = false; al.done = true; alanMesh.visible = false; beesMesh.visible = false; }
  }

  // The bottle: somebody finds one and hands it to you. One swig, one flare.
  if (!state.bottle.given && state.t >= state.bottle.at) {
    state.bottle.given = true;
    const giver = pick(campers.filter((c) => c.state === "seated")) || null;
    if (giver) bubble(giver, "Found this in the truck. Don't ask.", 5, "");
    say(`${giver ? giver.data.name : "Somebody"} hands you a bottle. Walk to the fire with empty hands and press Space to breathe fire.`, 8);
    showBanner("YOU HAVE THE BOTTLE");
  }

  // The beer goes off
  if (state.beer.thrown && !state.beer.exploded && state.beer.fuse > 0) {
    state.beer.fuse -= dt;
    if (state.beer.fuse <= 0) {
      state.beer.exploded = true;
      bang();
      state.shake = EVENTS.beerShake;
      state.fire.level = Math.min(FIRE.max, state.fire.level + EVENTS.beerFlare);
      const seatedNow = campers.filter((c) => c.state === "seated");
      const fallers = seatedNow.sort(() => Math.random() - 0.5).slice(0, EVENTS.beerFallers);
      fallers.forEach((c) => { c.fall = 2.2; });
      campers.forEach((c) => { if (c.state === "seated") c.comfort = Math.min(100, c.comfort + 6); });
      say(`BANG. ${fallers.map((c) => c.data.name).join(", ")} went over backwards. They're fine.`, 6, true);
      state.log.push(`Beer bomb at ${clockText()}`);
      scareBear();
    }
  }
  campers.forEach((c) => { if (c.fall > 0) c.fall -= dt; });

  // Coyotes yip from the dark when the fire is low
  if (state.fire.level / FIRE.hot < EVENTS.coyoteBelow) {
    ev.coyoteIn -= dt;
    if (ev.coyoteIn <= 0) {
      ev.coyoteIn = rand(EVENTS.coyoteMinGap, EVENTS.coyoteMaxGap); coyoteYip();
      const c = pick(campers.filter((c) => c.state === "seated"));
      if (c && Math.random() < 0.6) setTimeout(() => bubble(c, pick(["What was that?", "Did you hear the coyotes?"]), 3, "cold"), 700);
    }
  } else ev.coyoteIn = Math.min(ev.coyoteIn, 3);
}

// ---------- Hints: point at what the player has not found ----------
function showHint(target, text) {
  state.hints.target = target.clone(); state.hints.until = state.t + HINTS.showSeconds;
  say(text, HINTS.showSeconds);
}
function updateHints(dt) {
  const h = state.hints, f = state.fire.level, t = state.t;
  if (h.target && t < h.until) {
    hintArrow.visible = true;
    hintArrow.position.set(h.target.x, 2.6 + Math.sin(t * 4) * 0.25, h.target.z);
    hintArrow.rotation.y = t * 1.5;
    return;
  }
  hintArrow.visible = false;
  if (donMesh.visible && !h.donShown && !state.don.gaveLog) { h.donShown = true; showHint(donMesh.position, "Don M is at the tree line. Walk over and press Space. He might have something."); return; }
  if (!donMesh.visible) h.donShown = false;
  if (!h.gasEver && state.gas > 0 && f < HINTS.gasBelow && t - h.lastGas > HINTS.gasEvery) { h.lastGas = t; showHint(new THREE.Vector3(LAYOUT.gasCan.x, 0, LAYOUT.gasCan.z), "The gas can. Grab it, pour it on the fire. Big flare, burns fast."); return; }
  if (!h.woodEver && f < HINTS.woodBelow && t - h.lastWood > HINTS.woodEvery) { h.lastWood = t; showHint(new THREE.Vector3(LAYOUT.woodPile.x, 0, LAYOUT.woodPile.z), "The wood pile. Space to grab a log, walk it over, Space at the fire."); return; }
  if (!state.stick.held && t > HINTS.stickAfter && t - h.lastStick > HINTS.stickEvery) { h.lastStick = t; showHint(new THREE.Vector3(LAYOUT.stick.x, 0, LAYOUT.stick.z), "That's the poker stick, leaning by the wood pile. Grab it and you can poke the fire."); return; }
}

// ---------- Sky: shooting star, Starlink ----------
function startSky(kind) {
  if (state.sky.kind) return;
  state.sky.kind = kind; state.sky.t = 0;
  if (kind === "star") { starMesh.visible = true; }
  else { starlinkMesh.visible = true; }
}
function updateSky(dt) {
  const sk = state.sky;
  sk.nextIn -= dt;
  if (!sk.kind && sk.nextIn <= 0) {
    sk.nextIn = rand(EVENTS.skyMinGap, EVENTS.skyMaxGap);
    const kind = Math.random() < 0.6 ? "star" : "starlink";
    const c = pick(campers.filter((c) => c.state === "seated"));
    if (c) bubble(c, kind === "star" ? "Look! A shooting star!" : "Is that Starlink?", 4, "");
    startSky(kind);
  }
  if (!sk.kind) return;
  sk.t += dt;
  if (sk.kind === "star") {
    const k = sk.t / 1.1;
    starMesh.position.set(-9 + k * 16, 10.5 - k * 3.5, -14);
    starMesh.rotation.z = -0.22;
    starMesh.material.opacity = 0.95 * Math.sin(Math.min(1, k) * Math.PI);
    if (k >= 1) { starMesh.visible = false; sk.kind = null; }
  } else {
    const k = sk.t / 9;
    starlinkMesh.position.set(-14 + k * 22, 9.5 + Math.sin(k * 3.14) * 1.2, -15);
    starlinkMesh.rotation.z = 0.12;
    if (k >= 1) { starlinkMesh.visible = false; sk.kind = null; }
  }
}

// ---------- Bear ----------
function updateBear(dt) {
  const b = state.bear;
  if (b.state === "idle") {
    // Bear-back ride: he brings the last guy back and drops him in the wrong chair
    if (b.rideBack && state.t >= b.returnAt && b.rideBack.state === "taken") {
      const rider = b.rideBack; b.rideBack = null;
      const empties = campers.filter((c) => c !== rider && (c.state === "gone" || c.state === "walking"));
      const chairOwner = pick(empties);
      const chair = chairOwner ? chairOwner.chair : rider.chair;
      if (chairOwner) { rider.chairMesh = chairOwner.chairMesh; rider.chair = chair.clone(); }
      b.state = "ride"; b.timer = 0; b.target = rider;
      b.from.set(LAYOUT.bearEntry.x, 0, LAYOUT.bearEntry.z);
      b.to.copy(chair).setLength(chair.length() + 1.2);
      bearMesh.visible = true; bearMesh.position.copy(b.from); bearMesh.lookAt(b.to.x, 0, b.to.z);
      rider.mesh.visible = true;
      say(`The bear is back. It's carrying ${rider.data.name}.`, 5);
      bearRideTheme();
      return;
    }
    if (state.fire.zeroTimer >= BEAR.secondsAtZero && state.t >= b.cooldownUntil) {
      const candidates = campers.filter((c) => c.state === "seated" || c.state === "leaving");
      if (candidates.length === 0) return;
      const scott = candidates.find((c) => c.data.bearFirst);
      b.target = scott || candidates.reduce((a, c) => (c.comfort < a.comfort ? c : a));
      b.state = "in"; b.timer = 0;
      b.from.set(LAYOUT.bearEntry.x, 0, LAYOUT.bearEntry.z);
      b.to.copy(b.target.chair).add(new THREE.Vector3(0, 0, 0)).setLength(b.target.chair.length() + 1.2);
      bearMesh.visible = true;
      bearMesh.position.copy(b.from);
      bearMesh.lookAt(b.to.x, 0, b.to.z);
      say("Something is moving at the tree line.", 4);
      growl();
      bearTheme();
    }
    return;
  }
  if (b.state === "ride") {
    b.timer += dt;
    const k = Math.min(1, b.timer / BEAR.walkInSeconds);
    bearMesh.position.lerpVectors(b.from, b.to, k);
    b.target.mesh.position.copy(bearMesh.position).add(new THREE.Vector3(0, 1.1, -0.6));
    b.target.mesh.rotation.z = Math.PI / 2;
    if (k >= 1) {
      const rider = b.target;
      rider.state = "seated"; rider.comfort = 65; rider.saidCold = false;
      rider.mesh.rotation.set(0, 0, 0); rider.mesh.position.copy(rider.chair); rider.mesh.lookAt(0, 0, 0);
      bubble(rider, "That was fine. Whose chair is this?", 5, "");
      state.log.push(`The bear brought ${rider.data.name} back at ${clockText()}`);
      say(`${rider.data.name} is back. Wrong chair. He seems fine.`, 5);
      b.state = "out"; b.timer = 0; b.target = null;
      b.from.copy(bearMesh.position); b.to.set(LAYOUT.bearEntry.x, 0, LAYOUT.bearEntry.z);
      bearMesh.lookAt(b.to.x, 0, b.to.z);
    }
    return;
  }
  b.timer += dt;
  if (b.state === "in") {
    const k = Math.min(1, b.timer / BEAR.walkInSeconds);
    bearMesh.position.lerpVectors(b.from, b.to, k);
    if (k >= 1) {
      b.target.state = "taken";
      b.target.bubble.until = 0;
      b.rideBack = b.target; b.returnAt = state.t + rand(BEAR.returnMin, BEAR.returnMax);
      state.log.push(`The bear took ${b.target.data.name} at ${clockText()}`);
      say(`The bear took ${b.target.data.name}. Chair and all.`, 6, true);
      b.state = "out"; b.timer = 0;
      b.from.copy(bearMesh.position);
      b.to.set(LAYOUT.bearEntry.x, 0, LAYOUT.bearEntry.z);
      bearMesh.lookAt(b.to.x, 0, b.to.z);
    }
  } else if (b.state === "out" || b.state === "scared") {
    const k = Math.min(1, b.timer / BEAR.walkOutSeconds);
    bearMesh.position.lerpVectors(b.from, b.to, k);
    if (b.target && b.target.state === "taken") {
      b.target.mesh.position.copy(bearMesh.position).add(new THREE.Vector3(0, 1.1, -0.6));
      b.target.mesh.rotation.z = Math.PI / 2;
    }
    if (k >= 1) {
      bearMesh.visible = false;
      if (b.target && b.target.state === "taken") b.target.mesh.visible = false;
      b.state = "idle"; b.target = null;
      b.cooldownUntil = state.t + BEAR.cooldown;
      state.fire.zeroTimer = 0;
    }
  }
}

// A burst of fire while the bear is walking in sends it back to the woods.
function scareBear() {
  const b = state.bear;
  if (b.state === "in" && state.fire.level >= 25) {
    b.state = "scared"; b.timer = 0;
    b.from.copy(bearMesh.position);
    b.to.set(LAYOUT.bearEntry.x, 0, LAYOUT.bearEntry.z);
    bearMesh.lookAt(b.to.x, 0, b.to.z);
    b.target = null;
    say("The bear thought better of it.", 4);
    bearWomp();
  }
}

// ---------- Midnight: Tom W arrives ----------
function updateMidnight() {
  if (state.midnightDone || gameMinutes() < MIDNIGHT_MIN) return;
  state.midnightDone = true;
  const tom = campers.find((c) => c.data.arrivesAtMidnight);
  if (!tom) return;
  tom.mesh.visible = true;
  tom.mesh.position.set(LAYOUT.roadEntry.x, 0, LAYOUT.roadEntry.z);
  tom.state = "arriving";
  tom.comfort = CAMPER.startComfort;
  bubble(tom, tom.data.warm, 6, "");
  campers.forEach((c) => { if (c.state === "seated" || c.state === "leaving") c.comfort = Math.min(100, c.comfort + CAMPER.tomWComfortBoost); });
  say("Headlights on the road. Tom W made it.", 5);
  state.log.push("Tom W arrived at midnight");
}

// ---------- End ----------
function checkEnd() {
  const anyoneLeft = campers.some((c) => ["seated", "leaving", "away", "arriving"].includes(c.state));
  if (state.t >= NIGHT_SECONDS) endNight(false);
  else if (!anyoneLeft) endNight(true);
}

function endNight(alone) {
  state.phase = "end";
  if (alone) stopMusic(2); else playDawn();
  const at = campers.filter((c) => c.state === "seated" || c.state === "leaving" || c.state === "arriving").map((c) => c.data.name);
  const bed = campers.filter((c) => c.state === "gone" || c.state === "walking").map((c) => c.data.name);
  const taken = campers.filter((c) => c.state === "taken" || (c.state === "gone" && false)).map((c) => c.data.name);
  const takenLog = state.log.filter((l) => l.startsWith("The bear took")).map((l) => l.replace("The bear took ", "").split(" at ")[0]);
  const returned = state.log.filter((l) => l.startsWith("The bear brought")).map((l) => l.replace("The bear brought ", "").split(" back at ")[0]);
  const bearVictims = takenLog.length ? takenLog : taken;
  const hotPts = Math.round(state.fire.hotSeconds);
  const score = at.length * 10 + (state.gasUsed === 0 ? 15 : 0) + (bearVictims.length === 0 ? 20 : 0) + hotPts;
  let verdict;
  if (alone) verdict = "Everyone left. You sat alone until dawn.";
  else if (bearVictims.length && bed.length === 0) verdict = `${bearVictims.join(" and ")} never seen again. Great fire though.`;
  else if (bearVictims.length && bed.length <= 2) verdict = `Lost ${bearVictims.join(" and ")} to the bear. Everyone else made it.`;
  else if (bearVictims.length) verdict = "Lost one to the bear and the rest to bedtime.";
  else if (bed.length === 0) verdict = "Everybody made it to dawn. Best camp weekend ever.";
  else if (bed.length <= 2) verdict = "Solid night. A couple of lightweights.";
  else verdict = "Fire was fine. The company was not.";
  ui.endTitle.textContent = alone ? `${clockText()}, ALONE` : "SUNDAY MORNING";
  ui.wind.hidden = true;
  ui.endBody.innerHTML = `
    <p><strong>${player.data.name}</strong> tended the fire on ${DIFFICULTY[state.diff].name}. Score: <strong>${score}</strong></p>
    <ul>
      <li>Still at the fire (${at.length}): ${at.join(", ") || "nobody"}</li>
      <li>Went to bed (${bed.length}): ${bed.join(", ") || "nobody"}</li>
      <li>Taken by the bear: ${(() => { const left = [...returned]; return bearVictims.map((n) => { const i = left.indexOf(n); if (i >= 0) { left.splice(i, 1); return `${n} (returned, wrong chair)`; } return n; }); })().join(", ") || "nobody"}</li>
      <li>Gas used: ${state.gasUsed}. Fire-breathing: ${state.bottle.used ? "yes" : "no"}. Beer bomb: ${state.beer.exploded ? "yes" : state.beer.thrown ? "wasted" : "no"}</li>
      <li>Time in Hell's Anus: ${hotPts}s (+${hotPts}). Peak: ${state.fire.peakTier ? HOT_LEVELS[state.fire.peakTier - 1].name : "never got there"}</li>
      <li>Earned: ${[state.powerups.woodEarned ? "the pallet" : null, state.powerups.gasEarned ? "the gas can" : null, state.don.gaveLog || state.log.includes("Don M gave a log") ? "a log from Don M" : null].filter(Boolean).join(", ") || "nothing"}</li>
      <li>Wood placement: ${state.fire.spreads} good spreads, ${state.fire.smothers} smothers${state.log.some((l) => l.startsWith("Alan")) ? ". Alan came through with the bees." : ""}</li>
    </ul>
    <p class="verdict">${verdict}</p>
    ${renderBoard(saveScore(player.data.name, score))}`;
  ui.end.hidden = false;
}

// ---------- Render ----------
function render(dt) {
  if (state.phase === "start") state.t += dt * 0; // clock frozen on the title; flicker uses titleClock below
  const level = state.fire.level / FIRE.hot;           // 1.0 at the Hell's Anus line, 1.5 at max
  const hot = state.fire.level > FIRE.hot;
  const ft = state.phase === "start" ? titleClock : state.t;
  const flicker = 0.9 + Math.sin(ft * 23) * 0.06 + Math.sin(ft * 7.3) * 0.04;
  // Single visual hook: flame sprites, sparks, coal bed and pit-log glow all driven
  // from the same authoritative level/hot/hotTier (see docs/HANDOFF.md art pass step 3).
  updateFireVisuals(fireVis, { level, hot, tier: state.fire.hotTier, dt, flicker, wind: state.wind });
  // 0.85 rebalances for fireLight's decay dropping from 2 to 1.4 in world.js: at the
  // player's minimum standing radius (1.3) the two falloffs cross almost exactly at
  // this factor, so close-in brightness (inside the ring) is unchanged while the
  // lower decay does the work of reaching the cabin/trailer/wood-pile distances.
  fireLight.intensity = (6 + 120 * Math.min(level, 1) + (hot ? 160 * (level - 1) + 40 + state.fire.hotTier * 18 : 0)) * 0.85 * flicker * (1 + (fireVis.lightNudge || 0));
  fireLight.color.setHSL(hot ? 0.1 : 0.07 - (1 - Math.min(level, 1)) * 0.04, hot ? 0.7 : 1, hot ? 0.7 : 0.55);
  updateSmoke(dt, level, hot);

  // Dawn in the last minute
  const dawn = THREE.MathUtils.clamp((state.t - (NIGHT_SECONDS - 60)) / 60, 0, 1);
  const sky = new THREE.Color("#0b1020").lerp(new THREE.Color("#e08a6a"), dawn);
  scene.background.copy(sky);
  scene.fog.color.copy(sky);

  // HUD
  ui.fireFill.style.width = `${(state.fire.level / FIRE.max) * 100}%`;
  ui.fireFill.classList.toggle("low", level < 0.25);
  ui.fireFill.classList.toggle("hot", hot);
  ui.fireLabel.textContent = hot ? `FIRE: ${HOT_LEVELS[state.fire.hotTier - 1].name}` : "FIRE";
  ui.clock.textContent = clockText();
  ui.wood.textContent = state.wood;
  ui.gas.textContent = state.gas;
  if (state.message.until < state.t && !state.message.hint) ui.message.textContent = "";
  if (state.message.until >= state.t) ui.message.textContent = state.message.text;
  else ui.message.textContent = state.message.hint || "";

  // Fire sound follows the fire; music fades over the last minute and ducks when the fire is low
  if (state.phase === "playing") {
    setCrackle(level, dt);
    if (state.t >= NIGHT_SECONDS - 60 && !state.musicFading) { state.musicFading = true; stopMusic(50); }
  }

  // Fire breath cone from the player's mouth to the pit
  if (state.bottle.breath > 0) {
    state.bottle.breath -= dt;
    const k = Math.max(0, state.bottle.breath / 1.7);
    const from = player.mesh.position.clone().add(new THREE.Vector3(0, 1.35, 0));
    const dir = new THREE.Vector3(0, 0.6, 0).sub(from).normalize();
    const len = 1.6 + (1 - k) * 2.2;
    breathMesh.scale.set(0.9 + (1 - k) * 1.3, len / 2.6, 0.9 + (1 - k) * 1.3);
    breathMesh.position.copy(from).add(dir.clone().multiplyScalar(len / 2));
    breathMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir);
    breathMesh.material.opacity = 0.85 * Math.sin(Math.min(1, 1 - k) * Math.PI) + 0.1 * k;
    breathMesh.material.color.setHSL(0.08 - k * 0.04, 1, 0.55 + 0.2 * k);
    fireLight.intensity += 220 * k;
    if (state.bottle.breath <= 0) breathMesh.visible = false;
  }

  // Poke thrust on the player's stick arm (game only; the lobby drives arms itself)
  if (state.phase === "playing") {
    state.pokeAnim = Math.max(0, state.pokeAnim - dt);
    const armR = player.mesh.userData.parts.armR;
    const target = state.pokeAnim > 0 ? -1.5 : (state.stick.held ? -0.35 : 0);
    armR.rotation.x += (target - armR.rotation.x) * Math.min(1, dt * 14);
  }

  // Bubbles
  const w = window.innerWidth, h = window.innerHeight;
  [...campers, player, state.don, state.alan].forEach((c) => {
    if (!c.mesh) return;
    if (c.bubble.until <= state.t || !c.bubble.text || !c.mesh.visible) { if (c.bubble.el) { c.bubble.el.remove(); c.bubble.el = null; } return; }
    if (!c.bubble.el) { c.bubble.el = document.createElement("div"); ui.bubbles.appendChild(c.bubble.el); }
    c.bubble.el.className = `bubble ${c.bubble.cls}`;
    c.bubble.el.textContent = c.bubble.text;
    const v = c.mesh.position.clone().add(new THREE.Vector3(0, 2.1, 0)).project(camera);
    c.bubble.el.style.left = `${(v.x + 1) / 2 * w}px`;
    c.bubble.el.style.top = `${(1 - v.y) / 2 * h}px`;
  });

  renderer.render(scene, camera);
}

// ---------- Smoke ----------
let smokeSpawn = 0;
function updateSmoke(dt, level, hot) {
  const w = state.wind;
  const windPush = w.active ? 2.2 : 0.25;
  const smothering = state.fire.catching.some((c) => c.smother);
  const catching = smothering ? 3.6 : state.fire.catching.length > 0 ? 2.5 : 1;   // a fresh log smokes, a smothered one smokes more
  const rate = level <= 0.02 ? 0 : (hot ? 6 : 10 + 14 * Math.min(level, 1)) * catching;
  smokeSpawn += rate * dt;
  for (const sp of smoke) {
    const u = sp.userData;
    if (u.age >= u.life) {
      if (smokeSpawn < 1) continue;
      smokeSpawn -= 1;
      u.age = 0; u.life = 3.5 + Math.random() * 2;
      sp.position.set((Math.random() - 0.5) * 0.6, 0.9 + Math.random() * 0.4, (Math.random() - 0.5) * 0.6);
      u.vel.set((Math.random() - 0.5) * 0.3, 1.1 + Math.random() * 0.6, (Math.random() - 0.5) * 0.3);
      u.size = 0.5 + Math.random() * 0.4;
    }
    u.age += dt;
    const k = u.age / u.life;
    sp.position.x += (u.vel.x - w.dir.x * windPush) * dt;   // pushed away from the wind's source
    sp.position.z += (u.vel.z - w.dir.y * windPush) * dt;
    sp.position.y += u.vel.y * dt * (w.active ? 0.55 : 1);
    const size = u.size + k * 2.2;
    sp.scale.set(size, size, 1);
    sp.material.opacity = (hot ? 0.18 : 0.42) * Math.sin(Math.PI * Math.min(1, k)) * (0.4 + 0.6 * Math.min(level, 1));
    sp.material.color.setScalar(hot ? 0.85 : 0.55);
  }
}

// ---------- Banner ----------
let bannerTimer = null;
function showBanner(text) {
  const el = ui.banner;
  el.textContent = text;
  el.hidden = false;
  el.classList.remove("show"); void el.offsetWidth; el.classList.add("show");
  clearTimeout(bannerTimer);
  bannerTimer = setTimeout(() => { el.hidden = true; }, 2600);
}

// ---------- Leaderboard (this browser only) ----------
const BOARD_KEY = "aij-board";
function loadBoard() { try { return JSON.parse(localStorage.getItem(BOARD_KEY) || "[]"); } catch (e) { return []; } }
function saveScore(name, score) {
  const board = loadBoard();
  const d = new Date();
  const entry = { name, score, diff: DIFFICULTY[state.diff].name, when: `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}/${d.getFullYear()}` };
  board.push(entry);
  board.sort((a, b) => b.score - a.score);
  const top = board.slice(0, 10);
  try { localStorage.setItem(BOARD_KEY, JSON.stringify(top)); } catch (e) { /* ignore */ }
  return { top, entry };
}
function renderBoard(result) {
  const { top, entry } = result || { top: loadBoard(), entry: null };
  if (!top.length) return "";
  const rows = top.slice(0, 5).map((e, i) => `<tr class="${entry && e === entry ? "me" : ""}"><td>${i + 1}</td><td>${e.name}</td><td>${e.score}</td><td>${e.diff || "CAMP"}</td><td>${e.when}</td></tr>`).join("");
  return `<table class="board"><thead><tr><th></th><th>Camper</th><th>Score</th><th>Mode</th><th>Night</th></tr></thead><tbody>${rows}</tbody></table>`;
}
document.getElementById("title-board").innerHTML = renderBoard(null);

// ---------- Helpers ----------
function say(text, seconds, sticky = false) {
  if (!sticky && state.message.sticky && state.message.until > state.t) return; // a big moment holds the line
  state.message.text = text; state.message.until = state.t + seconds; state.message.sticky = sticky;
}
function setHint(text) { state.message.hint = text; }
function bubble(c, text, seconds, cls) { c.bubble.text = text; c.bubble.until = state.t + seconds; c.bubble.cls = cls; }
function pbubble(text, seconds, cls) { bubble(player, text, seconds, cls); }
function gameMinutes() { return NIGHT_START_MIN + (state.t / NIGHT_SECONDS) * (NIGHT_END_MIN - NIGHT_START_MIN); }
function clockText() {
  const total = Math.floor(gameMinutes());
  const h24 = Math.floor(total / 60) % 24, m = total % 60;
  const h12 = ((h24 + 11) % 12) + 1;
  return `${h12}:${String(m).padStart(2, "0")} ${h24 >= 12 ? "PM" : "AM"}`;
}
function compass(dir) {
  // dir is where the wind comes FROM, in world x/z. Camera looks toward -z, so +z is toward the viewer.
  const a = Math.atan2(dir.x, dir.y);
  const d = ((a * 180) / Math.PI + 360) % 360;
  if (d < 45 || d >= 315) return "front";
  if (d < 135) return "right";
  if (d < 225) return "back";
  return "left";
}
function dist2(pos, pt) { return Math.hypot(pos.x - pt.x, pos.z - pt.z); }
function rand(a, b) { return a + Math.random() * (b - a); }
function pick(arr) { return arr.length ? arr[Math.floor(Math.random() * arr.length)] : null; }
