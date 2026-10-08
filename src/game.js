// All In Jefferson, prototype 1: the fire loop on a flat plane with box campers.
import * as THREE from "three";
import { NIGHT_SECONDS, NIGHT_START_MIN, NIGHT_END_MIN, MIDNIGHT_MIN, FIRE, WIND, CAMPER, BEAR, PLAYER, LAYOUT, POWERUPS, EVENTS, HOT_LEVELS, SMOKE, DIFFICULTY, HINTS, COACH, PHONE_FOLLOW, KEG, HEAT, HEADLAMP, TRUCK, COLLIDE } from "./config.js?v=161";
import { initSound, unlockSound, uiClick, coyoteYip, whoosh, growl, bang, startCrackle, setCrackle, footstep, logLand, pokeSound, buzz, playIntroThenLoop, startLoop, stopMusic, playDawn, toggleMusic, musicEnabled, musicActive, bearTheme, bearRideTheme, bearWomp, duckMusic, hissSteam, truckRumble, truckDoorThunk } from "./sound.js?v=161";
import { campers as roster, pickPlayer, commitPick, snacks, emotes, comments, coolerComments, kegCheers, kegFireYell, sung, donSecondLine, fireBreathYell } from "./campers.js?v=161";
import { buildWorld, makeCamperMesh, makeChairMesh, makeLogMesh, makePalletMesh, setSeated, stepWalkCycle, stepBearWalk, SEATED_DROP, setExpression } from "./world.js?v=161";
import { buildMiniKeg, buildGuitar, buildTrumpet, buildBourbonGlass, buildYogurtCup, buildCheesePuffsBag, buildCoffeeMug, buildWaterSkis, buildFlightHelmet, buildCornholeSet, buildYetiTumbler, buildSpoon } from "./props.js?v=161";
import { buildPickupTruck, buildTruckPath, TRUCK_GEOM } from "./truck.js?v=161";
import { updateFireVisuals } from "./fire.js?v=161";
import { SMOKE_LOOK } from "./config.js?v=161";
import { initShareCardButtons } from "./sharecard.js?v=161";

const canvas = document.getElementById("scene");
const world = buildWorld(canvas);
const { renderer, scene, camera, fireLight, keyLight, flames, sparks, coals, bear: bearMesh, streaks, don: donMesh, alan: alanMesh, bees: beesMesh, breath: breathMesh, gasCan, pitLogs, hintArrow, snackToken, stick: stickMesh, star: starMesh, starlink: starlinkMesh, trees, smoke, woodPile, pallet: palletMesh, updateSkyDome } = world;
// Bundle for the single fire.js visual hook driven from render(): flame sprites,
// sparks, the coal bed and the pit logs, all purely cosmetic and keyed off
// state.fire's authoritative level/hot/hotTier.
const fireVis = { flames, sparks, coals, pitLogs };

// Two hand-built props for the new camper-driven night events (built here the way
// snackToken and the carry meshes are, since world.js/props.js are off limits for
// this pass): the full can that goes in the fire, and the empty glass bottle that
// gets wound up and never thrown. Both hidden until their event needs them.
const canBombMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.32, 10), new THREE.MeshLambertMaterial({ color: "#d8dde2" }));
canBombMesh.visible = false;
scene.add(canBombMesh);
const glassBottleMesh = new THREE.Group();
const glassBody = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.1, 0.28, 10), new THREE.MeshLambertMaterial({ color: "#3c2a14" }));
glassBody.position.y = 0.14;
const glassNeck = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.055, 0.14, 8), new THREE.MeshLambertMaterial({ color: "#3c2a14" }));
glassNeck.position.y = 0.28 + 0.07;
glassBottleMesh.add(glassBody, glassNeck);
glassBottleMesh.visible = false;
scene.add(glassBottleMesh);

// Johnny D's cornhole boards (signature-props backlog item, docs/CAMPERS.md):
// too big to sit beside a chair, so unlike the per-camper hand props below
// (built fresh in buildCrew, one per seated NPC) this is a single fixed camp
// fixture built once and always present, regardless of who is playing that
// night, same as the cooler or wood pile.
const cornholeMesh = buildCornholeSet(LAYOUT.cornhole.gap);
cornholeMesh.position.set(LAYOUT.cornhole.x, 0, LAYOUT.cornhole.z);
cornholeMesh.rotation.y = LAYOUT.cornhole.rot || 0;
scene.add(cornholeMesh);

// Touch-only "you'll act on this" ring (built here for the same reason as the
// two props above), Bryan's phone play, 09/26: "the poker was tough to get".
// Deliberately its own mesh, separate from world.js's hintArrow (that one marks
// things the player has not found yet; this marks whatever the action button
// is about to do right now, and the two can be visible at once).
const actionRing = new THREE.Mesh(new THREE.TorusGeometry(0.6, 0.06, 8, 28), new THREE.MeshBasicMaterial({ color: "#ffd23c", transparent: true, opacity: 0.85 }));
actionRing.rotation.x = Math.PI / 2;
actionRing.position.y = 0.05;
actionRing.visible = false;
scene.add(actionRing);

// Headlamp (Bryan, 09/26): one SpotLight on the player, faded in as the fire drops
// toward dark. Kept at scene scope (not a child of player.mesh, which is rebuilt
// whenever a different camper is picked) so it survives a re-pick untouched; its
// position/target are copied from the player each frame in updateHeadlamp() below.
// No shadows (a second shadow-casting light is not worth it on a phone).
const headlampLight = new THREE.SpotLight("#dce8ff", 0, HEADLAMP.distance, HEADLAMP.angle, HEADLAMP.penumbra, 1.4);
headlampLight.castShadow = false;
const headlampTarget = new THREE.Object3D();
headlampLight.target = headlampTarget;
scene.add(headlampLight, headlampTarget);

// Tom W's truck (midnight arrival feature). Its own module is src/truck.js
// (kept out of props.js/world.js, which are off limits for this pass -- see
// the comment on canBombMesh/glassBottleMesh above for the same reasoning).
// The SpotLight is pre-created here at intensity 0, same trick as
// headlampLight above, so its shader variant compiles at load instead of at
// midnight (Bryan's ask: no hitch when a fourth dynamic light joins fireLight/
// keyLight/headlampLight for the first time).
//
// The mesh itself gets the same early-warmup treatment for a second, separate
// reason: a light recompiling every material's shader isn't the only way
// midnight could stutter -- the truck's own dozen-plus new meshes and its
// glow texture need their buffers uploaded to the GPU the first time they're
// actually drawn, and an invisible object is never actually drawn
// (renderer.compile() below compiles shader *programs* early, but doesn't
// touch that upload). So rather than toggling truckMesh.visible, it stays
// visible and parked 30 units underground until midnight, so it renders for
// real -- and uploads for real -- during the idle title/lobby frames, then
// simply drives up out of the ground on its own path. buildPickupTruck() also
// turns off frustum culling on every part, since culling would skip that
// upload the same way invisibility does while it's sitting off-camera
// underground.
const truckMesh = buildPickupTruck();
truckMesh.position.set(0, -30, 0);
scene.add(truckMesh);
const truckLight = new THREE.SpotLight(TRUCK.lightColor, 0, TRUCK.lightDistance, TRUCK.lightAngle, TRUCK.lightPenumbra, 1.2);
truckLight.castShadow = false;
const truckLightTarget = new THREE.Object3D();
truckLight.target = truckLightTarget;
scene.add(truckLight, truckLightTarget);
// Two visible beam cones (additive, untoned) and two glowing lens sprites, one
// per headlight. A single small radial-gradient texture serves both sprites.
function makeGlowTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 48;
  const g = c.getContext("2d");
  const grad = g.createRadialGradient(24, 24, 0, 24, 24, 22);
  grad.addColorStop(0, "rgba(255,246,214,1)");
  grad.addColorStop(0.45, "rgba(255,230,170,0.65)");
  grad.addColorStop(1, "rgba(255,220,140,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 48, 48);
  return new THREE.CanvasTexture(c);
}
const truckGlowTex = makeGlowTexture();
// fog:false, same as the moon/star sprites in world.js -- a headlight beam
// needs to punch through the night's fog, not fade into it like a solid prop.
const truckBeamMat = () => new THREE.MeshBasicMaterial({ color: "#fff3d6", transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, fog: false });
const truckBeams = [-1, 1].map(() => {
  const cone = new THREE.Mesh(new THREE.ConeGeometry(1.1, TRUCK.beamLength, 10, 1, true), truckBeamMat());
  // ConeGeometry's apex sits at local +Y, base at local -Y; rotating -90 deg
  // around X swings the apex to local -Z and the (wide) base to local +Z, so
  // positioning the group's center TRUCK.beamLength/2 forward of the lens puts
  // the narrow apex right at the lens and the flared base out at beamLength.
  cone.rotation.order = "YXZ"; // heading (y) must apply after the tip-over (x), or the beams ignore the truck's heading (Bryan: headlights backwards)
  cone.rotation.x = -Math.PI / 2;
  cone.frustumCulled = false;
  // Left visible (opacity 0 already hides it) rather than toggled off, same
  // upload-before-midnight reasoning as truckMesh above; setTruckLights()
  // still flips .visible off once fully faded for the free draw-call skip.
  scene.add(cone);
  return cone;
});
const truckLensGlows = [-1, 1].map(() => {
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: truckGlowTex, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, fog: false }));
  sp.scale.set(0.5, 0.5, 1);
  sp.frustumCulled = false;
  scene.add(sp);
  return sp;
});
// A dim, steady parking-light glow once the truck is parked for good (Bryan's
// "lights off, maybe a dim parking light glow is fine") -- cheap: no dynamic
// light, just the same lens sprites held at a low, non-zero opacity.
const TRUCK_PARK_GLOW = 0.16;
// Belt and suspenders on top of the buried-and-rendering trick above: this
// compiles every material's shader program synchronously, right now, instead
// of leaving that for whichever real frame first submits it (normally the
// very next frame after this module loads, since the truck already renders
// every frame -- but should the render order ever change, this still holds).
try { renderer.compile(scene, camera); } catch (e) { /* non-fatal; the buried-mesh + pre-created-light mitigations above still apply */ }

// Overheat gauge (Bryan, 09/26): a small two-sprite bar that floats over the
// player's head, visible only once heat starts building. Sprites always face the
// camera and need no per-frame texture work, just position/scale, so this is cheap.
function makeBarSprite(color, w, h) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ color, transparent: true, opacity: 0.95, depthTest: false }));
  s.scale.set(w, h, 1);
  return s;
}
const HEAT_BAR_W = 0.58;
const heatBarBack = makeBarSprite("#241a14", HEAT_BAR_W + 0.05, 0.11);
const heatBarFill = makeBarSprite("#ffcf3c", HEAT_BAR_W, 0.07);
heatBarBack.renderOrder = 20; heatBarFill.renderOrder = 21;
heatBarBack.visible = heatBarFill.visible = false;
scene.add(heatBarBack, heatBarFill);

const ui = {
  fireFill: document.getElementById("fire-fill"),
  fireLabel: document.getElementById("fire-label"),
  // meterPanel/clockPanel: the phone left-rail and top-right card themselves
  // (docs/PHONE.md), read every touch frame in measureHudFootprint() below
  // for their real on-screen box -- never hardcoded, so a CSS tweak to either
  // one is picked up automatically by both the speech strip's width and the
  // camera follow's safe area.
  meterPanel: document.getElementById("meter-panel"),
  clockPanel: document.getElementById("clock-panel"),
  musicChip: document.getElementById("music-chip"),
  bottle: document.getElementById("bottle-chip"),
  banner: document.getElementById("banner"),
  coach: document.getElementById("coach"),
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
  // Phone play and the pause menu (docs/PHONE.md)
  pauseBtn: document.getElementById("pause-btn"),
  pauseOverlay: document.getElementById("pause-overlay"),
  pauseSub: document.getElementById("pause-sub"),
  resumeBtn: document.getElementById("resume-btn"),
  restartNightBtn: document.getElementById("restart-night-btn"),
  quitBtn: document.getElementById("quit-btn"),
  pauseMusicBtn: document.getElementById("pause-music-btn"),
  howtoBtn: document.getElementById("howto-btn"),
  howtoPanel: document.getElementById("howto-panel"),
  controlsSideBtn: document.getElementById("controls-side-btn"),
  portraitOverlay: document.getElementById("portrait-overlay"),
  fpsCounter: document.getElementById("fps-counter"),
  stickZone: document.getElementById("stick-zone"),
  stick: document.getElementById("stick"),
  actionBtn: document.getElementById("action-btn"),
  tWood: document.getElementById("t-wood"),
  tGas: document.getElementById("t-gas"),
  // Touch speech strip (Bryan, 09/26 follow-up: "always at the top, away from
  // the gameplay"), and the one-time iPhone Safari full-screen tip.
  speechStrip: document.getElementById("speech-strip"),
  speechLine0: document.getElementById("speech-line-0"),
  speechLine1: document.getElementById("speech-line-1"),
  speechMarker0: document.getElementById("speech-marker-0"),
  speechMarker1: document.getElementById("speech-marker-1"),
  iosTip: document.getElementById("ios-tip"),
  iosTipBtn: document.getElementById("ios-tip-btn"),
};
const stickKnobEl = ui.stick.querySelector(".stick-knob");

// ---------- State ----------
// Converts a clock-minutes moment (same units as NIGHT_START_MIN/NIGHT_END_MIN) into
// the elapsed-seconds state.t that reaches it: the inverse of gameMinutes() below.
function minutesToT(min) { return (min - NIGHT_START_MIN) / (NIGHT_END_MIN - NIGHT_START_MIN) * NIGHT_SECONDS; }
// Scheduled once here so the can-beer and no-glass events (once per night each, see
// updateEvents) land in the window Bryan asked for and don't overlap each other.
const canBeerAt = rand(minutesToT(EVENTS.canBeerWindowStartMin), minutesToT(EVENTS.canBeerWindowEndMin));
let glassAt = rand(minutesToT(EVENTS.glassWindowStartMin), minutesToT(EVENTS.glassWindowEndMin));
for (let tries = 0; tries < 8 && Math.abs(glassAt - canBeerAt) < EVENTS.glassMinGapFromCan; tries++) {
  glassAt = rand(minutesToT(EVENTS.glassWindowStartMin), minutesToT(EVENTS.glassWindowEndMin));
}

const playerData = pickPlayer();
const state = {
  phase: "start",
  paused: false,
  t: 0,
  fire: { level: FIRE.start, pokeCd: 0, gasBoostUntil: -1, catching: [], zeroTimer: 0, hot: false, hotSeconds: 0, hotTier: 0, peakTier: 0, lastSector: null, prevSector: null, drops: 0, smothers: 0, spreads: 0 },
  bottle: { at: rand(EVENTS.bottleMin, EVENTS.bottleMax), given: false, used: false, breath: 0 },
  diff: "camp",
  burn: FIRE.burnPerSec,
  alan: { at: rand(EVENTS.alanMin, EVENTS.alanMax), running: false, t: 0, a0: 0, done: false, mesh: null, bubble: { text: "", until: 0, cls: "" } },
  stepClock: 0,
  hints: { woodEver: false, gasEver: false, lastStick: -999, lastWood: -999, lastGas: -999, donShown: false, palletShown: false, target: null, until: 0 },
  stick: { held: false },
  coach: { sig: "", lastAct: 0, nextNudge: 0, nudge: null },
  beer: { available: true, thrown: false, fuse: 0, exploded: false },
  // Camper-tossed full can that goes in the fire and explodes, once a night. Separate
  // from `beer` above (the player's own beer bomb), which is unchanged.
  canBomb: { at: canBeerAt, phase: "pending", t: 0, tosser: null, from: new THREE.Vector3(), to: new THREE.Vector3() },
  // "No Glass in the fire!": a camper winds up to toss a bottle, Tom S shouts, the
  // bottle never leaves his hand. Once a night, no gameplay effect.
  glass: { at: glassAt, phase: "pending", t: 0, tosser: null },
  shake: 0,
  don: { mesh: null, bubble: { text: "", until: 0, cls: "" }, gaveKeg: false },
  // Don M's mini keg (Bryan, 09/26; replaces the log). pours counts down as the
  // player tops off campers; steamUntil forces a visible steam burst when it goes
  // in the fire instead, even if that leaves fire.level at 0 (see updateSmoke).
  keg: { pours: 0, steamUntil: 0 },
  // Overheat (Bryan, 09/26): builds only at the fire while it's in Hell's Anus,
  // never below the hot line. forced blocks fire actions until it cools back down.
  heat: { level: 0, forced: false },
  smoke: { inIt: false, coughIn: 0 },
  sky: { kind: null, t: 0, nextIn: rand(EVENTS.skyMinGap, EVENTS.skyMaxGap) },
  pokeAnim: 0,
  // Pallet redesign (09/27/2026): palletRemembered gates the trigger (Johnny D
  // remembers it, once per night) separately from whether it was ever resolved
  // (palletBroken at the wood pile for +6 wood, or palletBurned when Tom S stops
  // you at the fire) — see config.js's POWERUPS comment and docs/DESIGN.md.
  powerups: { palletRemembered: false, palletBroken: false, palletBurned: false, gasEarned: false, gustsBlocked: 0 },
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
  // Tom W's truck: idle until updateMidnight() fires, then approach (driving in,
  // headlights fading up) -> stopped (parked, lights up on the campers) ->
  // fading (headlights down) -> done (parked for good, lights off). See
  // updateTruckArrival() below.
  truck: { phase: "idle", timer: 0, tom: null, path: null },
  log: [],
};

const keys = new Set();
let spacePressed = false;

// ---------- Touch device detection (docs/PHONE.md) ----------
// Starts touch on anything whose primary pointer is coarse (phones, iPads, even
// with a keyboard attached); a real gameplay key press switches to keyboard mode,
// a touch switches back. body.touch is the only hook into styles.css, so none of
// the existing desktop CSS or camera code needs to change.
let isTouch = (("ontouchstart" in window) || navigator.maxTouchPoints > 0);
try { if (matchMedia("(pointer: coarse)").matches === false) isTouch = false; } catch (e) { /* ignore */ }
// iPhone/iPad Safari cannot put a page into full screen (Apple's rule) and gets
// the one-time tip below instead; every other touch device gets requestFullscreen.
const isIOSDevice = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
function isStandaloneLaunch() {
  try { return window.navigator.standalone === true || matchMedia("(display-mode: standalone)").matches || matchMedia("(display-mode: fullscreen)").matches; } catch (e) { return false; }
}
function setTouchMode(on) { if (isTouch === on) return; isTouch = on; updateTouchCopy(); }
function applyTouchClass() { document.body.classList.toggle("touch", isTouch); }
// The title button says "Press Space" for keyboard players; there is no Space on a phone.
function updateTouchCopy() { ui.startBtn.textContent = isTouch ? "TAP TO CHOOSE YOUR CAMPER" : "PRESS SPACE TO CHOOSE YOUR CAMPER"; }
updateTouchCopy();
window.addEventListener("touchstart", () => setTouchMode(true), { passive: true });
window.addEventListener("keydown", (e) => {
  const k = e.key.toLowerCase();
  if (["arrowup", "arrowdown", "arrowleft", "arrowright", " ", "w", "a", "s", "d"].includes(k)) setTouchMode(false);
}, true);
applyTouchClass();

// Which side the floating stick lives on, remembered per device (pause menu toggle).
const CONTROLS_SIDE_KEY = "aij-controls-side";
function controlsSwapped() { try { return localStorage.getItem(CONTROLS_SIDE_KEY) === "right"; } catch (e) { return false; } }
function setControlsSwapped(swapped) {
  try { localStorage.setItem(CONTROLS_SIDE_KEY, swapped ? "right" : "left"); } catch (e) { /* ignore */ }
  document.body.classList.toggle("swap-controls", swapped);
  ui.controlsSideBtn.textContent = swapped ? "Controls: stick on the right" : "Controls: stick on the left";
}
setControlsSwapped(controlsSwapped());

// Floating analog stick: appears wherever the thumb lands inside stick-zone.
// Direction only (see updatePlayer: the vector is normalized then scaled to the
// same top speed as the arrow keys either way), tracked by pointerId so it keeps
// working at the same time as a separate finger on the action button.
const touchStick = { id: null, x: 0, y: 0, originX: 0, originY: 0, downAt: 0 };
const STICK_RADIUS = 72;   // raised from 55 (Bryan 09/26: "a little touchy"); full speed needs a longer drag
const STICK_DEAD = 0.12;   // ignore tiny thumb wobble
// Full screen (Bryan's phone play: "browser tabs reduce the screen space too
// much"). No one-shot latch: the only guard is "are we already full screen",
// so a tap can always ask again if the phone (or the player, or Android's own
// gesture) dropped out of it mid-night, without ever retrying on its own or
// looping. iOS Safari can't do page full screen at all (Apple's rule); the
// title-screen tip below covers that platform instead.
function tryRequestFullscreen() {
  if (!isTouch || isIOSDevice || document.fullscreenElement) return;
  const el = document.documentElement;
  if (el.requestFullscreen) el.requestFullscreen().catch(() => { /* blocked this time; the next tap tries again */ });
}
// Runs on the very first touch anywhere, title tap included, and on every tap
// after that (cheap no-op once already full screen), which is what makes the
// "re-request after it drops" behavior work without any extra bookkeeping.
window.addEventListener("pointerdown", tryRequestFullscreen, { capture: true, passive: true });

// Music on the title screen (Bryan 09/26: today it starts in the lobby after the
// first click; browsers block all audio until a real user gesture, so the first
// gesture anywhere on the title screen is that unlock). Runs once per page load:
// the guard is titleMusicStarted, not state.phase, because by the time a touch or
// keydown handler actually calls this, the SAME gesture may already have moved
// state.phase on to "select" (see the keydown listener below, where this is
// called before that happens deliberately so the phase check here still sees
// "start"). If the player has muted the music (musicEnabled() false, whether from
// a previous session or from an M press caught by the keydown listener before
// this runs), initSound() still primes the AudioContext on this gesture so a
// later M press can unmute instantly, but nothing is scheduled to play.
let titleMusicStarted = false;
function maybeStartTitleMusic() {
  if (titleMusicStarted || state.phase !== "start") return;
  titleMusicStarted = true;
  initSound();
  if (musicEnabled()) { playIntroThenLoop(); ui.musicChip.textContent = "MUSIC ON  (M)"; }
}
window.addEventListener("pointerdown", maybeStartTitleMusic, { capture: true, passive: true });
window.addEventListener("touchstart", maybeStartTitleMusic, { capture: true, passive: true });

// One-time iPhone Safari tip (docs/PHONE.md follow-up): since Safari can't go
// full screen on its own, point at Hide Toolbar / Add to Home Screen instead.
// Lives inside #start in index.html, so it is only ever visible on the title
// screen and never mid-night; localStorage remembers it was dismissed.
const IOS_TIP_KEY = "aij-ios-tip-seen";
function iosTipSeen() { try { return localStorage.getItem(IOS_TIP_KEY) === "1"; } catch (e) { return false; } }
if (isTouch && isIOSDevice && !isStandaloneLaunch() && !iosTipSeen()) ui.iosTip.hidden = false;
ui.iosTipBtn.addEventListener("click", () => {
  try { localStorage.setItem(IOS_TIP_KEY, "1"); } catch (e) { /* ignore */ }
  ui.iosTip.hidden = true;
});
function stickPointerDown(e) {
  // A new touch always takes over. The old guard (ignore if a pointer is already
  // held) froze the stick for the rest of the night whenever the browser lost a
  // pointerup (an iOS system gesture, a stray second finger); only pause cleared it.
  touchStick.id = e.pointerId;
  touchStick.originX = e.clientX; touchStick.originY = e.clientY;
  touchStick.downAt = performance.now();
  touchStick.x = 0; touchStick.y = 0;
  ui.stick.hidden = false;
  ui.stick.style.left = `${e.clientX}px`;
  ui.stick.style.top = `${e.clientY}px`;
  stickKnobEl.style.transform = "translate(0px, 0px)";
  try { ui.stickZone.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
  tryRequestFullscreen();
  e.preventDefault();
}
function stickPointerMove(e) {
  if (e.pointerId !== touchStick.id) return;
  let dx = e.clientX - touchStick.originX, dy = e.clientY - touchStick.originY;
  const len = Math.hypot(dx, dy);
  if (len > STICK_RADIUS) { dx = (dx / len) * STICK_RADIUS; dy = (dy / len) * STICK_RADIUS; }
  stickKnobEl.style.transform = `translate(${dx}px, ${dy}px)`;
  // Dead zone plus a gentle curve so small drags walk slowly and full speed is deliberate
  const r = Math.min(1, len / STICK_RADIUS), k = r < STICK_DEAD ? 0 : Math.pow((r - STICK_DEAD) / (1 - STICK_DEAD), 1.4) / (r || 1);
  touchStick.x = (dx / STICK_RADIUS) * k;
  touchStick.y = (dy / STICK_RADIUS) * k;
  e.preventDefault();
}
function stickPointerUp(e) {
  if (e.pointerId !== touchStick.id) return;
  // A quick tap with little movement, inside the stick zone, is tap-to-go
  // instead of a (null) drag; a real drag never gets here fast enough or
  // straight enough to qualify. See attemptTapToGo below.
  const heldMs = performance.now() - touchStick.downAt;
  const moved = Math.hypot(e.clientX - touchStick.originX, e.clientY - touchStick.originY);
  touchStick.id = null; touchStick.x = 0; touchStick.y = 0;
  ui.stick.hidden = true;
  if (heldMs < 260 && moved < 14) attemptTapToGo(e.clientX, e.clientY);
  e.preventDefault();
}
ui.stickZone.addEventListener("pointerdown", stickPointerDown);
ui.stickZone.addEventListener("pointermove", stickPointerMove);
ui.stickZone.addEventListener("pointerup", stickPointerUp);
ui.stickZone.addEventListener("pointercancel", stickPointerUp);
ui.stickZone.addEventListener("lostpointercapture", stickPointerUp);
// No fingers left on the screen means no stick, whatever events were dropped.
function clearStickIfNoTouches(e) {
  if (e.touches && e.touches.length > 0) return;
  if (touchStick.id === null) return;
  touchStick.id = null; touchStick.x = 0; touchStick.y = 0; ui.stick.hidden = true;
}
window.addEventListener("touchend", clearStickIfNoTouches, { capture: true, passive: true });
window.addEventListener("touchcancel", clearStickIfNoTouches, { capture: true, passive: true });
// Menu button sounds (Bryan 10/08/2026): every button in the title, lobby, pause
// menu and end card clicks. Gameplay buttons (action, pause) are left alone.
window.addEventListener("click", (e) => {
  const b = e.target && e.target.closest ? e.target.closest("button") : null;
  if (!b || !b.closest("#start, #select, #pause-overlay, #end")) return;
  uiClick(b.id === "play-btn" || b.id === "start-btn" || b.id === "resume-btn" ? "go" : "tick");
}, { capture: true });
// Audio: any gesture, or coming back to the page, wakes an interrupted context.
["pointerdown", "pointerup", "touchend", "click"].forEach((ev) => window.addEventListener(ev, unlockSound, { capture: true, passive: true }));

// Tap-to-go over open canvas (outside the stick zone and the action button,
// which have their own pointer handling above/below): a quick tap on an
// interactable elsewhere on screen walks the player there the same way.
let canvasTapDown = null;
canvas.addEventListener("pointerdown", (e) => { canvasTapDown = { x: e.clientX, y: e.clientY, t: performance.now() }; }, { passive: true });
canvas.addEventListener("pointerup", (e) => {
  if (!canvasTapDown) return;
  const heldMs = performance.now() - canvasTapDown.t;
  const moved = Math.hypot(e.clientX - canvasTapDown.x, e.clientY - canvasTapDown.y);
  canvasTapDown = null;
  if (heldMs < 260 && moved < 14) attemptTapToGo(e.clientX, e.clientY);
}, { passive: true });

// One big action button: does exactly what Space does (see the hint/label logic
// in updatePlayer). A separate pointerId from the stick, so both work together.
function setActionLabel(text) { ui.actionBtn.textContent = text; ui.actionBtn.classList.toggle("idle", !text); }   // idle: nothing to do here, button dims
ui.actionBtn.addEventListener("pointerdown", (e) => { spacePressed = true; tryRequestFullscreen(); e.preventDefault(); });

// Touch speech strip state (see updateTouchSpeech/resetTouchSpeech far below):
// declared here, ahead of buildCrew's own call further down, since buildCrew
// runs at module load time and resetTouchSpeech reads these immediately.
const CANON_SPEECH_MATCHES = ["What the hell was that", "No Glass in the fire", "No Pallets in the fire", "Beeeees", "Gentlemen"];
const SPEECH_DON_COLOR = "#c9a86a", SPEECH_ALAN_COLOR = "#ffb347";
const speechLanes = [null, null];
const speechBacklog = [];
const SPEECH_BACKLOG_MAX = 6;
let speechTickerLastText = "";
// Touch-only guard so ambient chatter (updateCampers' chatter block, below)
// never starts a new comment while the last one is still showing in the phone
// speech strip (Bryan, polish pass: comments "pile up" on phones). Desktop
// bubbles are unaffected -- this only ever gates on isTouch.
let chatterBubbleUntil = 0;
// Phone camera follow state (see updateCamera/actionCornerBoxes far below): also
// declared here ahead of buildCrew for the same reason as the speech state above.
const phoneFollowXZ = new THREE.Vector2(0, 0);
let lastActionTarget = null;
// Roughly a camper's own head height (HEAD_TOP in world.js is ~1.72, a hat adds
// a little more) — used to track the top of the player's own figure, not just
// their feet, when keeping the touch follow's tracked points on screen.
const PLAYER_HEAD_Y = 1.85;

// Signature props at the fire (backlog item, docs/CAMPERS.md "Looks"/roster
// table). Each entry is built fresh per seated NPC in buildCrew (below) and
// anchored to that camper's ORIGINAL, un-scooted chair position captured once
// at build time -- never re-read from c.chair/c.chairMesh afterward, so a
// later bear-ride-back reassignment (which repoints a DIFFERENT camper's
// chair/chairMesh at this one's chair) can never drag this prop along or
// leave it floating; see updateProps. `side`/`forward` are offsets in the
// chair's own local frame (right = sideways, forward = toward the fire,
// negative = toward the chair back); `lean` tilts the prop backward against
// the chair back (guitar, skis); `takesToBed` hides the prop while that
// camper is actually walking to bed or gone (his leaving line says he takes
// it) and shows it again the instant his state is anything else, including a
// bear ride-back reseating -- see docs/CAMPERS.md.
const PROP_BUILDERS = {
  "chris-occ": { build: buildGuitar, side: 1, forward: -0.2, lean: true, takesToBed: true },
  "razoo": { build: buildTrumpet, side: 1, forward: 0.2 },
  "bryan-j": { build: buildBourbonGlass, side: 1, forward: 0.2 },
  "spitty": { build: buildYogurtCup, side: -1, forward: 0.2, takesToBed: true },
  "perry-s": { build: buildCheesePuffsBag, side: 1, forward: 0.2 },
  "tom-s": { build: buildCoffeeMug, side: -1, forward: 0.2 },
  "brian-r": { build: buildWaterSkis, side: -1, forward: -0.2, lean: true },
  "scott-k": { build: buildFlightHelmet, side: 1, forward: 0.2 },
  // Johnny D's cornhole set is a fixed camp fixture (too big to sit beside a
  // chair), built once at module scope above as cornholeMesh -- no entry here.
};
// Builds `spec.build()`, orients it to face the fire the same way the chair
// at `base` does, offsets it sideways/forward-back in that same local frame,
// and (if `spec.lean`) tilts it backward against the chair back. Returns the
// outer group (already added to the scene) and the local offset from `base`
// that updateProps re-applies every frame on top of the chair's own scoot.
function placePropAtChair(spec, base) {
  const inner = spec.build();
  if (spec.lean) inner.rotation.x = -0.24;
  const group = new THREE.Group();
  group.add(inner);
  const forwardDir = base.clone().multiplyScalar(-1); forwardDir.y = 0;
  if (forwardDir.lengthSq() < 1e-6) forwardDir.set(0, 0, 1); else forwardDir.normalize();
  const rightDir = new THREE.Vector3(forwardDir.z, 0, -forwardDir.x);
  const offset = rightDir.multiplyScalar(spec.side || 1).multiplyScalar(0.5).add(forwardDir.clone().multiplyScalar(spec.forward || 0));
  group.rotation.y = Math.atan2(forwardDir.x, forwardDir.z);
  scene.add(group);
  return { group, offset };
}

// Lobby-emote hand props (optional backlog step, "if cheap": hold the prop
// during the matching emote). Built once per pick alongside the ground rig
// above and parented to the matching forearm's elbow group (world.js's
// makeArmRefined/buildRefinedCamper expose elbowL/elbowR in userData.parts),
// so it inherits that whole limb's rotation -- both the fixed idle elbow
// bend and animateEmote's own shoulder-pivot animation -- for free; nothing
// here has to re-track the hand per frame, only toggle .visible. Skipped for
// Perry (tossing single puffs, not the bag), Johnny D (throwing motion,
// no separate single-bean-bag mesh), and Brian R (skis were not asked to be
// held); Scott K's helmet is handled separately below since it swaps onto
// the head, not a hand. Tom S holds a Yeti-style tumbler for his "Yeti
// Cheers" emote (09/27: replaces the old coffee-mug-on-the-forearm look,
// which read like a bloody arm injury); his chairside ground prop stays the
// coffee mug (PROP_BUILDERS above), so the two props are deliberately
// different now. Bryan J has no entry here any more: his "Trump Dance"
// emote (09/27, replacing Bourbon Toast) doesn't hold the bourbon glass, so
// there is nothing for this map to show during his emote (PROP_BUILDERS
// above still gives him the glass at his chair). Spitty's spoon is handled
// separately below (his own bespoke rig, like Johnny D's bag), since it has
// to travel between the cup and his mouth rather than just toggle visible.
const HELD_PROP_BUILDERS = {
  "chris-occ": { build: buildGuitar, arm: "armR", pos: [0, -0.16, 0.1], rot: [1.3, 0, 0.25] },
  "razoo": { build: buildTrumpet, arm: "armR", pos: [0.04, -0.32, 0.09], rot: [0, 0.15, 0] },
  "tom-s": { build: buildYetiTumbler, arm: "armR", pos: [0, -0.24, 0.06], rot: [0, 0, 0] },
  "spitty": { build: buildYogurtCup, arm: "armL", pos: [0, -0.3, 0.05], rot: [0, 0, 0] },
};
// Local Y offset (within the head group) that lands a hat at the same spot
// world.js's own cap does -- matches world.js's CAP_Y (NECK_H + HEAD_R*2 -
// 0.08 = 0.03 + 0.34 - 0.08); not exported, so kept in sync here by value.
const CAP_Y_OFFSET = 0.29;

// Player and crew. Rebuilt when a different camper is picked on the title screen.
let player = null;
let campers = [];
let propRigs = {};   // camper id -> { group, base, offset, hideWhenGone }
function buildCrew(data) {
  if (player) scene.remove(player.mesh);
  campers.forEach((c) => { scene.remove(c.mesh); scene.remove(c.chairMesh); if (c.bubble.el) c.bubble.el.remove(); });
  Object.values(propRigs).forEach((rig) => scene.remove(rig.group));
  propRigs = {};
  ui.bubbles.innerHTML = "";
  resetTouchSpeech();
  actionRing.visible = false;
  lastActionTarget = null;
  phoneFollowXZ.set(0, 0);
  player = { data, mesh: makeCamperMesh(data), pos: new THREE.Vector3(0, 0, 4.6), carrying: null, carryMesh: null, bubble: { text: "", until: 0, cls: "" }, stickMesh: null, autoWalkTarget: null };
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
    if (!cd.arrivesAtMidnight) setSeated(mesh, true);   // seated from the title screen on, not only once the night starts
    scene.add(mesh);
    const c = {
      data: cd, mesh, chair, chairMesh, scoot: 0,
      comfort: CAMPER.startComfort,
      chill: cd.id === CAMPER.firstToBedId ? CAMPER.firstToBedChill : rand(CAMPER.chillMin, CAMPER.chillMax),
      fall: 0,
      state: cd.arrivesAtMidnight ? "away" : "seated",
      leaveTimer: 0,
      saidCold: false,
      kegged: false,   // topped off from Don M's keg, once per camper (see findKegTarget)
      walkTarget: null,
      walkTo: i % 2 === 0 ? LAYOUT.cabinDoor : LAYOUT.camperDoor,
      bubble: { text: "", until: 0, cls: "" },
    };
    if (c.state === "away") mesh.visible = false;
    const spec = PROP_BUILDERS[cd.id];
    if (spec) {
      const base = chair.clone();   // snapshot before any scoot/bear-reassignment ever touches this camper's chair
      const { group, offset } = placePropAtChair(spec, base);
      propRigs[cd.id] = { group, base, offset, hideWhenGone: !!spec.takesToBed };
    }
    return c;
  });
  // Scott K's flight helmet doubles as a lobby-emote prop (Black Hawk): built
  // once per pick, parented to his own head so it inherits the head's tilt,
  // hidden by default and only shown (with his cap swapped off) in
  // animateEmote below. Skipped for any other pick.
  player.helmetMesh = null;
  if (data.id === "scott-k") {
    const helmet = buildFlightHelmet();
    // buildFlightHelmet() is authored for the ground rig (sitting upright,
    // visor facing outward at ground height); worn on the head the visor
    // needs to drop down and forward over the eyes or it just reads as a
    // plain dome. helmet.children is [shell, visor] (see buildFlightHelmet).
    helmet.children[1].position.y -= 0.05;
    helmet.children[1].position.z += 0.025;
    helmet.scale.setScalar(1.12);
    helmet.visible = false;
    // Sits lower than CAP_Y_OFFSET on purpose: the ground rig's dome only
    // spans from its own ground contact up to its crown (its full height),
    // so anchoring it at cap height leaves the whole thing floating above
    // the face with nothing at eye level. Dropping it here brings the
    // visor down near the brow instead of sitting like a snug beanie.
    helmet.position.y = 0.18;
    helmet.position.z = 0.01;
    player.mesh.userData.parts.head.add(helmet);
    player.helmetMesh = helmet;
  }
  // Lobby-emote hand prop (see HELD_PROP_BUILDERS above): same idea, parented
  // to the matching arm's elbow instead of the head.
  player.heldProp = null;
  const heldSpec = HELD_PROP_BUILDERS[data.id];
  if (heldSpec) {
    const held = heldSpec.build();
    held.position.set(...heldSpec.pos);
    held.rotation.set(...heldSpec.rot);
    held.visible = false;
    player.mesh.userData.parts[heldSpec.arm === "armL" ? "elbowL" : "elbowR"].add(held);
    player.heldProp = held;
  }
  // Spitty's lobby emote (Bryan 09/27): a spoon in the other hand (the yogurt
  // cup above is armL, see HELD_PROP_BUILDERS), parented to armR's elbow the
  // same way, but built separately since animateEmote below has to swing it
  // between the cup and his mouth rather than just toggle it visible.
  player.spoonProp = null;
  if (data.id === "spitty") {
    const spoon = buildSpoon();
    // Out at the hand (like the held props above), not at the elbow joint itself --
    // buildSpoon() builds it standing straight up from a y=0 base, so this offset
    // both moves it down the forearm to the hand and tips the handle so the bowl
    // reads forward instead of straight up past the wrist.
    spoon.position.set(0, -0.26, 0.07);
    spoon.rotation.set(-1.5, 0, 0);
    spoon.visible = false;
    player.mesh.userData.parts.elbowR.add(spoon);
    player.spoonProp = spoon;
  }
  // Johnny D's lobby emote (Bryan 09/27): a bean bag tossed hand to hand. The bag
  // lives on the figure's root so it can arc between the hands.
  player.juggleBag = null;
  if (data.id === "johnny-d") {
    const bag = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.06, 0.15), new THREE.MeshLambertMaterial({ color: "#1d3557", flatShading: true }));
    bag.castShadow = true; bag.visible = false;
    player.mesh.add(bag);
    player.juggleBag = bag;
  }
  window.__aij = { state, player, campers, propRigs, lightCigar, bubble, cornholeMesh, keys, renderer, camera, press: () => { spacePressed = true; }, speed: (window.__aij && window.__aij.speed) || 1, cfg: { FIRE, WIND, CAMPER, BEAR, EVENTS, PLAYER, LAYOUT, SMOKE, POWERUPS, KEG, HEAT, HEADLAMP, DIFFICULTY },
    // Headless stepping for tuning runs: advances the logic without waiting for animation frames
    step: (dt, n) => { for (let i = 0; i < n && state.phase === "playing"; i++) { update(dt); if (window.__aij.bot) window.__aij.bot(dt); } return state.phase; },
    start: () => { if (state.phase === "start") goToLobby(); if (state.phase === "select") startNight(); return state.phase; },
    // Dev/test hook for the truck feature: jumps state.t to just past MIDNIGHT_MIN
    // (gameMinutes()'s inverse, minutesToT(), already exists above for the
    // can-beer/no-glass event windows) so updateMidnight() fires on the very next
    // update(). Does not itself call update() -- the caller's own step()/rAF loop
    // does that, same as any other state.t change.
    forceMidnight: () => { state.t = minutesToT(MIDNIGHT_MIN) + 0.05; return state.t; } };
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
// Anything that takes focus away drops every held key, so nothing sticks. On a
// phone, losing focus (switching apps, locking the screen) also opens the pause
// menu (docs/PHONE.md); keyboard devices are unaffected.
window.addEventListener("blur", () => { keys.clear(); if (isTouch && state.phase === "playing") pause(); });
document.addEventListener("visibilitychange", () => { if (!document.hidden) unlockSound(); if (document.hidden) { keys.clear(); if (isTouch && state.phase === "playing") pause(); } });

function goToLobby() {
  if (state.phase !== "start") return;
  ui.start.hidden = true;
  ui.select.hidden = false;
  state.phase = "select";
  player.pos.copy(LOBBY_SPOT);
  player.mesh.position.copy(player.pos);
  initSound();
  // The title screen's first gesture (see maybeStartTitleMusic above) has
  // normally already started the intro-into-loop by the time this runs, since
  // clicking Start or pressing Space/Enter is itself that first gesture; startLoop
  // is a no-op once the loop is already going, so this never doubles or restarts
  // it. The startLoop() call here only matters if the player backed out to the
  // title screen and is re-entering the lobby with the scheduler stopped.
  if (musicEnabled() && !musicActive()) startLoop();
  ui.musicChip.textContent = musicEnabled() ? "MUSIC ON  (M)" : "MUSIC OFF  (M)";
}
const DIFF_KEY = "aij-diff";
const RESTART_CAMPER_KEY = "aij-restart-camper";
const RESTART_AUTO_KEY = "aij-restart-auto";
function setDifficulty(key) {
  if (!DIFFICULTY[key]) key = "camp";
  state.diff = key;
  try { localStorage.setItem(DIFF_KEY, key); } catch (e) { /* ignore */ }
  document.querySelectorAll(".diff-btn").forEach((b) => b.classList.toggle("on", b.dataset.diff === key));
}
document.querySelectorAll(".diff-btn").forEach((b) => b.addEventListener("click", () => setDifficulty(b.dataset.diff)));
try { setDifficulty(localStorage.getItem(DIFF_KEY) || "camp"); } catch (e) { setDifficulty("camp"); }

// ---------- Pause menu (docs/PHONE.md), all devices ----------
// Pausing sets state.paused, which the frame loop (below) uses to skip update()
// entirely: the clock, fire, campers, bear, events and every snack/beer/glass
// timer all live inside update(), so freezing that one call freezes the whole
// night at once. render() keeps running so the (now-static) scene stays visible,
// dimmed by the overlay drawn on top of it.
function refreshMusicUI() {
  const on = musicEnabled();
  ui.musicChip.textContent = on ? "MUSIC ON  (M)" : "MUSIC OFF  (M)";
  ui.pauseMusicBtn.textContent = `MUSIC: ${on ? "ON" : "OFF"}`;
}
function updatePauseInfo() {
  ui.pauseSub.textContent = `${player.data.name} on ${DIFFICULTY[state.diff].name}, ${clockText()}`;
}
function pause() {
  if (state.phase !== "playing" || state.paused) return;
  state.paused = true;
  spacePressed = false;
  keys.clear();
  touchStick.id = null; touchStick.x = 0; touchStick.y = 0;
  ui.stick.hidden = true;
  ui.howtoPanel.hidden = true;
  updatePauseInfo();
  refreshMusicUI();
  ui.pauseOverlay.hidden = false;
  duckMusic(0);
}
function resume() {
  if (!state.paused) return;
  state.paused = false;
  ui.pauseOverlay.hidden = true;
  duckMusic(1);
}
function togglePause() { if (state.paused) resume(); else pause(); }
// A full reload is deliberate for both of these: it is the exact "wipe everything"
// mechanism the end-screen's own "Next camper" button already uses (see
// ui.restartBtn below), so neither one can ever leave a stray mesh, timer or
// bubble behind. Restart carries the current camper (and, via DIFF_KEY, the
// current difficulty) across the reload and jumps straight back into play.
function restartNight() {
  try {
    sessionStorage.setItem(RESTART_CAMPER_KEY, player.data.id);
    sessionStorage.setItem(RESTART_AUTO_KEY, "1");
  } catch (e) { /* ignore */ }
  location.reload();
}
function quitToTitle() {
  if (!window.confirm("Quit this night?")) return;
  try { sessionStorage.removeItem(RESTART_CAMPER_KEY); sessionStorage.removeItem(RESTART_AUTO_KEY); } catch (e) { /* ignore */ }
  location.reload();
}
// Esc from the lobby (not yet a night in progress, so no heavy reset needed).
function backToTitleFromLobby() {
  if (state.phase !== "select") return;
  ui.select.hidden = true;
  ui.start.hidden = false;
  state.phase = "start";
  stopMusic(1.2);
}
window.addEventListener("keydown", (e) => {
  const k = e.key.toLowerCase();
  if (k !== "escape" && k !== "p") return;
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  e.preventDefault();
  if (state.phase === "playing") togglePause();
  else if (state.phase === "select" && k === "escape") backToTitleFromLobby();
});
ui.pauseBtn.addEventListener("click", togglePause);
ui.resumeBtn.addEventListener("click", resume);
ui.restartNightBtn.addEventListener("click", restartNight);
ui.quitBtn.addEventListener("click", quitToTitle);
ui.pauseMusicBtn.addEventListener("click", () => { initSound(); toggleMusic(); refreshMusicUI(); });
ui.howtoBtn.addEventListener("click", () => {
  ui.howtoPanel.hidden = !ui.howtoPanel.hidden;
  // On a short phone screen the pause menu itself scrolls; make sure opening the
  // panel actually brings it into view instead of leaving it below the fold.
  if (!ui.howtoPanel.hidden) ui.howtoPanel.scrollIntoView({ block: "nearest" });
});
ui.controlsSideBtn.addEventListener("click", () => setControlsSwapped(!controlsSwapped()));

// Jumps straight into play, skipping the title and lobby screens: used only by
// the restart-detection block right below, after a pause-menu restart reload.
function quickStartNight() {
  if (state.phase !== "start") return;
  ui.start.hidden = true;
  state.phase = "select";
  initSound();
  startNight();
}
(function resumeFromRestart() {
  let forcedId = null, auto = false;
  try {
    forcedId = sessionStorage.getItem(RESTART_CAMPER_KEY);
    auto = sessionStorage.getItem(RESTART_AUTO_KEY) === "1";
    sessionStorage.removeItem(RESTART_CAMPER_KEY);
    sessionStorage.removeItem(RESTART_AUTO_KEY);
  } catch (e) { /* ignore */ }
  if (!auto) return;
  const forced = forcedId && roster.find((c) => c.id === forcedId);
  if (forced) pickCamper(forced);
  quickStartNight();
})();

function startNight() {
  if (state.phase !== "select") return;
  const d = DIFFICULTY[state.diff];
  state.wood = d.wood; state.gas = d.gas; state.burn = d.burn;
  syncWoodPile();
  ui.select.hidden = true;
  startCrackle();
  startLoop();
  document.getElementById("hud").hidden = false;
  state.phase = "playing";
  resetPose(player.mesh);
  // animateEmote only runs during the lobby (updateCamera's "select" branch),
  // so its own per-frame resets stop the instant this leaves "select" -- clear
  // any lobby-emote hold/swap here or the player would carry a floating prop,
  // or spawn helmeted, for the rest of the night. resetPose (above) already
  // zeroes elbowL/elbowR and kneeL/kneeR generically, so a bent elbow or knee
  // from any emote (Johnny D's throw, Bryan J's dance, Perry's flap, Spitty's
  // spoon) is covered without a per-camper case here; only prop/helmet
  // *visibility* (not a pose) still needs clearing by hand below.
  if (player.heldProp) player.heldProp.visible = false;
  if (player.spoonProp) player.spoonProp.visible = false;
  if (player.juggleBag) player.juggleBag.visible = false;
  if (player.helmetMesh) { player.helmetMesh.visible = false; const p = player.mesh.userData.parts; if (p.cap) p.cap.visible = true; }
  player.pos.set(0, 0, 4.6);
  player.mesh.position.copy(player.pos);
  say(`${player.data.name}, it's 9 PM. Keep the fire going until 5:30.`, 6);
  showBanner("KEEP THE FIRE GOING", COACH.bannerSeconds);
}
ui.startBtn.addEventListener("click", goToLobby);
ui.playBtn.addEventListener("click", startNight);
window.addEventListener("keydown", (e) => {
  if (e.key.toLowerCase() === "m" && !e.metaKey && !e.ctrlKey) { initSound(); const on = toggleMusic(); ui.musicChip.textContent = on ? "MUSIC ON  (M)" : "MUSIC OFF  (M)"; return; }
  // Runs before goToLobby() below can move state.phase off "start", and after the
  // M check above (so an M press as the player's very first key mutes before this
  // ever tries to start anything, instead of a note sneaking out first).
  maybeStartTitleMusic();
  if (state.phase === "start" && (e.key === " " || e.key === "Enter")) { e.preventDefault(); uiClick("go"); goToLobby(); }
  else if (state.phase === "select") {
    if (e.key === " " || e.key === "Enter") { e.preventDefault(); uiClick("go"); startNight(); }
    else if (e.key === "ArrowLeft" || e.key.toLowerCase() === "a") { e.preventDefault(); uiClick(); cyclePick(-1); }
    else if (e.key === "ArrowRight" || e.key.toLowerCase() === "d") { e.preventDefault(); uiClick(); cyclePick(1); }
  }
});

const GAME_CAM = new THREE.Vector3(0, 12.5, 14);
const GAME_LOOK = new THREE.Vector3(0, 0, 0);
// Closer phone camera (Bryan's phone play, 09/26: "stuff on screen feels small,
// cam in a little"). Pulled in from the original (0, 9.5, 9.5) looking at
// (0, 0, 0.8) by about 1.45x, which puts campers and the fire at roughly that
// much bigger on screen. The look target also moved from +0.8 to -0.3 (deeper
// into the ring, away from the player's own starting spot): a pure zoom around
// the old look point pushed the far side of the chair ring past the top HUD
// strip, since it was already close to that edge before zooming; recentering
// on a point slightly past the fire brings the far chairs back down into frame
// with the same zoom, while the near side just loses a little empty ground that
// was never doing anything. Verified in the browser that every chair, the fire
// and every interactable clear the top strip at rest. Keyboard devices never
// see this (isTouch stays false), so GAME_CAM/GAME_LOOK are untouched.
// Bryan 09/26 (second note, after playing the halfway-back version live): "zoom
// out a little more than the current live values." A third of the way from the
// live (0, 8.0, 7.6)/(0, 0, 0.25) toward the older, more zoomed-out (0, 9.5, 9.5)/
// (0, 0, 0.8) that the halfway point itself was split from.
const PHONE_CAM = new THREE.Vector3(0, 8.5, 8.23);
const PHONE_LOOK = new THREE.Vector3(0, 0, 0.43);
const LOBBY_SPOT = new THREE.Vector3(1.9, 0, 4.3);   // forward of the empty chair so emotes do not clip it (Bryan, 09/25)
const LOBBY_CAM = new THREE.Vector3(1.0, 2.3, 10.3);   // camera and look moved with the spot, same framing
const LOBBY_LOOK = new THREE.Vector3(1.4, 1.0, 3.9);
const camLook = new THREE.Vector3(0, 1, 0);
// phoneFollowXZ (declared earlier, alongside the other buildCrew-adjacent state)
// is the current eased pan offset, shared by both camera.position and camLook so
// the framing shifts as one piece; lastActionTarget (also declared earlier) is
// the world (x,z) the action ring is currently pointing at, set at the end of
// updatePlayer's hint/label block each frame (null when the button wouldn't do
// anything right now) — updateCamera below keeps it on screen too, alongside
// the player, so walking up to an interactable brings it into view.

// ---------- Screen-space follow geometry (touch only) ----------
// Projects a world (x,y,z) point to CSS-pixel screen coordinates using the
// camera's CURRENT matrices. Mirrors the projection math the bubbles/markers
// already use elsewhere in this file. y defaults to ground level.
function projectToScreenPx(x, z, y = 0) {
  const v = new THREE.Vector3(x, y, z).project(camera);
  return { x: (v.x + 1) / 2 * window.innerWidth, y: (1 - v.y) / 2 * window.innerHeight };
}
// The two corner boxes to keep clear: the action button's own footprint
// (wherever it actually renders — left or right, already accounting for the
// controls-side toggle and safe-area insets, since this reads its real
// bounding box) and a mirrored footprint in the opposite corner, standing in
// for the floating stick, which only exists in the DOM while a finger is down.
// Both get buttonMarginPx of extra clearance in neededScreenCorrection below,
// not baked in here, so this stays the button's true rect. Recomputed each
// frame since it's just one getBoundingClientRect() call.
// The phone HUD's two fixed corner panels -- the left rail (pause button +
// fire meter) and the top-right card (clock + wood/gas) -- as their REAL,
// currently-rendered boxes (docs/PHONE.md's approved layout). Read straight
// off getBoundingClientRect() rather than duplicating styles.css's numbers
// here, so a CSS change to either panel (a longer wood/gas count reflowing
// the card, a safe-area inset change, etc.) is picked up automatically by
// both this and updatePhoneSpeechBounds() below, from one measurement.
// Neither panel moves for the controls-side swap, so there is only one
// version of each, unlike the button/stick boxes below.
function measureHudFootprint() {
  const w = window.innerWidth;
  const p = ui.pauseBtn.getBoundingClientRect();
  const m = ui.meterPanel.getBoundingClientRect();
  const c = ui.clockPanel.getBoundingClientRect();
  return {
    rail: { left: 0, right: Math.max(p.right, m.right), top: 0, bottom: Math.max(p.bottom, m.bottom) },
    card: { left: c.left, right: w, top: 0, bottom: c.bottom },
  };
}
function actionCornerBoxes() {
  const w = window.innerWidth, h = window.innerHeight;
  const r = ui.actionBtn.getBoundingClientRect();
  const onRight = r.left > w / 2;
  const btnBox = onRight ? { left: r.left, right: w, top: r.top, bottom: h } : { left: 0, right: r.right, top: r.top, bottom: h };
  const stickBox = onRight ? { left: 0, right: r.width, top: r.top, bottom: h } : { left: w - r.width, right: w, top: r.top, bottom: h };
  const { rail, card } = measureHudFootprint();
  return { btnBox, stickBox, railBox: rail, cardBox: card, topSafe: PHONE_FOLLOW.topSafePx };
}
// How far (in screen px, signed) a point needs to move to get back onto screen
// with real breathing room — edgePx from every side, clear of the top strip,
// and buttonMarginPx clear of both corner boxes — whichever of those asks for
// the most correction on each axis wins (so, say, a point that is both past
// the right edge AND inside the button's corner box doesn't have one
// requirement quietly overwritten by the other). Zero in both axes when the
// point is already safe — this IS the "nothing moves at rest" deadzone, rather
// than a separate distance check. skipBottom exists for the player's own feet:
// the base framing has always let the player's own feet crop at the bottom
// edge (a third-person camera doesn't need to show your own feet, and this was
// already the accepted look before this fix) — holding THAT to the same 70px
// bottom margin as everything else would pan the camera even at rest, failing
// "at rest, nothing moves." Left/right/button/stick/top clearance still apply
// to the player's feet exactly like any other tracked point.
function neededScreenCorrection(x, y, boxes, skipBottom) {
  const w = window.innerWidth, h = window.innerHeight;
  const edge = PHONE_FOLLOW.edgePx, bm = PHONE_FOLLOW.buttonMarginPx;
  let dx = 0, dy = 0;
  const consider = (cdx, cdy) => { if (Math.abs(cdx) > Math.abs(dx)) dx = cdx; if (Math.abs(cdy) > Math.abs(dy)) dy = cdy; };
  // Plain "stay on screen, with margin" first: a target the camera hasn't
  // panned toward yet (e.g. a tap-to-go destination just beyond the frame)
  // needs this before the corner/top rules below even apply.
  if (x < edge) consider(edge - x, 0);
  else if (x > w - edge) consider((w - edge) - x, 0);
  if (!skipBottom && y > h - edge) consider(0, (h - edge) - y);
  if (y < boxes.topSafe) consider(0, boxes.topSafe + 8 - y);
  for (const box of [boxes.btnBox, boxes.stickBox]) {
    const left = box.left - bm, right = box.right + bm, top = box.top - bm, bottom = box.bottom + bm;
    if (x <= left || x >= right || y <= top || y >= bottom) continue;
    // Always escape horizontally, toward screen center, never vertically. Both
    // corner boxes are anchored to the bottom of the screen and open upward, so
    // "the nearer edge is up" is often numerically true for a point near their
    // top — but sliding it up only clears THIS box's rectangle on paper while
    // leaving it just as deep into the button/stick's actual horizontal
    // footprint, which is what a real thumb (or eye) cares about. Horizontal
    // pushes also combine cleanly across several tracked points (all toward
    // the same center), where a mix of horizontal-for-one/vertical-for-another
    // fought each other and stalled short of clearing everything.
    const onLeftEdge = box.left === 0;
    const pushX = onLeftEdge ? (right + 4 - x) : (left - 4 - x);
    consider(pushX, 0);
  }
  // The left rail and the top-right card (boxes.railBox/cardBox, from
  // measureHudFootprint in actionCornerBoxes above) are anchored to the TOP
  // of the screen and open downward -- the opposite of the button/stick boxes
  // just above, which are anchored to the bottom and open upward. A point
  // caught inside one of these escapes by moving straight down, clear of its
  // bottom edge, rather than sideways: unlike the bottom corners, there is no
  // "toward center" direction that's short for a box hugging the top edge.
  for (const box of [boxes.railBox, boxes.cardBox]) {
    if (!box) continue;
    const left = box.left - bm, right = box.right + bm, bottom = box.bottom + bm;
    if (x <= left || x >= right || y >= bottom) continue;
    consider(0, bottom + 4 - y);
  }
  return { dx, dy };
}
// Measures where world point (px,py,pz) lands on screen at a given follow
// offset, and how fast that screen position moves per unit of follow — a value
// plus a numerical Jacobian — by nudging the camera rig to that offset and two
// nearby ones and reading pixels back each time. The camera is restored to its
// real, live position/look before returning, so none of this is ever visible.
function measureAtFollow(px, pz, fx, fz, py = 0) {
  const eps = 0.4;
  const realPos = camera.position.clone(), realLook = camLook.clone();
  function at(afx, afz) {
    camera.position.set(PHONE_CAM.x + afx, PHONE_CAM.y, PHONE_CAM.z + afz);
    camera.lookAt(PHONE_LOOK.x + afx, PHONE_LOOK.y, PHONE_LOOK.z + afz);
    camera.updateMatrixWorld(true);
    return projectToScreenPx(px, pz, py);
  }
  const p0 = at(fx, fz);
  const px1 = at(fx + eps, fz);
  const pz1 = at(fx, fz + eps);
  camera.position.copy(realPos); camLook.copy(realLook); camera.lookAt(camLook); camera.updateMatrixWorld(true);
  return { p0, dxdfx: (px1.x - p0.x) / eps, dydfx: (px1.y - p0.y) / eps, dxdfz: (pz1.x - p0.x) / eps, dydfz: (pz1.y - p0.y) / eps };
}
// The total pan (from a hypothetical zero, not incremental from wherever the
// camera currently sits) that would bring every point in `points` (the player,
// and the current action target when there is one) into the safe box at once.
// Each round finds whichever tracked point is currently worst off (at the
// shared pan built up so far) and Newton-corrects the shared pan for that one;
// since correcting for the worst point moves everything else on screen too
// (same pan, same camera), a few rounds converge on one pan that satisfies
// both rather than blending two separately-solved answers whose x and z were
// only ever each other's partner — mixing an x from one with a z from the
// other doesn't actually re-verify as safe for either point. A perspective
// camera's screen response to a pan is not quite linear over a large
// correction either, which is the other reason this re-linearizes at its own
// running answer instead of taking one step and stopping. Solving from zero
// every frame, rather than nudging wherever the offset currently sits, is what
// makes the camera ease back to the base framing on its own once nothing needs
// correcting any more (Bryan: "at rest by the fire, nothing moves" — and the
// same mechanism un-does a pan once the player leaves whatever needed it).
let lastFollowWarnAt = -100;
function solveFollowForPoints(points, boxes) {
  let fx = 0, fz = 0;
  for (let i = 0; i < 16; i++) {
    let worstMag = 0, worstM = null, worstCorr = null;
    for (const p of points) {
      const m = measureAtFollow(p.x, p.z, fx, fz, p.y || 0);
      const corr = neededScreenCorrection(m.p0.x, m.p0.y, boxes, p.skipBottom);
      const mag = Math.hypot(corr.dx, corr.dy);
      if (mag > worstMag) { worstMag = mag; worstM = m; worstCorr = corr; }
    }
    if (!worstM) return { x: fx, z: fz }; // every tracked point already safe at this pan
    const det = worstM.dxdfx * worstM.dydfz - worstM.dxdfz * worstM.dydfx;
    if (!Number.isFinite(det) || Math.abs(det) < 1e-6) break;
    fx += (worstM.dydfz * worstCorr.dx - worstM.dxdfz * worstCorr.dy) / det;
    fz += (worstM.dxdfx * worstCorr.dy - worstM.dydfx * worstCorr.dx) / det;
    // maxShift is a hard safety clamp (a pathological Jacobian, or a point that
    // truly cannot be satisfied, must not fling the camera arbitrarily far);
    // clamp inside the loop too so a mid-loop overshoot doesn't throw off the
    // next round's linearization point.
    const len = Math.hypot(fx, fz);
    if (len > PHONE_FOLLOW.maxShift) { fx = fx / len * PHONE_FOLLOW.maxShift; fz = fz / len * PHONE_FOLLOW.maxShift; }
  }
  // Ran out of rounds without every point reporting safe — log it (throttled)
  // rather than silently shipping a pan that still leaves something exposed.
  if (state.t - lastFollowWarnAt > 2) {
    lastFollowWarnAt = state.t;
    let worstMag = 0;
    for (const p of points) {
      const m = measureAtFollow(p.x, p.z, fx, fz, p.y || 0);
      const corr = neededScreenCorrection(m.p0.x, m.p0.y, boxes, p.skipBottom);
      worstMag = Math.max(worstMag, Math.hypot(corr.dx, corr.dy));
    }
    if (worstMag > 1) console.warn(`[AIJ] phone follow could not fully clear the safe area (residual ${worstMag.toFixed(0)}px); maxShift may be too small for this spot.`);
  }
  return { x: fx, z: fz };
}
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
  } else if (isTouch) {
    keyLight.intensity += (0 - keyLight.intensity) * Math.min(1, dt * 3);
    // Screen-space follow (Bryan's phone play, 09/26 follow-up: the poker and
    // wood pile were landing right under the action button; then, at a real
    // figure's and prop's actual size, still half off-edge/jammed on the button
    // even though the single ground point checked out — a whole body and a
    // whole item need real clearance, not just their base). Every frame, solve
    // (see solveFollowForPoints) for the one pan that brings the player's feet
    // AND head, and the current action target's whole footprint AND top, inside
    // the safe box (actionCornerBoxes/neededScreenCorrection above) at once.
    // Solving from an absolute zero-pan baseline each frame (rather than
    // nudging wherever the offset currently sits) is what lets the camera ease
    // back to the base framing on its own the moment nothing needs correcting —
    // "at rest, nothing moves," and a pan un-does itself once the player leaves
    // whatever needed it. The desired offset itself is heavily damped, so a
    // correction never snaps.
    const boxes = actionCornerBoxes();
    const trackedPoints = [
      // Feet are allowed to crop below the bottom edge at rest (a pre-existing,
      // already-accepted framing choice from before this follow system existed),
      // so skip the bottom-edge check for this point only — left/right/top/
      // button/stick checks still apply to it.
      { x: player.pos.x, z: player.pos.z, y: 0, skipBottom: true },
      { x: player.pos.x, z: player.pos.z, y: PLAYER_HEAD_Y },
    ];
    if (lastActionTarget) {
      const t = lastActionTarget, r = t.radius;
      trackedPoints.push(
        { x: t.x - r, z: t.z - r, y: 0 }, { x: t.x + r, z: t.z - r, y: 0 },
        { x: t.x - r, z: t.z + r, y: 0 }, { x: t.x + r, z: t.z + r, y: 0 },
        { x: t.x, z: t.z, y: t.height },
      );
    }
    const want = solveFollowForPoints(trackedPoints, boxes);
    let wantX = want.x, wantZ = want.z;
    const wantLen = Math.hypot(wantX, wantZ);
    if (wantLen > PHONE_FOLLOW.maxShift) { wantX = wantX / wantLen * PHONE_FOLLOW.maxShift; wantZ = wantZ / wantLen * PHONE_FOLLOW.maxShift; }
    phoneFollowXZ.x += (wantX - phoneFollowXZ.x) * Math.min(1, dt * PHONE_FOLLOW.damp);
    phoneFollowXZ.y += (wantZ - phoneFollowXZ.y) * Math.min(1, dt * PHONE_FOLLOW.damp);
    camera.position.lerp(new THREE.Vector3(PHONE_CAM.x + phoneFollowXZ.x, PHONE_CAM.y, PHONE_CAM.z + phoneFollowXZ.y), Math.min(1, dt * 1.8));
    camLook.lerp(new THREE.Vector3(PHONE_LOOK.x + phoneFollowXZ.x, PHONE_LOOK.y, PHONE_LOOK.z + phoneFollowXZ.y), Math.min(1, dt * 1.8));
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
  // Elbows and knees (refined-rig joints, world.js buildRefinedCamper) also need
  // a hard reset here, not just arms/head/body: several emotes now bend one or
  // both (Bryan J's dance, Perry's flap, Spitty's spoon, Johnny D's throw), and
  // without this they'd stay bent when the pick changes in the lobby or the
  // night starts (this same function runs first thing in startNight, below).
  if (p.elbowL) p.elbowL.rotation.set(0, 0, 0);
  if (p.elbowR) p.elbowR.rotation.set(0, 0, 0);
  if (p.kneeL) p.kneeL.rotation.set(0, 0, 0);
  if (p.kneeR) p.kneeR.rotation.set(0, 0, 0);
}
function animateEmote(pl, t) {
  const m = pl.mesh, p = m.userData.parts;
  resetPose(m);
  m.position.copy(pl.pos);
  m.rotation.y = 0; // face the camera
  // Signature-prop hold (backlog step 4, "if cheap"): reset every frame, same
  // as the pose above, so switching picks in the lobby never leaves a prop or
  // a swapped helmet stuck showing on whoever is picked next.
  if (pl.heldProp) pl.heldProp.visible = false;
  if (pl.spoonProp) pl.spoonProp.visible = false;
  if (pl.helmetMesh) { pl.helmetMesh.visible = false; if (p.cap) p.cap.visible = true; }
  const bob = Math.sin(t * 3) * 0.04;
  switch (pl.data.id) {
    case "tom-s": { // Yeti Cheers (09/27, replaces Coffee Mug Sip): raise the tumbler
      // up and out into a toast, a small tilt at the top, back down, repeat. The
      // swing is mostly on Z (up and OUT to the side, like a toast), not X (which
      // reads more like sipping toward the mouth) -- same axis the old Bourbon
      // Toast used for its big raise.
      const k = (t * 1.05) % 1;
      let lift; // 0 (down) -> 1 (raised out) -> 0, with a hold at the top for the tilt
      if (k < 0.35) lift = k / 0.35;
      else if (k < 0.65) lift = 1;
      else lift = 1 - (k - 0.65) / 0.35;
      const tilt = (k >= 0.35 && k < 0.65) ? Math.sin((k - 0.35) / 0.3 * Math.PI) * 0.14 : 0;
      // Raised up and forward over his head, slight bend at the elbow (Opus, 09/27:
      // the first pass laid the tumbler sideways across his chest).
      p.armR.rotation.x = -0.35 - lift * 2.0;
      p.armR.rotation.z = -0.12 - lift * 0.3;
      if (p.elbowR) p.elbowR.rotation.x = -0.25 - lift * 0.35;
      p.head.rotation.x = -lift * 0.15;
      p.head.rotation.z = tilt * 0.12;
      m.position.y = bob * 0.4;
      if (pl.heldProp) {
        // Keep the tumbler upright in the world whatever the arm does, with the
        // small cheers tilt toward the fire at the top.
        const cup = pl.heldProp;
        m.updateMatrixWorld(true);
        const parentQ = cup.parent.getWorldQuaternion(new THREE.Quaternion());
        const want = m.getWorldQuaternion(new THREE.Quaternion()).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(tilt * 1.4, 0, -0.1)));
        cup.quaternion.copy(parentQ.invert().multiply(want));
        // Seat it in the fist, pushed toward the camera so the hand never hides it.
        const grip = cup.parent.localToWorld(new THREE.Vector3(0, -0.27, 0)).add(new THREE.Vector3(0, -0.06, 0.1));
        cup.position.copy(cup.parent.worldToLocal(grip));
        cup.visible = true;
      }
      break; }
    case "chris-occ": // air guitar -- now a real one, held against the body
      p.armL.rotation.x = -1.2; p.armL.rotation.z = 0.5;
      p.armR.rotation.x = -0.9 + Math.sin(t * 12) * 0.35; p.armR.rotation.z = -0.3;
      m.rotation.y = Math.sin(t * 1.5) * 0.35; m.position.y = Math.abs(Math.sin(t * 6)) * 0.08;
      if (pl.heldProp) pl.heldProp.visible = true; break;
    case "bryan-j": { // Trump Dance (09/27, replaces Bourbon Toast): elbows bent, fists
      // pumping alternately in front of the chest, hip sway, a small knee bounce.
      // No held glass for this one (the bourbon glass stays at his chair, see
      // HELD_PROP_BUILDERS above).
      const k = t * 2.6;
      const pumpL = Math.sin(k) * 0.55, pumpR = Math.sin(k + Math.PI) * 0.55;
      p.armL.rotation.x = -0.85 + pumpL; p.armR.rotation.x = -0.85 + pumpR;
      p.armL.rotation.z = 0.18; p.armR.rotation.z = -0.18;
      if (p.elbowL) p.elbowL.rotation.x = -1.5;
      if (p.elbowR) p.elbowR.rotation.x = -1.5;
      const bounce = Math.abs(Math.sin(k * 0.5));
      m.rotation.z = Math.sin(k * 0.5) * 0.09;              // side-to-side hip sway
      m.position.x = pl.pos.x + Math.sin(k * 0.5) * 0.045;
      if (p.kneeL) p.kneeL.rotation.x = 0.12 + bounce * 0.16;
      if (p.kneeR) p.kneeR.rotation.x = 0.12 + bounce * 0.16;
      m.position.y = bounce * 0.045;                        // small knee bounce
      break; }
    case "brian-r": // pond ski: crouch, arms back, lean
      m.scale.set(1, 0.85, 1); p.armL.rotation.x = 1.0; p.armR.rotation.x = 1.0;
      p.body.rotation.x = 0.25; p.head.rotation.x = 0.15;
      m.rotation.z = Math.sin(t * 2.2) * 0.18; m.position.y = Math.abs(Math.sin(t * 4.4)) * 0.05; break;
    case "perry-s": { // Puff Bounce (09/27, replaces Cheese Puff Toss): knees bend in a
      // bounce while both elbows lift up and out, chicken-flap style, rhythmic.
      const k = t * 3.2;
      const flap = Math.sin(k);
      const bounce = Math.abs(Math.sin(k * 0.5));
      p.armL.rotation.x = -0.5; p.armR.rotation.x = -0.5;
      p.armL.rotation.z = -0.95 - flap * 0.15; p.armR.rotation.z = 0.95 + flap * 0.15;   // out to the sides (see scott-k's sign convention)
      if (p.elbowL) p.elbowL.rotation.x = -1.3 - flap * 0.2;
      if (p.elbowR) p.elbowR.rotation.x = -1.3 + flap * 0.2;
      if (p.kneeL) p.kneeL.rotation.x = 0.15 + bounce * 0.25;
      if (p.kneeR) p.kneeR.rotation.x = 0.15 + bounce * 0.25;
      m.position.y = bounce * 0.06;
      break; }
    case "johnny-d": { // bean bag tossed hand to hand (Bryan 09/27)
      const k = (t * 0.85) % 1;               // one full left-right-left cycle
      const half = k < 0.5 ? 0 : 1, u = (k % 0.5) * 2;
      // Forearms forward, hands at belly height; the catching hand dips on the catch.
      const dipL = half === 1 && u > 0.85 ? 0.12 : 0, dipR = half === 0 && u > 0.85 ? 0.12 : 0;
      p.armL.rotation.x = -0.35 + dipL; p.armR.rotation.x = -0.35 + dipR;
      p.armL.rotation.z = 0.12; p.armR.rotation.z = -0.12;
      if (p.elbowL) p.elbowL.rotation.x = -1.1;
      if (p.elbowR) p.elbowR.rotation.x = -1.1;
      p.head.rotation.y = (half === 0 ? -1 : 1) * (u - 0.5) * 0.5;   // eyes follow the bag
      m.position.y = bob * 0.5;
      const bag = pl.juggleBag;
      if (bag) {
        m.updateMatrixWorld(true);
        const handPos = (elbow) => {
          let low = null;
          elbow.children.forEach((ch) => { if (ch.isMesh && (!low || ch.position.y < low.position.y)) low = ch; });
          return m.worldToLocal((low || elbow).getWorldPosition(new THREE.Vector3()));
        };
        const L = handPos(p.elbowL || p.armL), R = handPos(p.elbowR || p.armR);
        const from = half === 0 ? L : R, to = half === 0 ? R : L;
        bag.position.lerpVectors(from, to, u);
        bag.position.y += 0.06 + 4 * u * (1 - u) * 0.36;
        bag.position.z += 0.14;   // out in front of the chest, not through it
        bag.rotation.set(u * 3.0, 0, u * 1.2);
        bag.visible = true;
      }
      break; }
    case "spitty": { // Yogurt Spoon (Bryan 09/27): cup steady in the left hand, the
      // spoon held up bowl-first and waved in the air with the right.
      const w = Math.sin(t * 6);
      p.armL.rotation.x = -1.3; p.armL.rotation.z = 0.35;   // yogurt cup, steady
      p.armR.rotation.x = -2.3; p.armR.rotation.z = 0.45 + w * 0.3;   // out to his side, clear of his face
      if (p.elbowR) p.elbowR.rotation.x = -0.35 + w * 0.2;
      p.head.rotation.x = -0.2; p.head.rotation.z = w * 0.08;
      m.position.y = bob;
      if (pl.heldProp) pl.heldProp.visible = true;
      const spoon = pl.spoonProp;
      if (spoon) {
        // Bowl up in the world whatever the arm does, rocking with the wave;
        // seated in the fist and nudged toward the camera so the hand never hides it.
        m.updateMatrixWorld(true);
        const parentQ = spoon.parent.getWorldQuaternion(new THREE.Quaternion());
        const want = m.getWorldQuaternion(new THREE.Quaternion()).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, -w * 0.45)));
        spoon.quaternion.copy(parentQ.invert().multiply(want));
        const grip = spoon.parent.localToWorld(new THREE.Vector3(0, -0.27, 0)).add(new THREE.Vector3(0, -0.05, 0.09));
        spoon.position.copy(spoon.parent.worldToLocal(grip));
        spoon.scale.setScalar(1.7);   // big enough to read at lobby distance
        spoon.visible = true;
      }
      break; }
    case "razoo": // trumpet solo: both arms up front, lean back, bounce
      p.armL.rotation.x = -1.6; p.armR.rotation.x = -1.5; p.armL.rotation.z = 0.25; p.armR.rotation.z = -0.25;
      p.body.rotation.x = -0.15; p.head.rotation.x = -0.35 + Math.sin(t * 9) * 0.06;
      m.position.y = Math.abs(Math.sin(t * 7)) * 0.07;
      if (pl.heldProp) pl.heldProp.visible = true; break;
    case "scott-k": // black hawk: arms out, spin, hover, helmet swapped in for his cap
      p.armL.rotation.z = -1.5; p.armR.rotation.z = 1.5;   // signs swapped 09/25: the old ones folded the arms behind his chest
      m.rotation.y = t * 4.5; m.position.y = 0.35 + Math.sin(t * 2) * 0.12;
      if (pl.helmetMesh) { pl.helmetMesh.visible = true; if (p.cap) p.cap.visible = false; } break;
    default:
      m.position.y = bob;
  }
}
ui.restartBtn.addEventListener("click", () => location.reload());


// ---------- Portrait (docs/PHONE.md) ----------
// Held upright on a phone: the rotate overlay, and the night paused underneath
// (the overlay just sits on top of the ordinary pause screen; rotating back to
// landscape reveals it rather than silently un-pausing).
function checkPortrait() {
  const portrait = isTouch && window.innerHeight > window.innerWidth;
  ui.portraitOverlay.classList.toggle("show", portrait);
  if (portrait && state.phase === "playing") pause();
}

// ---------- Quality step-down (docs/PHONE.md) ----------
// Full quality by default. Steps down once, in order, only if the average frame
// rate stays under ~40fps for a few seconds straight, and never steps back up.
let qualityTier = 0;
let fpsAvg = 60;
let lowFpsSeconds = 0;
function stepDownQuality() {
  if (qualityTier === 0) { qualityTier = 1; renderer.setPixelRatio(1); }
  else if (qualityTier === 1) {
    qualityTier = 2;
    fireLight.shadow.mapSize.set(256, 256);
    if (fireLight.shadow.map) { fireLight.shadow.map.dispose(); fireLight.shadow.map = null; }
  } else if (qualityTier === 2) { qualityTier = 3; fireLight.castShadow = false; }
}
const showFps = new URLSearchParams(location.search).has("fps");
if (showFps) ui.fpsCounter.hidden = false;
function updatePerf(dt) {
  const instFps = dt > 0.0001 ? 1 / dt : 60;
  fpsAvg += (instFps - fpsAvg) * 0.04;
  if (fpsAvg < 40) lowFpsSeconds += dt; else lowFpsSeconds = 0;
  if (lowFpsSeconds > 4 && qualityTier < 3) { stepDownQuality(); lowFpsSeconds = 0; }
  if (showFps) ui.fpsCounter.textContent = `${Math.round(fpsAvg)} fps  q${qualityTier}`;
}

// ---------- Loop ----------
let last = performance.now();
let errorCount = 0;
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  try {
    applyTouchClass();
    checkPortrait();
    if (state.phase === "playing" && !state.paused) {
      const steps = Math.max(1, Math.min(60, Math.round(window.__aij.speed || 1)));
      for (let i = 0; i < steps; i++) { update(dt); if (window.__aij.bot) window.__aij.bot(dt); if (state.phase !== "playing") break; }
    }
    updateCamera(dt);
    guardNumbers();
    render(dt);
    updatePerf(dt);
  } catch (err) {
    errorCount += 1;
    console.error("[AIJ] frame error", err);
    if (errorCount <= 3) reportError(err);
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// Faces (Bryan 09/27): scared while the bear is in camp or right after the can goes
// bang, happy for a moment after a keg pour, the gas fireball or Tom W showing up,
// cold when they are getting cold or heading to bed, otherwise neutral. The player
// is scared of the bear too and grimaces (the cold face) when overheated.
function updateExpressions() {
  const bearIn = state.bear.state !== "idle";
  const t = state.t;
  campers.forEach((c) => {
    let e = "neutral";
    if (bearIn || (c.scaredUntil || 0) > t) e = "scared";
    else if ((c.happyUntil || 0) > t) e = "happy";
    else if (c.state === "leaving" || c.comfort < CAMPER.coolBelow) e = "cold";
    if (c.expr !== e) { c.expr = e; setExpression(c.mesh, e); }
  });
  if (player) {
    const e = bearIn ? "scared" : state.heat.forced ? "cold" : "neutral";
    if (player.expr !== e) { player.expr = e; setExpression(player.mesh, e); }
  }
}

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

// Wood pile visual: depletes/restocks with state.wood. sync() no-ops unless
// wood or the difficulty's starting pile size actually changed since the last
// call, so calling it every frame costs nothing once the pile matches state.
function syncWoodPile() {
  woodPile.sync(state.wood, DIFFICULTY[state.diff].wood);
}

function update(dt) {
  state.t += dt;
  syncWoodPile();
  updatePlayer(dt);
  updateFire(dt);
  updateHeat(dt);
  updateWind(dt);
  updateCampers(dt);
  updateProps(dt);
  updateEvents(dt);
  updateSky(dt);
  updateHints(dt);
  updateBear(dt);
  animateBearWalk(dt);
  updateMidnight();
  updateTruckArrival(dt);
  updateCigars(dt);
  updateExpressions();
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
const ORIGIN_XZ = { x: 0, z: 0 }; // the fire pit's center, for the touch action ring below
// Keeps `pos` (the spot the player is about to stand on) out of every chair, every
// camper on his feet and the wood pile; `move` is this frame's intended step. Each
// obstacle is a circle (COLLIDE in config.js) and the player is pushed straight out
// of any he overlaps, which makes him slide around it. Walking dead-on at one would
// otherwise cancel the whole step and feel like glue, so when the push eats most of
// the step he is carried sideways around the circle instead, on whichever side the
// step was already leaning. Ends by re-applying the fire and clearing limits.
const _colliders = [];
function playerColliders() {
  _colliders.length = 0;
  campers.forEach((c) => {
    const seated = c.state === "seated";
    const cp = c.chairMesh.position, cl = Math.hypot(cp.x, cp.z) || 1;
    const k = seated ? 1 - COLLIDE.seatedShift / cl : 1;
    _colliders.push({ x: cp.x * k, z: cp.z * k, r: COLLIDE.chair });
    if (!seated && c.mesh.visible && ["leaving", "arriving", "walking", "toCooler", "atCooler"].includes(c.state)) _colliders.push({ x: c.mesh.position.x, z: c.mesh.position.z, r: COLLIDE.walker });
  });
  _colliders.push({ x: LAYOUT.woodPile.x, z: LAYOUT.woodPile.z, r: COLLIDE.woodPile });
  return _colliders;
}
function resolvePlayerCollisions(pos, move) {
  const list = playerColliders();
  const step = Math.hypot(move.x, move.z);
  const fromX = pos.x - move.x, fromZ = pos.z - move.z;
  for (let pass = 0; pass < 2; pass++) {
    for (const o of list) {
      const R = o.r + COLLIDE.player;
      let dx = pos.x - o.x, dz = pos.z - o.z, d = Math.hypot(dx, dz);
      if (d >= R) continue;
      if (d < 1e-4) { dx = pos.x || 0.01; dz = pos.z || 1; d = Math.hypot(dx, dz); }   // dead centre: out, away from the fire
      pos.x = o.x + dx / d * R; pos.z = o.z + dz / d * R;
      if (step > 1e-5 && Math.hypot(pos.x - fromX, pos.z - fromZ) < step * 0.35) {
        const side = move.x * dz - move.z * dx >= 0 ? 1 : -1;
        const a = Math.atan2(pos.x - o.x, pos.z - o.z) + side * step / R;
        pos.x = o.x + Math.sin(a) * R; pos.z = o.z + Math.cos(a) * R;
      }
    }
  }
  const r = Math.hypot(pos.x, pos.z);
  if (r < PLAYER.minRadius && r > 1e-4) { pos.x *= PLAYER.minRadius / r; pos.z *= PLAYER.minRadius / r; }
  if (r > PLAYER.maxRadius) { pos.x *= PLAYER.maxRadius / r; pos.z *= PLAYER.maxRadius / r; }
  // Those two limits can push him back into something at the edge (the wood pile
  // sits right at the clearing's rim). Slide along the limit, away from it, instead.
  for (let i = 0; i < 4; i++) {
    for (const o of list) {
      const R = o.r + COLLIDE.player, d = Math.hypot(pos.x - o.x, pos.z - o.z);
      if (d >= R - 1e-3) continue;
      const pr = Math.hypot(pos.x, pos.z) || 1;
      const turn = (pos.x * o.z - pos.z * o.x >= 0 ? 1 : -1) * (R - d + 0.01) / pr;
      const ang = Math.atan2(pos.x, pos.z) + turn;
      pos.x = Math.sin(ang) * pr; pos.z = Math.cos(ang) * pr;
    }
  }
  pos.y = 0;
}

function updatePlayer(dt) {
  const v = new THREE.Vector3();
  // Tap-to-go (touch only, see attemptTapToGo): a stick drag always wins, so the
  // very act of touching the stick zone cancels any pending auto-walk.
  if (touchStick.id !== null) player.autoWalkTarget = null;
  const autoWalking = isTouch && !!player.autoWalkTarget;
  if (!autoWalking) {
    if (keys.has("arrowup") || keys.has("w")) v.z -= 1;
    if (keys.has("arrowdown") || keys.has("s")) v.z += 1;
    if (keys.has("arrowleft") || keys.has("a")) v.x -= 1;
    if (keys.has("arrowright") || keys.has("d")) v.x += 1;
    // Floating stick (touch): direction only, same top speed either way since v is
    // normalized then scaled below, exactly like the keyboard's -1/0/1 components.
    if (touchStick.id !== null) { v.x += touchStick.x; v.z += touchStick.y; }
  }
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
  if (autoWalking) {
    // Same pit-routing as the campers (walkToward/FIRE_KEEPOUT), so an auto-walk
    // never cuts through the fire the way a straight manual line could.
    const spd = (player.carrying ? PLAYER.carrySpeed : PLAYER.speed) * (inSmoke ? SMOKE.slow : 1);
    state.stepClock += dt;
    if (state.stepClock >= (player.carrying ? 0.42 : 0.32)) { state.stepClock = 0; footstep(); }
    const arrived = walkToward(player.mesh, player.autoWalkTarget, spd * dt);
    // Same obstacles as a manual walk. A tap on (or behind) a chair or the wood pile
    // can never be reached, so give up once the walk stops making headway.
    const heading = player.mesh.position.clone().sub(player.pos).setY(0);
    resolvePlayerCollisions(player.mesh.position, heading);
    movedDist = player.pos.distanceTo(player.mesh.position);
    player.pos.copy(player.mesh.position);
    player.autoWalkStall = movedDist < spd * dt * 0.2 ? (player.autoWalkStall || 0) + dt : 0;
    if (arrived || player.autoWalkStall > 0.5) { player.autoWalkTarget = null; player.autoWalkStall = 0; }
  } else if (v.lengthSq() > 0) {
    player.autoWalkTarget = null; // any manual input also clears a pending auto-walk
    v.normalize().multiplyScalar((player.carrying ? PLAYER.carrySpeed : PLAYER.speed) * (inSmoke ? SMOKE.slow : 1) * dt);
    state.stepClock += dt;
    if (state.stepClock >= (player.carrying ? 0.42 : 0.32)) { state.stepClock = 0; footstep(); }
    const next = player.pos.clone().add(v);
    if (next.lengthSq() < 0.0001) next.set(0, 0, PLAYER.minRadius);
    const r = next.length();
    if (r < PLAYER.minRadius) next.setLength(PLAYER.minRadius);
    if (r > PLAYER.maxRadius) next.setLength(PLAYER.maxRadius);
    resolvePlayerCollisions(next, v);
    movedDist = player.pos.distanceTo(next);
    player.pos.copy(next);
    player.mesh.rotation.y = Math.atan2(v.x, v.z);
  }
  player.mesh.position.copy(player.pos);
  // Legs swing (and arms too, unless the poker is in hand or something's being
  // carried) purely from how far the player actually moved this frame.
  stepWalkCycle(player.mesh, movedDist, dt, !!player.carrying || state.stick.held);

  // Slightly larger interaction radius on touch only (docs/PHONE.md), with a
  // few per-item overrides (Bryan's phone play, 09/26: "the poker was tough to
  // get" — it is a thin cylinder and needs the most generous radius of all of
  // them). On a keyboard device isTouch is always false, so every reach below
  // falls back to PLAYER.reach, unchanged.
  const reach = isTouch ? PLAYER.reachTouch : PLAYER.reach;
  const reachStick = isTouch ? PLAYER.reachTouchStick : PLAYER.reach;
  const distStick = dist2(player.pos, LAYOUT.stick);
  const distWood = dist2(player.pos, LAYOUT.woodPile);
  const nearFire = player.pos.length() < PLAYER.minRadius + reach;
  const nearWood = distWood < reach;
  // Bryan 09/26: the can disappears once the gas is gone, so there is nothing to walk to.
  const nearGas = state.gas > 0 && dist2(player.pos, LAYOUT.gasCan) < reach;
  // The poker's generous radius reaches all the way to the wood pile it leans
  // against, so it only wins there when it is genuinely the nearer of the two —
  // otherwise standing at the pile would show GRAB GANDALF instead of GRAB WOOD.
  const nearStick = !state.stick.held && distStick < reachStick && distStick <= distWood;
  const nearCooler = dist2(player.pos, LAYOUT.cooler) < reach + 0.2;
  const nearDon = donMesh.visible && !player.carrying && dist2(player.pos, donMesh.position) < reach + 0.6;
  // Pallet: available once Johnny D remembers it (state.powerups.palletRemembered)
  // and not yet resolved for the night (broken up at the pile, or burned per Tom S).
  const palletAvailable = state.powerups.palletRemembered && !state.powerups.palletBroken && !state.powerups.palletBurned;
  const nearPallet = palletAvailable && !player.carrying && dist2(player.pos, LAYOUT.pallet) < reach;
  const kegTarget = player.carrying === "keg" ? findKegTarget(reach) : null;
  const heatBlocked = state.heat.forced;
  ui.bottle.hidden = !(state.bottle.given && !state.bottle.used);

  // Contextual hint, and the action button's label (docs/PHONE.md): built from
  // the exact same branches so the two can never say different things. targetPos
  // (touch only) is whatever the button is about to act on, ringed on the
  // ground below so the player can see it before pressing (Bryan: "show what
  // you'll act on"); it is only set when the button would actually do something.
  // targetHeight and targetFollowRadius are only used for the touch follow's
  // extent tracking below (how big a box to keep clear) — they don't affect the
  // ring, which stays a generous, easy-to-see hit-affordance sized by
  // targetRadius as before. targetFollowRadius instead approximates each prop's
  // actual footprint (the fire ring's stones, the log stack, the can, the
  // cooler, ...), since using the ring's own inflated radius for the follow
  // made the camera work to clear far more width than the real object needs.
  let hint = "", label = "", targetPos = null, targetRadius = 0.8, targetFollowRadius = 0.5, targetHeight = 0.9;
  if (player.carrying === "log") {
    hint = nearFire ? "Space: drop the log on the fire" : "Carry the log to the fire"; label = nearFire ? "ADD WOOD" : "WOOD";
    if (nearFire) { targetPos = ORIGIN_XZ; targetRadius = 2.5; targetFollowRadius = 1.3; targetHeight = 1.6; }
  } else if (player.carrying === "gas") {
    hint = nearFire ? "Space: pour the gas (careful)" : nearGas ? "Space: put the gas back" : "Carry the gas to the fire"; label = nearFire ? "GAS" : nearGas ? "PUT BACK" : "GAS";
    if (nearFire) { targetPos = ORIGIN_XZ; targetRadius = 2.5; targetFollowRadius = 1.3; targetHeight = 1.6; } else if (nearGas) { targetPos = LAYOUT.gasCan; targetFollowRadius = 0.35; targetHeight = 0.8; }
  } else if (player.carrying === "beer") {
    hint = nearFire ? (state.fire.level > FIRE.hot ? "Space: toss the full beer in. It's hot enough." : "Space: toss it in (it needs Hell's Anus to go off)") : "Carry the full beer to the fire. Don't drink it."; label = nearFire ? "TOSS BEER" : "BEER";
    if (nearFire) { targetPos = ORIGIN_XZ; targetRadius = 2.5; targetFollowRadius = 1.3; targetHeight = 1.6; }
  } else if (player.carrying === "keg") {
    if (kegTarget) { hint = `Space: top off ${kegTarget.data.name}`; label = "POUR"; targetPos = kegTarget.mesh.position; targetRadius = 0.9; targetFollowRadius = 0.5; targetHeight = 1.7; }
    else if (nearFire) { hint = "Space: pour it on the fire (bad idea)"; label = "POUR"; targetPos = ORIGIN_XZ; targetRadius = 2.5; targetFollowRadius = 1.3; targetHeight = 1.6; }
    else { hint = "Carry the keg to a camper and pour"; label = "BEER"; }
  } else if (player.carrying === "pallet") {
    // Same "bad idea, Space to trigger the trap anyway" shape as the keg-on-the-fire
    // branch above: an explicit press rather than firing the moment the player walks
    // into fire reach, so every wrong-disposal action in the game works the same way.
    hint = nearWood ? "Space: break the pallet up for wood" : nearFire ? "Space: try to burn it (bad idea)" : "Carry the pallet to the wood pile";
    label = nearWood ? "BREAK IT UP" : nearFire ? "INTO FIRE?" : "PALLET";
    if (nearWood) { targetPos = LAYOUT.woodPile; targetFollowRadius = 0.75; targetHeight = 0.75; }
    else if (nearFire) { targetPos = ORIGIN_XZ; targetRadius = 2.5; targetFollowRadius = 1.3; targetHeight = 1.6; }
  } else if (nearCooler && state.beer.available && !(nearWood && state.wood > 0)) {
    hint = "Space: grab a full, unopened beer"; label = "BEER"; targetPos = LAYOUT.cooler; targetFollowRadius = 0.5; targetHeight = 0.6;
  } else if (nearStick) {
    hint = "Space: grab the poker stick"; label = "GRAB GANDALF"; targetPos = LAYOUT.stick; targetRadius = 0.65; targetFollowRadius = 0.25; targetHeight = 1.3;
  } else if (nearWood) {
    hint = state.wood > 0 ? "Space: grab a log" : "The wood pile is empty"; label = state.wood > 0 ? "GRAB WOOD" : "EMPTY";
    if (state.wood > 0) { targetPos = LAYOUT.woodPile; targetFollowRadius = 0.75; targetHeight = 0.75; }
  } else if (nearGas) {
    hint = state.gas > 0 ? "Space: grab the gas can" : "The gas can is empty"; label = state.gas > 0 ? "GRAB GAS" : "EMPTY";
    if (state.gas > 0) { targetPos = LAYOUT.gasCan; targetFollowRadius = 0.35; targetHeight = 0.8; }
  } else if (nearPallet) {
    hint = "Space: grab the pallet"; label = "GRAB PALLET"; targetPos = LAYOUT.pallet; targetRadius = 0.75; targetFollowRadius = 0.55; targetHeight = 0.9;
  } else if (nearDon) {
    hint = state.don.gaveKeg ? "Don M has nothing else for you." : "Space: see what Don M wants"; label = "TALK";
    if (!state.don.gaveKeg) { targetPos = donMesh.position; targetRadius = 0.9; targetFollowRadius = 0.5; targetHeight = 1.85; }
  } else if (nearFire && state.bottle.given && !state.bottle.used) {
    hint = "Space: take a swig and blow it into the fire"; label = "BREATHE FIRE"; targetPos = ORIGIN_XZ; targetRadius = 2.5; targetFollowRadius = 1.3; targetHeight = 1.6;
  } else if (nearFire && !state.stick.held) {
    hint = "You need the poker stick. It's leaning by the wood pile."; label = "GET POKER";
  } else if (nearFire) {
    hint = state.fire.pokeCd > 0 ? "Poker is hot, wait a second" : "Space: poke the fire"; label = state.fire.pokeCd > 0 ? "WAIT" : "POKE";
    if (state.fire.pokeCd <= 0) { targetPos = ORIGIN_XZ; targetRadius = 2.5; targetFollowRadius = 1.3; targetHeight = 1.6; }
  }
  if (nearFire && heatBlocked) { hint = "Too hot. Back off and cool down."; label = "TOO HOT"; targetPos = null; }
  if (inSmoke) { hint = "*cough* You can't do anything in the smoke."; label = "COUGH"; targetPos = null; }
  setHint(hint);
  setActionLabel(label);
  if (isTouch) {
    actionRing.visible = !!targetPos;
    if (targetPos) {
      actionRing.position.set(targetPos.x, 0.05, targetPos.z);
      actionRing.scale.setScalar(targetRadius / 0.6);
      lastActionTarget = { x: targetPos.x, z: targetPos.z, radius: targetFollowRadius, height: targetHeight };
    } else {
      lastActionTarget = null;
    }
  } else {
    actionRing.visible = false;
    lastActionTarget = null;
  }

  if (!spacePressed) return;
  spacePressed = false;
  if (inSmoke) return;
  if (nearFire && heatBlocked) return;   // too hot to do anything at the fire right now

  if (nearDon) {
    if (!state.don.gaveKeg) {
      state.don.gaveKeg = true;
      state.keg.pours = KEG.pours;
      player.carrying = "keg"; showCarry("keg");
      setExpression(donMesh, "happy");
      bubble(state.don, "Gentlemen. Here you go.", 4, "");
      say("Don M hands you a mini keg and goes back to standing there.", 5);
      state.log.push("Don M gave a keg");
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
    campers.forEach((c) => { if (c.state === "seated") c.happyUntil = state.t + 3; });
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
  } else if (player.carrying === "keg" && kegTarget) {
    // Checked before the fire-trap branch below: a chair sits close enough to the
    // pit that "near a camper" and "near the fire" often overlap (chair radius 3.3
    // vs. nearFire's ~2.9), so whoever is actually in reach wins. Only an empty
    // fire pit with nobody in range falls through to the trap.
    const c = kegTarget;
    c.kegged = true;
    c.chill *= KEG.chillMultiplier;
    c.comfort = Math.min(100, c.comfort + KEG.comfortBoost);
    if (c.state === "leaving") { c.state = "seated"; c.bubble.until = 0; }
    c.saidCold = false;
    bubble(c, pick(kegCheers), KEG.cheerSeconds, "");
    c.happyUntil = state.t + KEG.cheerSeconds + 2;
    state.keg.pours -= 1;
    state.log.push(`Topped off ${c.data.name}`);
    if (state.keg.pours <= 0) { player.carrying = null; dropCarry(); say("That's the keg. Empty.", 4); }
  } else if (player.carrying === "keg" && nearFire) {
    // The trap (Bryan, 09/26): dumping the keg on the fire hisses, steams, knocks
    // the flames down hard, and somebody yells at you. Empties the whole keg.
    player.carrying = null; dropCarry();
    state.fire.level = Math.max(0, state.fire.level - KEG.fireDip);
    state.keg.pours = 0;
    state.keg.steamUntil = state.t + KEG.steamSeconds;
    const yeller = pick(campers.filter((c) => c.state === "seated" || c.state === "leaving"));
    if (yeller) bubble(yeller, kegFireYell, 4, "leaving");
    say("The keg hits the coals. Hiss, and a wall of steam. That's the whole keg gone.", 5);
    state.log.push("Poured the keg on the fire");
    hissSteam();
  } else if (player.carrying === "pallet" && nearWood) {
    player.carrying = null; dropCarry();
    state.wood += POWERUPS.palletBreakWood;
    state.powerups.palletBroken = true;
    say(`You break up the pallet. +${POWERUPS.palletBreakWood} wood.`, 4);
    state.log.push(`Broke up the pallet for wood at ${clockText()}`);
    logLand();
  } else if (player.carrying === "pallet" && nearFire) {
    // Tom S's line, verbatim (Bryan). Same player-is-Tom-S / Tom-S-seated /
    // Tom-S-in-the-cabin shape as the can-beer and no-glass events above (search
    // "from the cabin" in this file). No wood either way; the pallet is gone for
    // the night.
    player.carrying = null; dropCarry();
    state.powerups.palletBurned = true;
    const tomS = campers.find((c) => c.data.id === "tom-s");
    const tomLine = "No Pallets in the fire! Only you can prevent forest fires!!";
    if (player.data.id === "tom-s") pbubble(tomLine, 5, "");
    else if (tomS && tomS.state === "seated") bubble(tomS, tomLine, 5, "");
    else say(`Tom S (from the cabin): ${tomLine}`, 6, true);
    state.log.push("Tom S stopped the pallet going in the fire");
  } else if (!player.carrying && nearCooler && state.beer.available && !(nearWood && state.wood > 0)) {
    state.beer.available = false; player.carrying = "beer"; showCarry("beer");
    say("A full one. Unopened. You know what to do.", 4);
  } else if (player.carrying === "gas" && nearGas) {
    player.carrying = null; dropCarry();
  } else if (!player.carrying && nearWood && state.wood > 0) {
    state.wood -= 1; player.carrying = "log"; showCarry("log"); state.hints.woodEver = true;
  } else if (!player.carrying && nearGas && state.gas > 0) {
    player.carrying = "gas"; showCarry("gas"); state.hints.gasEver = true;
  } else if (!player.carrying && nearPallet) {
    player.carrying = "pallet"; showCarry("pallet"); state.hints.palletShown = true;
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
    setTimeout(() => { if (state.phase === "playing") bubble(player, fireBreathYell, 4, ""); }, 1300);
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
    : kind === "keg" ? buildMiniKeg()
    : kind === "pallet" ? makePalletMesh()
    : new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.45, 0.28), new THREE.MeshLambertMaterial({ color: "#d62828" }));
  m.position.set(0.45, 0.95, 0.1);
  if (kind === "keg") m.rotation.z = Math.PI / 2.4;   // tipped in the arm, like the log
  if (kind === "pallet") { m.scale.setScalar(0.55); m.rotation.x = Math.PI / 2.5; m.rotation.z = Math.PI / 9; }
  player.mesh.add(m);
  player.carryMesh = m;
}
// Nearest not-yet-kegged seated (or leaving — a pour saves him too) camper in reach,
// for the keg's hint/label and its pour action to agree on the same target.
function findKegTarget(reach) {
  let best = null, bestD = Infinity;
  campers.forEach((c) => {
    if (c.kegged || (c.state !== "seated" && c.state !== "leaving")) return;
    const d = dist2(player.pos, c.mesh.position);
    if (d < reach + 0.3 && d < bestD) { best = c; bestD = d; }
  });
  return best;
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
  if (hotNow) f.hotSeconds += dt;

  // Pallet trigger (09/27/2026 redesign): both conditions have to be true, but
  // they don't have to become true at the same moment. (a) is "ever, this night"
  // (f.hotSeconds only climbs, never resets, so once it crosses the line it stays
  // crossed) — checked every frame, independent of hotNow, so a wood count that
  // drops to the line later — long after the fire cooled back down — still fires
  // it. (b) is real-time: wood at or below palletWoodAtOrBelow right now. No wood
  // changes hands here; it just unlocks the prop leaning against the cabin.
  if (!state.powerups.palletRemembered && f.hotSeconds >= POWERUPS.woodHotSeconds && state.wood <= POWERUPS.palletWoodAtOrBelow) {
    state.powerups.palletRemembered = true;
    say("Johnny D remembered the pallet behind the shed.", 6);
    const jd = campers.find((c) => c.data.id === "johnny-d");
    if (jd && jd.mesh.visible) bubble(jd, "There's a whole pallet behind the shed!", 5, "");
    state.log.push("Johnny D remembered the pallet");
  }
}

// ---------- Overheat (Bryan, 09/26) ----------
// Builds only while the player is parked at the fire AND it is actually hot
// (state.fire.hot, strictly above FIRE.hot / the Hell's Anus line) — never at
// normal fire levels. Cools fast (HEAT.coolPerSec) the instant either condition
// drops. At HEAT.forceBackAt the game nudges the player back out and blocks fire
// actions (see updatePlayer) until it cools to HEAT.recoverAt.
function updateHeat(dt) {
  const h = state.heat;
  const reach = isTouch ? PLAYER.reachTouch : PLAYER.reach;
  const atFire = player.pos.length() < PLAYER.minRadius + reach;
  if (atFire && state.fire.hot) {
    h.level = Math.min(HEAT.max, h.level + HEAT.buildPerSec * (1 + HEAT.tierBoost * state.fire.hotTier) * dt);
  } else {
    h.level = Math.max(0, h.level - HEAT.coolPerSec * dt);
  }
  if (!h.forced && h.level >= HEAT.forceBackAt) {
    h.forced = true;
    pbubble(pick(["Whew, I'm cooking.", "Too hot, gotta back off.", "I need some air."]), 2.6, "hot");
    say(`${player.data.name} backs off from the heat.`, 3);
  } else if (h.forced && h.level <= HEAT.recoverAt) {
    h.forced = false;
  }
  if (h.forced) {
    const clear = PLAYER.minRadius + reach + HEAT.pushClear;
    const r = player.pos.length();
    if (r < clear) {
      const dir = r > 0.01 ? player.pos.clone().setY(0).setLength(clear) : new THREE.Vector3(0, 0, clear);
      const before = player.pos.clone();
      player.pos.lerp(dir, Math.min(1, dt * HEAT.pushSpeed));
      resolvePlayerCollisions(player.pos, player.pos.clone().sub(before));
      player.mesh.position.copy(player.pos);
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
    // Phones: don't start a fresh ambient comment while the last one is still
    // occupying the speech strip -- check back shortly instead of firing anyway
    // (which is what was piling lines up). Desktop bubbles have room for more
    // than one at a time, so they're untouched.
    if (isTouch && state.t < chatterBubbleUntil) {
      state.chatterIn = 1.5;
    } else {
      state.chatterIn = rand(CAMPER.chatterMin, CAMPER.chatterMax);
      const warm = campers.filter((c) => c.state === "seated" && c.comfort >= CAMPER.coolBelow);
      if (Math.random() < EVENTS.chatterRandomChance) {
        const pool = comments.filter((k) => !k.who || warm.some((c) => c.data.id === k.who));
        const k = pick(pool);
        const c = k && (k.who ? warm.find((c) => c.data.id === k.who) : pick(warm));
        if (c) { bubble(c, k.sing ? sung(k.text) : k.text, 4, ""); chatterBubbleUntil = c.bubble.until; if (k.sky) startSky(k.sky); if (k.act === "cigar") lightCigar(c); }
      } else {
        const c = pick(warm);
        if (c) { bubble(c, c.data.warm, 4, ""); chatterBubbleUntil = c.bubble.until; }
      }
    }
  }
}

// Signature-prop rigs (see PROP_BUILDERS/placePropAtChair above): re-derives
// each prop's position every frame from its OWN captured base chair vector
// and offset -- never from the owning camper's (mutable) c.chair/c.chairMesh
// -- so a bear-ride-back reassignment elsewhere can never move or orphan one.
// `propsScoot` mirrors the exact scoot formula updateCampers applies to every
// chair (same wantScoot, same rate, same starting value), so props back away
// from Hell's Anus in lockstep with the chairs beside them, without reading
// any individual camper's `.scoot`.
let propsScoot = 0;
function updateProps(dt) {
  const wantScoot = state.fire.hot ? 1 : 0;
  propsScoot += (wantScoot - propsScoot) * Math.min(1, dt * 0.9);
  Object.values(propRigs).forEach((rig) => {
    const out = rig.base.clone().setLength(rig.base.length() + propsScoot * CAMPER.scootDistance);
    rig.group.position.copy(out).add(rig.offset);
  });
  // Chris's guitar / Spitty's yogurt: gone the moment they actually walk off
  // to bed, back the instant their state is anything else (seated again after
  // a bear ride-back included) -- see docs/CAMPERS.md.
  campers.forEach((c) => {
    const rig = propRigs[c.data.id];
    if (rig && rig.hideWhenGone) rig.group.visible = !(c.state === "walking" || c.state === "gone");
  });
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

// ---------- Tap-to-go (touch only) ----------
// A quick tap (short, little finger movement — see the callers in the stick-zone
// and canvas listeners below) on an interactable walks the player straight to it,
// routing around the fire pit the same way walkToward/FIRE_KEEPOUT do for the
// campers above (docs/PHONE.md follow-up, Bryan: "the poker was tough to get").
// A generous, per-item hit radius against the ground-plane tap point, not a
// precise mesh raycast, so the thin poker stick is easy to hit.
const tapRaycaster = new THREE.Raycaster();
const tapGroundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const TAP_HIT_RADIUS = { woodPile: 1.1, gasCan: 1.1, cooler: 1.1, stick: 1.7, don: 1.3, pallet: 1.1 };
function attemptTapToGo(clientX, clientY) {
  if (!isTouch || state.phase !== "playing" || state.paused) return;
  const ndc = new THREE.Vector2((clientX / window.innerWidth) * 2 - 1, -(clientY / window.innerHeight) * 2 + 1);
  tapRaycaster.setFromCamera(ndc, camera);
  const hit = new THREE.Vector3();
  if (!tapRaycaster.ray.intersectPlane(tapGroundPlane, hit)) return;

  // Tapping at or inside the fire ring: walk to the nearest spot at the ring
  // edge, at the tapped angle, rather than at the (unreachable) center.
  if (Math.hypot(hit.x, hit.z) < FIRE_KEEPOUT + 0.4) {
    const ang = Math.atan2(hit.x, hit.z);
    const r = PLAYER.minRadius + 1.0; // just inside the nearFire reach, well clear of FIRE_KEEPOUT
    player.autoWalkTarget = new THREE.Vector3(Math.sin(ang) * r, 0, Math.cos(ang) * r);
    return;
  }

  const candidates = [
    { pos: LAYOUT.woodPile, r: TAP_HIT_RADIUS.woodPile },
    { pos: LAYOUT.gasCan, r: TAP_HIT_RADIUS.gasCan, active: state.gas > 0 },
    { pos: LAYOUT.cooler, r: TAP_HIT_RADIUS.cooler },
    { pos: LAYOUT.stick, r: TAP_HIT_RADIUS.stick, active: !state.stick.held },
    { pos: donMesh.position, r: TAP_HIT_RADIUS.don, active: donMesh.visible && !player.carrying },
    {
      pos: LAYOUT.pallet, r: TAP_HIT_RADIUS.pallet,
      active: state.powerups.palletRemembered && !state.powerups.palletBroken && !state.powerups.palletBurned && !player.carrying,
    },
  ];
  let best = null, bestDist = Infinity;
  candidates.forEach((c) => {
    if (c.active === false) return;
    const d = Math.hypot(hit.x - c.pos.x, hit.z - c.pos.z);
    if (d < c.r && d < bestDist) { bestDist = d; best = c.pos; }
  });
  if (best) player.autoWalkTarget = new THREE.Vector3(best.x, 0, best.z);
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

  // Don M: appears between two trees, stands there, leaves. He hands over the
  // mini keg on the first sighting he's reached; every sighting after that is
  // just "Gentlemen." (gaveKeg does not reset here — unlike the old log gift, the
  // keg is a one-time thing for the whole night, see KEG in config.js).
  ev.donIn -= dt;
  if (ev.donIn <= 0 && ev.don <= 0) {
    ev.donIn = rand(EVENTS.donMinGap, EVENTS.donMaxGap);
    ev.don = EVENTS.donSeconds;
    const a = rand(0.6, 5.6);
    donMesh.position.set(Math.sin(a) * EVENTS.donRadius, 0, Math.cos(a) * EVENTS.donRadius);
    donMesh.lookAt(0, 0, 0);
    donMesh.visible = true;
    setExpression(donMesh, "neutral");
    state.don.mesh = donMesh;
    bubble(state.don, "Gentlemen!", 4, "");
    const spotter = pick(campers.filter((c) => c.state === "seated"));
    if (spotter) setTimeout(() => bubble(spotter, "Is that Don M?", 4, ""), 1500);
    // Spitty sings him in, then Don gets his second line off (both Bryan, 10/07/2026).
    // Don's waits on the game clock for his own bubble to clear (updated just below).
    const donSong = comments.find((k) => k.who === "spitty" && k.sing);
    const spitty = campers.find((c) => c.data.id === "spitty" && c.state === "seated");
    if (spitty && donSong) setTimeout(() => { if (donMesh.visible && state.phase === "playing") bubble(spitty, sung(donSong.text), 4, ""); }, 3600);
    state.don.secondAt = state.t + 6.5;
    say("Don M is standing at the tree line. He's not coming over. You could go over.", 5);
    state.log.push("Don M sighting");
  }
  if (ev.don > 0 && state.don.secondAt && state.t >= state.don.secondAt && state.t >= state.don.bubble.until) { state.don.secondAt = 0; bubble(state.don, donSecondLine, 4, ""); }
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
    setExpression(alanMesh, "scared");
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

  updateCanBomb(dt);
  updateGlassBottle(dt);

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

// Nudges a couple of the shared smoke puffs (world.js/fire.js's own pool, already
// driven every frame by updateSmoke below) to spawn early at the pit, for the can's
// heating hiss. Only touches currently-idle members, so it never fights the pool's
// own fire-level-driven spawns.
function forceSmokePuff(n) {
  let made = 0;
  for (const sp of smoke) {
    if (made >= n) break;
    const u = sp.userData;
    if (u.age < u.life) continue;
    u.age = 0; u.life = 1.6 + Math.random() * 1.0;
    sp.position.set((Math.random() - 0.5) * 0.4, 0.55 + Math.random() * 0.2, (Math.random() - 0.5) * 0.4);
    u.vel.set((Math.random() - 0.5) * 0.2, 0.9 + Math.random() * 0.4, (Math.random() - 0.5) * 0.2);
    u.size = 0.35 + Math.random() * 0.2;
    made += 1;
  }
}
// Same idea for the shared spark pool (fire.js), for the can's bang: forces a burst
// of currently-idle sparks at the pit on top of whatever the fire level is already
// spawning.
function forceSparkBurst(n) {
  let made = 0;
  for (const spr of sparks.children) {
    if (made >= n) break;
    const u = spr.userData;
    if (u.age < u.life) continue;
    u.age = 0; u.life = 0.5 + Math.random() * 0.7;
    const a = Math.random() * Math.PI * 2, r = Math.random() * 0.4;
    spr.position.set(Math.sin(a) * r, 0.2 + Math.random() * 0.2, Math.cos(a) * r);
    u.vx = (Math.random() - 0.5) * 1.2; u.vy = 1.8 + Math.random() * 1.6; u.vz = (Math.random() - 0.5) * 1.2;
    u.size = 0.06 + Math.random() * 0.07;
    spr.material.color.set(Math.random() > 0.5 ? "#ffb347" : "#ff8a2e");
    spr.visible = true;
    made += 1;
  }
}

// ---------- Event: camper puts a full beer can in the fire (Bryan: "Once during the
// night, have someone put a full beer can in the fire. It gets hot, explodes and
// makes a big bang. Everything shakes. Tom S says 'What the hell was that??'"). Once
// a night, separate from the player's own beer bomb (state.beer / EVENTS.beerFuse
// above), which stays exactly as it is.
function updateCanBomb(dt) {
  const cb = state.canBomb;
  if (cb.phase === "pending" && state.t >= cb.at) {
    const pool = campers.filter((c) => c.state === "seated" && c.data.id !== "tom-s");
    const c = pick(pool);
    if (!c) { cb.at = state.t + 10; return; } // nobody free to toss it right now, try again shortly
    cb.tosser = c; cb.phase = "toss"; cb.t = 0;
    cb.from.copy(c.mesh.position).add(new THREE.Vector3(0, 1.0, 0));
    cb.to.set(0, 0.15, 0);
    canBombMesh.visible = true;
    canBombMesh.scale.set(1, 1, 1);
    canBombMesh.position.copy(cb.from);
  } else if (cb.phase === "toss") {
    cb.t += dt;
    const k = Math.min(1, cb.t / EVENTS.canBeerTossSeconds);
    canBombMesh.position.lerpVectors(cb.from, cb.to, k).add(new THREE.Vector3(0, Math.sin(k * Math.PI) * 0.9, 0));
    cb.tosser.mesh.userData.parts.armR.rotation.x = -1.6 + k * 2.0; // same wind-up-and-lob shape as the wrapper toss
    if (k >= 1) {
      cb.tosser.mesh.userData.parts.armR.rotation.x = 0;
      canBombMesh.position.copy(cb.to);
      cb.phase = "heat"; cb.t = 0;
      campers.forEach((c) => { if (c !== cb.tosser) c.scaredUntil = state.t + 2.5; });
      // DRAFT (Bryan to review): a plain ticker line naming who threw it.
      say(`${cb.tosser.data.name} just put a full beer in the fire.`, 4);
      state.log.push(`${cb.tosser.data.name} put a beer can in the fire at ${clockText()}`);
      forceSmokePuff(2);
    }
  } else if (cb.phase === "heat") {
    cb.t += dt;
    const pulse = 1 + Math.sin(cb.t * 10) * 0.05; // a little shiver so it visibly reads as heating
    canBombMesh.scale.set(pulse, pulse, pulse);
    if (Math.random() < dt * 1.4) forceSmokePuff(1); // small hiss/steam puff while it cooks
    if (cb.t >= EVENTS.canBeerHeatSeconds) {
      cb.phase = "done";
      canBombMesh.visible = false;
      bang();
      state.shake = Math.max(state.shake, EVENTS.canBeerShake);
      forceSparkBurst(14);
      state.fire.level = Math.min(FIRE.max, state.fire.level + EVENTS.canBeerFlare);
      const tomS = campers.find((c) => c.data.id === "tom-s");
      const tomLine = "What the hell was that??";
      if (player.data.id === "tom-s") pbubble(tomLine, 4, "");
      else if (tomS && tomS.state === "seated") bubble(tomS, tomLine, 4, "");
      else say(`Tom S (from the cabin): ${tomLine}`, 5, true);
      state.log.push(`Beer can exploded in the fire at ${clockText()}`);
    }
  }
}

// ---------- Event: "No Glass in the fire!" (Bryan: "Add Tom S saying: 'No Glass in
// the fire!'"). Once a night, no overlap with the can-bomb event above, no gameplay
// effect. Skipped entirely for the night if Tom S is not there to say it.
function updateGlassBottle(dt) {
  const gl = state.glass;
  if (gl.phase === "pending" && state.t >= gl.at) {
    const tomS = campers.find((c) => c.data.id === "tom-s");
    const tomHere = player.data.id === "tom-s" || (tomS && tomS.state === "seated");
    if (!tomHere) { gl.phase = "done"; return; } // Tom S isn't around to yell about it; skip for the night
    const pool = campers.filter((c) => c.state === "seated" && c.data.id !== "tom-s");
    const c = pick(pool);
    if (!c) { gl.at = state.t + 10; return; } // nobody free to wind up right now, try again shortly
    gl.tosser = c; gl.phase = "wind"; gl.t = 0;
    glassBottleMesh.visible = true;
  } else if (gl.phase === "wind") {
    gl.t += dt;
    const k = Math.min(1, gl.t / EVENTS.glassWindSeconds);
    gl.tosser.mesh.userData.parts.armR.rotation.x = -0.3 - k * 1.3;
    glassBottleMesh.position.copy(gl.tosser.mesh.position).add(new THREE.Vector3(0, 0.9 + k * 0.15, 0.25));
    if (k >= 1) {
      gl.phase = "hold"; gl.t = 0;
      const line = "No Glass in the fire!";
      const tomS = campers.find((c) => c.data.id === "tom-s");
      if (player.data.id === "tom-s") pbubble(line, 3.2, "");
      else if (tomS) bubble(tomS, line, 3.2, "");
      state.log.push(`Tom S: No Glass in the fire! at ${clockText()}`);
    }
  } else if (gl.phase === "hold") {
    gl.t += dt;
    glassBottleMesh.position.copy(gl.tosser.mesh.position).add(new THREE.Vector3(0, 1.05, 0.25));
    if (gl.t >= EVENTS.glassHoldSeconds) { gl.phase = "lower"; gl.t = 0; }
  } else if (gl.phase === "lower") {
    gl.t += dt;
    const k = Math.min(1, gl.t / EVENTS.glassLowerSeconds);
    gl.tosser.mesh.userData.parts.armR.rotation.x = -0.3 - (1 - k) * 1.3; // arm comes back down
    const chairPos = gl.tosser.mesh.position;
    glassBottleMesh.position.lerpVectors(new THREE.Vector3(chairPos.x, 1.05, chairPos.z + 0.25), new THREE.Vector3(chairPos.x + 0.35, 0.15, chairPos.z + 0.2), k);
    if (k >= 1) {
      gl.tosser.mesh.userData.parts.armR.rotation.x = 0;
      gl.phase = "sit"; gl.t = 0;
    }
  } else if (gl.phase === "sit") {
    gl.t += dt;
    if (gl.t >= EVENTS.glassSitSeconds) { glassBottleMesh.visible = false; gl.phase = "done"; }
  }
}

// ---------- Hints: point at what the player has not found ----------
function showHint(target, text) {
  state.hints.target = target.clone(); state.hints.until = state.t + HINTS.showSeconds;
  say(text, HINTS.showSeconds);
}
// ---------- Coach: say what to do next when the player seems lost ----------
// Bryan 10/08/2026: Tom S couldn't work out the game. Until the first log lands
// it walks the player through grab-then-carry-then-drop. After that it only
// speaks when the fire is sinking and nothing useful (grab, drop, pour, poke)
// has happened for COACH.idleSeconds, and it says the next step for what the
// player is holding right now. Returns { text, target } or null.
// The arrow floats 2.6 above its target (plus the y here); the camera looks down
// steeply, so a high arrow lands on screen over whatever stands behind the target
// (the camper beyond the fire, empty sky above the wood pile). Pulled low, and the
// fire one nearer the player, so its tip sits on the thing it points at.
const FIRE_TARGET = new THREE.Vector3(0, -1.6, 0.8);
function coachCurrent() {
  const c = state.coach, f = state.fire, t = state.t;
  const sig = `${player.carrying}|${f.drops}|${state.gasUsed}|${state.stick.held}|${state.pokeAnim > 0}`;
  if (sig !== c.sig) { c.sig = sig; c.lastAct = t; }
  const act = isTouch ? "tap the big button" : "press Space";
  const at = (v, text) => ({ text, target: v });
  const woodAt = new THREE.Vector3(LAYOUT.woodPile.x, -1.2, LAYOUT.woodPile.z);
  if (f.drops === 0) {
    if (t < COACH.introAfter) return null;
    if (player.carrying === "log") return at(FIRE_TARGET, `Carry the log to the fire, then ${act}.`);
    if (!player.carrying && state.wood > 0) return at(woodAt, `Walk to the wood pile and ${act} to grab a log.`);
    return null;
  }
  if (c.nudge) {
    if (c.lastAct > c.nudge.since || t > c.nudge.until) { c.nudge = null; c.nextNudge = t + COACH.repeatSeconds; }
    else return c.nudge;
  }
  if (t - c.lastAct < COACH.idleSeconds || f.level >= COACH.fireBelow || t < c.nextNudge) return null;
  let n = null;
  if (player.carrying === "log") n = at(FIRE_TARGET, "You're holding a log. Carry it to the fire.");
  else if (player.carrying === "gas") n = at(FIRE_TARGET, "Carry the gas to the fire for a big flare.");
  else if (!player.carrying && state.wood > 0) n = at(woodAt, "The fire is dying. Grab a log from the wood pile.");
  else if (!player.carrying && state.stick.held) n = at(FIRE_TARGET, "Out of wood. Poke the fire with the stick.");
  else if (!player.carrying) n = at(new THREE.Vector3(LAYOUT.stick.x, -1.2, LAYOUT.stick.z), "Out of wood. Grab the poker stick, then poke the fire.");
  if (!n) return null;
  c.nudge = { text: n.text, target: n.target, since: t, until: t + COACH.showSeconds };
  return c.nudge;
}
let coachShown = "";
function setCoachText(text) {
  if (text === coachShown) return;
  coachShown = text; ui.coach.textContent = text; ui.coach.hidden = !text;
}

function updateHints(dt) {
  const h = state.hints, f = state.fire.level, t = state.t;
  const co = coachCurrent();
  if (co) {
    hintArrow.visible = true;
    hintArrow.position.set(co.target.x, 2.6 + co.target.y + Math.sin(t * 4) * 0.25, co.target.z);
    hintArrow.rotation.y = t * 1.5;
    setCoachText(co.text);
    return;
  }
  setCoachText("");
  if (h.target && t < h.until) {
    hintArrow.visible = true;
    hintArrow.position.set(h.target.x, 2.6 + Math.sin(t * 4) * 0.25, h.target.z);
    hintArrow.rotation.y = t * 1.5;
    return;
  }
  hintArrow.visible = false;
  if (donMesh.visible && !h.donShown && !state.don.gaveKeg) { h.donShown = true; showHint(donMesh.position, "Don M is at the tree line. Walk over and press Space. He might have something."); return; }
  if (!donMesh.visible) h.donShown = false;
  // Pallet (09/27/2026): shown once, the first time it's available — never repeats
  // (h.palletShown also gets set the moment the player grabs it on their own, in
  // updatePlayer, so finding it before the hint fires never triggers this after).
  if (!h.palletShown && state.powerups.palletRemembered && !state.powerups.palletBroken && !state.powerups.palletBurned) {
    h.palletShown = true;
    showHint(new THREE.Vector3(LAYOUT.pallet.x, 0, LAYOUT.pallet.z), "There's a pallet leaning against the cabin. Grab it and break it up at the wood pile.");
    return;
  }
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

// ---------- Brian R's cigar ----------
// Bryan, 10/07/2026: "Brian R lights a cigar and can also say ..." The first time
// the line comes up he lights one (a lighter flare at the tip) and it stays lit in
// his mouth for the rest of the night; any later time is a fresh puff. Chunky on
// purpose, like the other props: at true scale it would be two pixels from the
// gameplay camera. Parented to the head so it follows him to bed.
const CIGAR_MOUTH = { y: 0.115, z: 0.162 };   // MOUTH_Y / MOUTH_Z in world.js
function lightCigar(c) {
  const head = c.mesh.userData.parts && c.mesh.userData.parts.head;
  if (!head) return;
  if (!c.cigar) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.026, 0.19, 8), new THREE.MeshLambertMaterial({ color: "#5a371c", flatShading: true }));
    body.rotation.x = Math.PI / 2; body.position.z = 0.095;
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.0275, 0.0275, 0.03, 8), new THREE.MeshLambertMaterial({ color: "#c9a23a", flatShading: true }));
    band.rotation.x = Math.PI / 2; band.position.z = 0.05;
    const ember = new THREE.Mesh(new THREE.CylinderGeometry(0.023, 0.023, 0.02, 8), new THREE.MeshBasicMaterial({ color: "#ff7a2a", toneMapped: false, fog: false }));
    ember.rotation.x = Math.PI / 2; ember.position.z = 0.196;
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: truckGlowTex, color: "#ff9a4a", transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, fog: false }));
    glow.position.z = 0.2;
    g.add(body, band, ember, glow);
    g.position.set(0.035, CIGAR_MOUTH.y, CIGAR_MOUTH.z - 0.01);
    g.rotation.set(0.22, 0.3, 0);   // tipped down a touch and out of the corner of his mouth
    head.add(g);
    c.cigar = { group: g, glow, flare: 0, clock: Math.random() * 10 };
  }
  c.cigar.flare = 1;
}
function updateCigars(dt) {
  campers.forEach((c) => {
    const k = c.cigar;
    if (!k) return;
    k.clock += dt;
    k.flare = Math.max(0, k.flare - dt / 1.4);
    const draw = Math.max(0, Math.sin(k.clock * 0.9)) ** 6;   // a slow pull every few seconds
    const s = 0.16 + draw * 0.1 + k.flare * 0.42;
    k.glow.scale.set(s, s, 1);
    k.glow.material.opacity = Math.min(1, 0.45 + draw * 0.3 + k.flare * 0.5);
  });
}

// ---------- Midnight: Tom W's truck ----------
// Rotates a local-space offset by the truck's current rotation.y and adds its
// position, matching the same convention walkToward/rotation.y = atan2(x, z)
// use everywhere else in this file (local +Z is forward). Kept general (any
// mesh) in case a later pass wants it for something else.
function localToWorld(mesh, lx, ly, lz) {
  const c = Math.cos(mesh.rotation.y), s = Math.sin(mesh.rotation.y);
  return new THREE.Vector3(mesh.position.x + lx * c + lz * s, mesh.position.y + ly, mesh.position.z - lx * s + lz * c);
}
// Shortest-path angle ease, so the final turn into the parking spot doesn't
// ever spin the long way around.
function easeAngle(cur, target, k) {
  let diff = target - cur;
  diff = ((diff + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
  return cur + diff * Math.min(1, k);
}
// Positions the SpotLight, the two beam cones and the two lens glow sprites off
// the truck's current transform, and sets their combined strength to k (0..1).
// Called every frame the lights are anything other than fully off.
function setTruckLights(k) {
  truckLight.intensity = k * TRUCK.lightIntensity;
  const originL = localToWorld(truckMesh, -TRUCK_GEOM.headlightX, TRUCK_GEOM.headlightY, TRUCK_GEOM.headlightZ);
  const originR = localToWorld(truckMesh, TRUCK_GEOM.headlightX, TRUCK_GEOM.headlightY, TRUCK_GEOM.headlightZ);
  const mid = originL.clone().add(originR).multiplyScalar(0.5);
  const aim = localToWorld(truckMesh, 0, TRUCK_GEOM.headlightY - 0.2, TRUCK_GEOM.headlightZ + TRUCK.beamLength);
  truckLight.position.copy(mid);
  truckLightTarget.position.copy(aim);
  const origins = [originL, originR];
  const beamCenters = [
    localToWorld(truckMesh, -TRUCK_GEOM.headlightX, TRUCK_GEOM.headlightY - 0.05, TRUCK_GEOM.headlightZ + TRUCK.beamLength * 0.5),
    localToWorld(truckMesh, TRUCK_GEOM.headlightX, TRUCK_GEOM.headlightY - 0.05, TRUCK_GEOM.headlightZ + TRUCK.beamLength * 0.5),
  ];
  truckBeams.forEach((beam, i) => {
    beam.position.copy(beamCenters[i]);
    beam.rotation.y = truckMesh.rotation.y;
    beam.material.opacity = 0.22 * k;
    beam.visible = k > 0.01;
  });
  truckLensGlows.forEach((sp, i) => {
    sp.position.copy(origins[i]);
    sp.material.opacity = k > 0 ? k : TRUCK_PARK_GLOW;
    sp.visible = true;
  });
}
// Tom gets out at the truck door (the side facing camp, whichever way the
// truck ended up parked) and walks to his chair -- the same "arriving" state
// and walkToward() path every other arrival already uses, just started from
// the truck instead of LAYOUT.roadEntry.
function exitTomFromTruck(tom) {
  const toOrigin = new THREE.Vector3(-truckMesh.position.x, 0, -truckMesh.position.z).normalize();
  const doorPos = truckMesh.position.clone().add(toOrigin.multiplyScalar(TRUCK_GEOM.halfWidth + 0.35));
  tom.mesh.visible = true;
  tom.mesh.position.copy(doorPos);
  tom.mesh.lookAt(0, 0, 0);
  tom.state = "arriving";
  bubble(tom, tom.data.warm, 6, "");
  truckDoorThunk();
}
function updateMidnight() {
  if (state.midnightDone || gameMinutes() < MIDNIGHT_MIN) return;
  state.midnightDone = true;
  const tom = campers.find((c) => c.data.arrivesAtMidnight);
  if (!tom) return;
  const t = state.truck;
  t.tom = tom;
  t.phase = "approach";
  t.timer = 0;
  // The route itself lives in config.js (TRUCK.route) and is built by
  // buildTruckPath() in truck.js, which world.js also uses to keep trees and
  // ground dressing off the lane. The final position/heading get hard-set the
  // moment the drive timer completes (below); the route's last leg already
  // points at the fire, so that set is a nudge, not a snap.
  t.path = buildTruckPath();
  // Drives up out of the ground (see truckMesh's setup above) to the spawn end
  // of the path -- it was already rendering every frame, just buried at y=-30.
  truckMesh.position.copy(t.path.getPointAt(0));
  const tan0 = t.path.getTangentAt(0.001);
  truckMesh.rotation.y = Math.atan2(tan0.x, tan0.z);
  setTruckLights(0);
  truckRumble();

  // Ticker, comfort boost and happy faces all fire now, timed to when the
  // headlights first show (Bryan's brief) rather than to when Tom actually
  // reaches his chair, which now happens well after the truck parks.
  tom.comfort = CAMPER.startComfort;
  campers.forEach((c) => { if (c.state === "seated" || c.state === "leaving") { c.comfort = Math.min(100, c.comfort + CAMPER.tomWComfortBoost); c.happyUntil = state.t + 5; } });
  say("Headlights on the road. Tom W made it.", 5);
  state.log.push("Tom W arrived at midnight");
}
// Drives the phase machine above every frame once updateMidnight() has kicked
// it off: approach (driving in, headlights fading up) -> stopped (parked,
// lights up on the campers a few seconds) -> fading (headlights down) -> done
// (Tom is out and walking; the truck sits lit only by its dim parking glow for
// the rest of the night, per Bryan's "lights off, maybe a dim parking light
// glow is fine").
function updateTruckArrival(dt) {
  const t = state.truck;
  if (t.phase === "idle" || t.phase === "done") return;
  t.timer += dt;
  if (t.phase === "approach") {
    const lightK = Math.min(1, t.timer / TRUCK.lightsFadeInSeconds);
    if (t.timer > TRUCK.lightsFadeInSeconds) {
      // Steady speed up the side of camp, easing off over the last stretch so it
      // rolls to a stop in the parking spot instead of halting dead.
      const u = Math.min(1, (t.timer - TRUCK.lightsFadeInSeconds) / (TRUCK.driveSeconds - TRUCK.lightsFadeInSeconds));
      const drive = u < 0.75 ? u * 0.84 / 0.75 : 0.84 + 0.16 * (1 - Math.pow(1 - (u - 0.75) / 0.25, 2));
      truckMesh.position.copy(t.path.getPointAt(drive));
      const tan = t.path.getTangentAt(Math.max(0.001, Math.min(0.999, drive)));
      truckMesh.rotation.y = easeAngle(truckMesh.rotation.y, Math.atan2(tan.x, tan.z), dt * 4);
    }
    setTruckLights(lightK);
    if (t.timer >= TRUCK.driveSeconds) {
      truckMesh.position.set(LAYOUT.truckPark.x, 0, LAYOUT.truckPark.z);
      truckMesh.rotation.y = Math.atan2(-LAYOUT.truckPark.x, -LAYOUT.truckPark.z);   // nose toward the fire
      setTruckLights(1);
      t.phase = "stopped"; t.timer = 0;
    }
  } else if (t.phase === "stopped") {
    setTruckLights(1);
    if (t.timer >= TRUCK.litSeconds) { t.phase = "fading"; t.timer = 0; }
  } else if (t.phase === "fading") {
    const k = Math.max(0, 1 - t.timer / TRUCK.fadeOutSeconds);
    setTruckLights(k);
    if (t.timer >= TRUCK.fadeOutSeconds) {
      setTruckLights(0);
      exitTomFromTruck(t.tom);
      t.phase = "done";
    }
  }
}

// ---------- End ----------
function checkEnd() {
  const anyoneLeft = campers.some((c) => ["seated", "leaving", "away", "arriving"].includes(c.state));
  if (state.t >= NIGHT_SECONDS) endNight(false);
  else if (!anyoneLeft) endNight(true);
}

function endNight(alone) {
  state.phase = "end";
  setCoachText("");
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
      <li>Gas used: ${state.gasUsed}. Fire-breathing: ${state.bottle.used ? "yes" : "no"}. Beer bomb: ${state.beer.exploded ? "yes" : state.beer.thrown ? "wasted" : "no"}. Beer can in the fire: ${state.canBomb.phase === "done" && state.canBomb.tosser ? `yes, ${state.canBomb.tosser.data.name}` : "no"}</li>
      <li>Time in Hell's Anus: ${hotPts}s (+${hotPts}). Peak: ${state.fire.peakTier ? HOT_LEVELS[state.fire.peakTier - 1].name : "never got there"}</li>
      <li>Earned: ${[state.powerups.palletBroken ? "the pallet" : state.powerups.palletBurned ? "the pallet (burned, Tom S said no)" : null, state.powerups.gasEarned ? "the gas can" : null, state.don.gaveKeg ? "a mini keg from Don M" : null].filter(Boolean).join(", ") || "nothing"}</li>
      <li>Wood placement: ${state.fire.spreads} good spreads, ${state.fire.smothers} smothers${state.log.some((l) => l.startsWith("Alan")) ? ". Alan came through with the bees." : ""}</li>
      <li>Keg: ${state.don.gaveKeg ? (state.log.includes("Poured the keg on the fire") ? "dumped in the fire" : `${state.log.filter((l) => l.startsWith("Topped off")).length} of ${KEG.pours} poured`) : "never got it"}</li>
    </ul>
    <p class="verdict">${verdict}</p>
    ${renderBoard(saveScore(player.data.name, score))}`;
  ui.end.hidden = false;
  // Sunday card hook: renderer.render() guarantees the drawing buffer holds this
  // frame (preserveDrawingBuffer is false), then sharecard.js grabs it right away
  // and wires the SAVE CARD / SHARE buttons in the end card. See src/sharecard.js.
  renderer.render(scene, camera);
  initShareCardButtons({
    camperName: player.data.name,
    difficulty: DIFFICULTY[state.diff].name,
    score,
    verdict,
    stillAtFire: at,
    wentToBed: bed,
    takenByBear: bearVictims,
    hellsAnusPeak: state.fire.peakTier ? HOT_LEVELS[state.fire.peakTier - 1].name : null,
    hellsAnusSeconds: hotPts,
    gasUsed: state.gasUsed,
    fireBreathing: state.bottle.used,
    beerBomb: state.beer.exploded ? "exploded" : state.beer.thrown ? "wasted" : "no",
    beerCanInFire: state.canBomb.phase === "done" && state.canBomb.tosser ? state.canBomb.tosser.data.name : null,
    alanAndBees: state.log.some((l) => l.startsWith("Alan")),
    hasGandalf: state.stick.held,
    canvas: renderer.domElement,
  });
}

// ---------- Render ----------
function render(dt) {
  if (state.phase === "start") state.t += dt * 0; // clock frozen on the title; flicker uses titleClock below
  const level = state.fire.level / FIRE.hot;           // 1.0 at the Hell's Anus line, 1.5 at max
  const hot = state.fire.level > FIRE.hot;
  // An event (plate, wrapper, beer bomb, beer can) can push the level past the hot line
  // after updateFire() ran this substep, leaving hotTier at 0 for one frame. Never read
  // HOT_LEVELS[-1]: that was the random red "hiccupped" box.
  const tier = hot ? Math.max(1, state.fire.hotTier) : 0;
  const ft = state.phase === "start" ? titleClock : state.t;
  const flicker = 0.9 + Math.sin(ft * 23) * 0.06 + Math.sin(ft * 7.3) * 0.04;
  // Single visual hook: flame sprites, sparks, coal bed and pit-log glow all driven
  // from the same authoritative level/hot/hotTier (see docs/HANDOFF.md art pass step 3).
  updateFireVisuals(fireVis, { level, hot, tier, dt, flicker, wind: state.wind });
  // 0.81 rebalances for fireLight's decay dropping from 1.4 to 1.2 in world.js
  // (09/26, "dark outside the ring" pass): same radius-1.3 cross-over method as
  // the original 0.85 (for the 2 -> 1.4 drop), so close-in brightness (inside
  // the ring) is unchanged while the lower decay reaches further outside it.
  fireLight.intensity = (6 + 120 * Math.min(level, 1) + (hot ? 160 * (level - 1) + 40 + tier * 18 : 0)) * 0.81 * flicker * (1 + (fireVis.lightNudge || 0));
  fireLight.color.setHSL(hot ? 0.1 : 0.07 - (1 - Math.min(level, 1)) * 0.04, hot ? 0.7 : 1, hot ? 0.7 : 0.55);
  world.updateAmbient(dt, { level, wind: state.wind, t: ft });
  updateSmoke(dt, level, hot);
  updateHeadlamp();
  updateHeatGauge();

  // Dawn in the last minute
  const dawn = THREE.MathUtils.clamp((state.t - (NIGHT_SECONDS - 60)) / 60, 0, 1);
  const sky = new THREE.Color("#0b1020").lerp(new THREE.Color("#e08a6a"), dawn);
  scene.background.copy(sky);
  scene.fog.color.copy(sky);
  updateSkyDome(dawn, ft);
  scene.userData.updateCampLights(dt, ft, dawn);

  // HUD
  ui.fireFill.style.width = `${(state.fire.level / FIRE.max) * 100}%`;
  ui.fireFill.classList.toggle("low", level < 0.25);
  ui.fireFill.classList.toggle("hot", hot);
  // On phones the meter label is always just "FIRE" (Bryan 09/26: the tier
  // name made the two-line "FIRE: HELL'S ANUS III: RING OF FIRE" label wider
  // than the slim rail it now sits in); the banner (showBanner above) and the
  // ticker/speech-strip line (say(), same tier-change block) still announce
  // every tier by name on every device, touch included.
  ui.fireLabel.textContent = (hot && !isTouch) ? `FIRE: ${HOT_LEVELS[tier - 1].name}` : "FIRE";
  ui.clock.textContent = clockText();
  ui.wood.textContent = state.wood;
  ui.gas.textContent = state.gas;
  gasCan.visible = state.gas > 0;
  // Pallet: visible leaning against the cabin only while it's available and not
  // currently in the player's arms (showCarry adds its own carried copy).
  palletMesh.visible = state.powerups.palletRemembered && !state.powerups.palletBroken && !state.powerups.palletBurned && player.carrying !== "pallet";
  ui.tWood.textContent = state.wood;
  ui.tGas.textContent = state.gas;
  if (state.message.until < state.t && !state.message.hint) ui.message.textContent = "";
  if (state.message.until >= state.t) ui.message.textContent = state.message.text;
  else ui.message.textContent = state.message.hint || "";

  // Fire sound follows the fire; music plays until ~20s before dawn, then fades
  // over ~18s so it lands just ahead of endNight's playDawn() sting at
  // NIGHT_SECONDS, instead of the old 50s fade starting a full minute out (Bryan
  // heard that as the music running out of song, not a deliberate outro).
  // Ducks when the fire is low. Paused: fade the crackle to silence (the pause
  // menu already ducks the music) instead of leaving it playing over a frozen scene.
  if (state.phase === "playing") {
    setCrackle(state.paused ? 0 : level, dt);
    if (!state.paused && state.t >= NIGHT_SECONDS - 20 && !state.musicFading) { state.musicFading = true; stopMusic(18); }
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

  // Bubbles (desktop) / speech strip (touch, see updateTouchSpeech below)
  const w = window.innerWidth, h = window.innerHeight;
  const bubbleActors = [...campers, player, state.don, state.alan];
  if (isTouch) {
    updatePhoneSpeechBounds();
    updateTouchSpeech(bubbleActors);
  } else {
    bubbleActors.forEach((c) => {
      if (!c.mesh) return;
      if (c.bubble.until <= state.t || !c.bubble.text || !c.mesh.visible) { if (c.bubble.el) { c.bubble.el.remove(); c.bubble.el = null; } return; }
      if (!c.bubble.el) { c.bubble.el = document.createElement("div"); ui.bubbles.appendChild(c.bubble.el); }
      c.bubble.el.className = `bubble ${c.bubble.cls}`;
      c.bubble.el.textContent = c.bubble.text;
      c.bubble.el.style.marginTop = "0px";
      const v = c.mesh.position.clone().add(new THREE.Vector3(0, 2.1, 0)).project(camera);
      c.bubble.el.style.left = `${(v.x + 1) / 2 * w}px`;
      c.bubble.el.style.top = `${(1 - v.y) / 2 * h}px`;
    });
    // Overlap nudge (Bryan: "if two bubbles overlap, nudge one vertically"; the
    // rest of desktop's bubbles are untouched). Touch never reaches this branch,
    // since the speech strip above has no overlap to nudge in the first place.
    nudgeOverlappingBubbles(bubbleActors);
  }

  renderer.render(scene, camera);
}

// ---------- Smoke ----------
let smokeSpawn = 0;
function updateSmoke(dt, level, hot) {
  const w = state.wind;
  const L = SMOKE_LOOK;
  const windPush = w.active ? 2.2 : 0.25;
  const smothering = state.fire.catching.some((c) => c.smother);
  const catching = smothering ? 3.6 : state.fire.catching.length > 0 ? 2.5 : 1;   // a fresh log smokes, a smothered one smokes more
  // The keg-on-the-fire trap always shows a steam burst, even when the dip it
  // caused leaves fire.level near 0 (which would otherwise mean no smoke at all).
  const steaming = state.t < state.keg.steamUntil;
  // Thin wisps, not a column: L.rate keeps the 60-puff pool from saturating at a calm fire.
  const rate = steaming ? 46 : level <= 0.02 ? 0 : (hot ? 6 : 10 + 14 * Math.min(level, 1)) * catching * L.rate;
  smokeSpawn += rate * dt;
  const density = steaming ? 0.55 : (hot ? L.hotOpacity : L.opacity) * (1 + L.catchBoost * (catching - 1)) * (w.active ? L.gustBoost : 1) * (0.4 + 0.6 * Math.min(level, 1));
  const swirl = L.swirl * (w.active ? 0.4 : 1);   // keep the gust stream narrow, it is a game mechanic
  for (const sp of smoke) {
    const u = sp.userData;
    if (u.seed === undefined) { u.seed = Math.random() * 6.283; u.spin = (Math.random() - 0.5) * 2 * L.spin; }
    if (u.age >= u.life) {
      if (smokeSpawn < 1) continue;
      smokeSpawn -= 1;
      u.age = 0; u.life = 3.3 + Math.random() * 1.8;
      sp.position.set((Math.random() - 0.5) * 0.5, 0.9 + Math.random() * 0.4, (Math.random() - 0.5) * 0.5);
      u.vel.set((Math.random() - 0.5) * 0.3, 1.0 + Math.random() * 0.6, (Math.random() - 0.5) * 0.3);
      u.size = L.startSize * (0.8 + Math.random() * 0.5);
      u.seed = Math.random() * 6.283; u.spin = (Math.random() - 0.5) * 2 * L.spin;
      sp.material.rotation = Math.random() * 6.283;
    }
    u.age += dt;
    const k = Math.min(1, u.age / u.life);
    sp.position.x += (u.vel.x + Math.cos(u.seed + u.age * 0.9) * swirl - w.dir.x * windPush) * dt;   // pushed away from the wind's source
    sp.position.z += (u.vel.z + Math.sin(u.seed * 1.7 + u.age * 0.7) * swirl - w.dir.y * windPush) * dt;
    sp.position.y += u.vel.y * dt * (w.active ? 0.55 : 1);
    sp.material.rotation += u.spin * dt;
    const size = u.size + L.grow * (1 - (1 - k) * (1 - k));   // spreads fastest early
    sp.scale.set(size, size, 1);
    const fin = Math.min(1, k / L.fadeIn);
    sp.material.opacity = density * fin * fin * (3 - 2 * fin) * Math.pow(1 - k, 1.4);   // thins as it rises and spreads
    const g = steaming ? 0.95 : (hot ? L.tint * 1.5 : L.tint);
    sp.material.color.setRGB(g + 0.1 * (1 - k), g + 0.04 * (1 - k), g + 0.04 * k);      // warm near the coals, cooler up high
  }
}

// ---------- Headlamp (Bryan, 09/26) ----------
// Fades in purely by fire level (never touching the phone camera/follow numbers,
// which are off limits for this pass). One SpotLight, no shadows; the target is a
// scene-level Object3D placed a few units ahead of the player each frame, so the
// cone always points wherever the player is currently facing.
function updateHeadlamp() {
  if (state.phase !== "playing") { headlampLight.intensity = 0; return; }
  const k = THREE.MathUtils.clamp((HEADLAMP.threshold - state.fire.level) / HEADLAMP.fadeRange, 0, 1);
  headlampLight.intensity = k * HEADLAMP.intensity;
  if (k <= 0) return;
  const p = player.mesh.position;
  headlampLight.position.set(p.x, p.y + 1.55, p.z);
  const yaw = player.mesh.rotation.y;
  const fx = Math.sin(yaw), fz = Math.cos(yaw);
  headlampTarget.position.set(p.x + fx * 3.2, p.y + 0.7, p.z + fz * 3.2);
}

// ---------- Overheat gauge (Bryan, 09/26) ----------
// Two billboard sprites floating over the player's head; only shown once heat
// starts building, so it is invisible at normal fire levels the way Bryan asked.
function updateHeatGauge() {
  const frac = state.heat.level / 100;
  const show = state.phase === "playing" && frac > 0.01;
  heatBarBack.visible = heatBarFill.visible = show;
  if (!show) return;
  const p = player.mesh.position;
  const y = p.y + PLAYER_HEAD_Y + 0.32;
  heatBarBack.position.set(p.x, y, p.z);
  const w = Math.max(0.02, HEAT_BAR_W * frac);
  heatBarFill.scale.x = w;
  heatBarFill.position.set(p.x - (HEAT_BAR_W - w) / 2, y, p.z);
  const pulse = state.heat.forced ? 0.75 + 0.25 * Math.sin(state.t * 10) : 1;
  heatBarFill.material.color.setHSL(0.14 - 0.14 * frac, 0.9, 0.55);
  heatBarFill.material.opacity = 0.95 * pulse;
}

// ---------- Desktop bubble overlap nudge ----------
// If two campers' bubbles land on top of each other on screen, push the lower
// one further up rather than letting them overlap. O(n^2) on at most ~10 actors,
// desktop only (touch never has floating bubbles to begin with).
function nudgeOverlappingBubbles(actors) {
  const els = actors.map((c) => c.bubble && c.bubble.el).filter(Boolean);
  for (let i = 0; i < els.length; i++) {
    for (let j = i + 1; j < els.length; j++) {
      const a = els[i].getBoundingClientRect(), b = els[j].getBoundingClientRect();
      if (!(a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top)) continue;
      const mover = a.top <= b.top ? els[j] : els[i];
      const stay = mover === els[j] ? a : b;
      const shift = (stay.bottom - mover.getBoundingClientRect().top) + 6;
      mover.style.marginTop = `${parseFloat(mover.style.marginTop || "0") - shift}px`;
    }
  }
}

// ---------- Touch speech strip (Bryan, 09/26: "could the speech bubble always be
// at the top, away from the gameplay?") ----------
// Reads the exact same c.bubble.{text,until,cls} and state.message.{text,until}
// that bubble()/pbubble()/say() already set everywhere else in the file, so none
// of those call sites had to change. Two "lanes" show at most two lines at once;
// new lines queue in speechBacklog (FIFO) and take a lane as one frees up, which
// is what makes "queue briefly, or drop the oldest" and "canon/player lines are
// never dropped" both fall out of the same simple mechanism: a canon/player entry
// just waits in the backlog until a lane opens, instead of being deleted, while
// backlog overflow (see pushSpeechLine) only ever prunes the droppable kind.
function isCanonSpeechLine(text) { return CANON_SPEECH_MATCHES.some((m) => text.includes(m)); }
function speechRelLuminance(hex) {
  const c = hex.replace("#", "");
  const r = parseInt(c.substr(0, 2), 16) / 255, g = parseInt(c.substr(2, 2), 16) / 255, b = parseInt(c.substr(4, 2), 16) / 255;
  const lin = (v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}
// "His hat or shirt color, if it reads on the dark background" (Bryan): try the
// cap, then the shirt, then fall back to the base HUD text color if neither is
// light enough to read over the night sky.
function speechSpeakerColor(data) {
  if (!data) return "#f3e9d2";
  const look = data.look || {};
  for (const c of [look.cap, look.topColor, data.cap, data.shirt]) {
    if (c && speechRelLuminance(c) > 0.24) return c;
  }
  return "#f3e9d2";
}
function pushSpeechLine(entry) {
  entry.addedAt = state.t;
  speechBacklog.push(entry);
  while (speechBacklog.length > SPEECH_BACKLOG_MAX) {
    const idx = speechBacklog.findIndex((l) => !l.canon && !l.isPlayer);
    if (idx === -1) break; // everything left is protected; let the backlog run a little long rather than drop it
    speechBacklog.splice(idx, 1);
  }
}
function resetTouchSpeech() {
  speechLanes[0] = speechLanes[1] = null;
  speechBacklog.length = 0;
  speechTickerLastText = "";
  if (ui.speechMarker0) ui.speechMarker0.hidden = true;
  if (ui.speechMarker1) ui.speechMarker1.hidden = true;
}
// Keeps the speech strip's own width clear of the left rail and the
// top-right card (measureHudFootprint, up by actionCornerBoxes) by setting
// its left/right as an inline style every touch frame -- inline style always
// wins over the styles.css fallback, so this is the actual answer, not just
// a first-paint placeholder. See the .speech-strip comment in styles.css.
function updatePhoneSpeechBounds() {
  const { rail, card } = measureHudFootprint();
  const gap = 10;
  ui.speechStrip.style.left = `${Math.round(rail.right + gap)}px`;
  ui.speechStrip.style.right = `${Math.round(window.innerWidth - card.left + gap)}px`;
}
function updateTouchSpeech(actors) {
  // 1. Detect new lines. bubble.until only changes when bubble()/pbubble() is
  // called again with a fresh line, so comparing against the last-seen until is
  // exactly "a new line just started," with no need to touch bubble() itself.
  actors.forEach((c) => {
    const b = c.bubble;
    if (!b || b.until <= state.t || !b.text || b._speechSeen === b.until) return;
    b._speechSeen = b.until;
    const name = c === player ? player.data.name : c.data ? c.data.name : c === state.don ? "Don M" : "Alan";
    const color = c === player || c.data ? speechSpeakerColor(c.data || player.data) : (c === state.don ? SPEECH_DON_COLOR : SPEECH_ALAN_COLOR);
    const remaining = Math.max(1.2, b.until - state.t);
    // The 0.72 shrink below predates this polish pass and is kept (it's what
    // keeps a strip line from outstaying the 3D bubble it mirrors), but it must
    // never eat back into the same length-based floor displayDuration() just
    // gave the underlying bubble -- otherwise a short line on a slow-talking
    // moment could still read as a flash-and-gone. Same floor, applied here to
    // what's actually on screen in the strip.
    pushSpeechLine({ name, color, text: b.text, mesh: c.mesh, canon: isCanonSpeechLine(b.text), isPlayer: c === player, dur: Math.max(remaining * 0.72, Math.max(3, b.text.length / 12)) });
  });
  // The announcer ticker merges into the same strip, plain, no name (Bryan: "one
  // place to read everything"). Same new-line detection trick, keyed off the text
  // itself since state.message has no until-style identity of its own to diff.
  if (state.message.until > state.t && state.message.text && state.message.text !== speechTickerLastText) {
    speechTickerLastText = state.message.text;
    const remaining = Math.max(1.2, state.message.until - state.t);
    pushSpeechLine({ name: null, color: null, text: state.message.text, mesh: null, canon: false, isPlayer: false, isTicker: true, dur: Math.max(remaining * 0.72, Math.max(3, state.message.text.length / 12)) });
  }
  if (state.message.until <= state.t) speechTickerLastText = "";

  // 2. Advance the two lanes: free up any whose time is up, then pull from the
  // backlog into whatever lanes are open. Canon/player lines jump the backlog
  // (still FIFO among themselves) so a busy stretch of ordinary chatter can
  // never bury them for long — "never dropped" also means "shows up promptly."
  for (let i = 0; i < 2; i++) {
    if (speechLanes[i] && state.t - speechLanes[i].startedAt >= speechLanes[i].dur) speechLanes[i] = null;
  }
  for (let i = 0; i < 2; i++) {
    if (!speechLanes[i] && speechBacklog.length) {
      let idx = speechBacklog.findIndex((l) => l.canon || l.isPlayer);
      if (idx === -1) idx = 0;
      const entry = speechBacklog.splice(idx, 1)[0];
      entry.startedAt = state.t;
      speechLanes[i] = entry;
    }
  }

  // 3. Render: newest lane on top.
  const order = [speechLanes[0], speechLanes[1]].filter(Boolean).sort((a, b) => b.startedAt - a.startedAt);
  renderSpeechRow(ui.speechLine0, order[0]);
  renderSpeechRow(ui.speechLine1, order[1]);

  // 4. Small glowing marker over whoever is currently showing a line.
  renderSpeechMarker(ui.speechMarker0, speechLanes[0]);
  renderSpeechMarker(ui.speechMarker1, speechLanes[1]);
}
function renderSpeechRow(el, entry) {
  if (!el) return;
  if (!entry) { el.classList.remove("show"); el.textContent = ""; return; }
  const fading = state.t - entry.startedAt >= entry.dur - 0.4;
  el.classList.toggle("ticker", !!entry.isTicker);
  el.classList.toggle("show", !fading);
  el.textContent = "";
  if (!entry.isTicker && entry.name) {
    const who = document.createElement("span");
    who.className = "who";
    who.style.color = entry.color || "#f3e9d2";
    who.textContent = `${entry.name}: `;
    el.appendChild(who);
  }
  el.appendChild(document.createTextNode(entry.text));
}
function renderSpeechMarker(el, lane) {
  if (!el) return;
  if (!lane || !lane.mesh || !lane.mesh.visible) { el.hidden = true; return; }
  el.hidden = false;
  el.style.background = lane.color || "#f3e9d2";
  el.style.color = lane.color || "#f3e9d2"; // box-shadow uses currentColor
  const w = window.innerWidth, h = window.innerHeight;
  const v = lane.mesh.position.clone().add(new THREE.Vector3(0, 2.35, 0)).project(camera);
  el.style.left = `${(v.x + 1) / 2 * w}px`;
  el.style.top = `${(1 - v.y) / 2 * h}px`;
}

// ---------- Banner ----------
let bannerTimer = null;
function showBanner(text, longSeconds = 0) {
  const el = ui.banner;
  el.textContent = text;
  el.hidden = false;
  el.classList.remove("show"); el.classList.toggle("long", longSeconds > 0); void el.offsetWidth; el.classList.add("show");
  clearTimeout(bannerTimer);
  if (longSeconds > 0) { bannerTimer = setTimeout(() => { el.hidden = true; }, longSeconds * 1000 + (isTouch ? 0 : 200)); return; }
  // Smaller and faster on phones (Bryan: "banners should also be ... fade
  // faster"); the CSS animation-duration is shortened to match in styles.css.
  bannerTimer = setTimeout(() => { el.hidden = true; }, isTouch ? 1700 : 2600);
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
  const rows = top.slice(0, 5).map((e, i) => `<tr class="${entry && e === entry ? "me" : ""}"><td>${i + 1}</td><td>${e.name}</td><td>${e.score}</td><td>${e.diff || "NORMAL"}</td><td>${e.when}</td></tr>`).join("");
  return `<table class="board"><thead><tr><th></th><th>Camper</th><th>Score</th><th>Mode</th><th>Night</th></tr></thead><tbody>${rows}</tbody></table>`;
}
document.getElementById("title-board").innerHTML = renderBoard(null);

// ---------- Helpers ----------
// Lines were going by too fast, especially on the phone's speech strip (Bryan,
// polish pass 09/27/2026). Every bubble()/say() call already passes a duration
// tuned to its own moment, so instead of touching each of those call sites (and
// risking event logic or the canon lines themselves), the shared floor lives
// here: about 1.5x the requested time, with a minimum that scales with how much
// there is to read (~1s per 12 characters, 3s minimum) so a one-word line and a
// full sentence both get a fair, proportional read.
function displayDuration(text, seconds) {
  const floor = Math.max(3, (text || "").length / 12);
  return Math.max(seconds * 1.5, floor);
}
function say(text, seconds, sticky = false) {
  if (!sticky && state.message.sticky && state.message.until > state.t) return; // a big moment holds the line
  state.message.text = text; state.message.until = state.t + displayDuration(text, seconds); state.message.sticky = sticky;
}
function setHint(text) { state.message.hint = text; }
function bubble(c, text, seconds, cls) { c.bubble.text = text; c.bubble.until = state.t + displayDuration(text, seconds); c.bubble.cls = cls; }
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
