// Tuning knobs for the prototype. Everything gameplay-related lives here.

// Camper art refine pass (09/27/2026): which camper ids render through the new
// jointed/faced/outlined builder in world.js (buildRefinedCamper) instead of the
// original one (buildClassicCamper). Started on Johnny D only to verify the
// approach (dev/camper-refine.html); round 2 (09/27/2026) rolled it out to the
// whole roster once the torso/build/outline notes were addressed (see
// dev/camper-refine-round2.html for the sheet). Don M and Alan are built
// separately in buildWorld() with ids "don-m"/"alan" (not in campers.js); a
// third pass (09/27/2026) gave them full `look` objects and added them here
// too, so the two non-roster cameos match the refined roster look.
export const REFINED_CAMPERS = new Set([
  "tom-s", "tom-w", "chris-occ", "bryan-j", "brian-r",
  "perry-s", "johnny-d", "spitty", "razoo", "scott-k",
  "don-m", "alan",
]);

export const NIGHT_SECONDS = 300;          // real seconds from 9:00 PM to 5:30 AM
export const NIGHT_START_MIN = 21 * 60;    // 9:00 PM in minutes
export const NIGHT_END_MIN = 29 * 60 + 30; // 5:30 AM next day
export const MIDNIGHT_MIN = 24 * 60;

export const FIRE = {
  start: 70,
  max: 150,            // above the hot line is Hell's Anus
  hot: 90,             // lowered from 100 on 09/21 so it is easier to reach
  hotBurnMultiplier: 1.5,
  burnPerSec: 1.6,
  logHeat: 32,
  logCatchSeconds: 3,   // fire dips while a fresh log catches
  logDip: 4,
  pokeHeat: 4,
  pokeCooldown: 7,     // poking slows the decline, it does not cancel it
  gasHeat: 40,
  gasCount: 3,
  gasBurnMultiplier: 1.6,
  gasBurnSeconds: 45,
  woodPile: 16,
  bottleFlare: 40,     // the swig-and-blow
  // Wood placement: same side of the pit twice in a row smothers, spreading it around burns better
  smotherHeat: 0.55, smotherCatch: 4.5, smotherDip: 8,
  spreadBonus: 1.15,
};

// Difficulty presets picked in the lobby. Everything else stays the same. Internal
// keys (easy/camp/hell) are unchanged so localStorage and leaderboard entries from
// before the 09/26 rename still resolve; only the display `name` changed, to EASY /
// NORMAL / HARD (Bryan, 09/26: make the three levels read and play as Easy/Normal/
// Hard; Hell's Anus the fire zone keeps its own name regardless of difficulty).
// Retuned 09/26 for the rename, bot-tested at skills 0.25/0.6/0.9 per level (full
// table and bot output in DESIGN.md). Burn now climbs cleanly EASY 1.0 < NORMAL
// 1.65 < HARD 1.95, fixing the old label mismatch where HELL'S (1.85) actually
// burned slower than CAMP (2.05) despite calling itself the fast burn. EASY's
// wood/burn were both eased (22/1.35 -> 24/1.0): even the "distracted" skill-0.25
// bot was losing the fire about half the time on the old numbers, nowhere near
// "rarely." NORMAL eased 2.05 -> 1.65 so skill 0.6 lands at mean ~5-6 kept (was
// ~2.8) with fewer total collapses. HARD's wood nudged 12 -> 14 and burn raised
// to 1.95 so skill 0.9 centers on mean ~5-6 kept with fire dying "sometimes"
// (roughly 4 in 10) instead of the ~70-100% collapse rate earlier passes hit at
// wood 12-13 — this bot is sharply bimodal (see HANDOFF.md), so a single log of
// pile size swings the death rate by 40+ points; 14 was the seed that landed in
// band without flattening it back to "never dies."
export const DIFFICULTY = {
  easy: { name: "EASY", wood: 24, gas: 4, burn: 1.0, blurb: "Big pile, extra gas, slow burn." },
  camp: { name: "NORMAL", wood: 16, gas: 3, burn: 1.65, blurb: "The real thing." },
  hell: { name: "HARD", wood: 15, gas: 2, burn: 1.95, blurb: "Short pile, two gas, the fastest burn. Good luck." },
};

// One-time power-ups, earned once per night.
// Pallet redesign (09/27/2026, Bryan: "too easy to get"): the old version handed
// +8 wood the instant hotSeconds crossed the line, no matter how much wood was
// still in the pile. Now hitting woodHotSeconds only unlocks the *chance* — Johnny
// D remembers a pallet is behind the shed, and it only actually appears once wood
// has also fallen to palletWoodAtOrBelow or less. It is a carryable prop (leaning
// against the cabin, see LAYOUT.pallet below) the player has to walk over, grab,
// and carry to the wood pile themselves; breaking it up there gives palletBreakWood
// (6, down from the old flat 8) instead of wood appearing for free. Carry it to the
// fire instead and Tom S stops you: it disappears, no wood. See docs/DESIGN.md and
// docs/CAMPERS.md.
export const POWERUPS = {
  woodHotSeconds: 10,       // cumulative seconds in Hell's Anus, ever, unlocks the pallet
  palletWoodAtOrBelow: 2,   // ...but it only actually appears once wood is this low or lower
  palletBreakWood: 6,       // wood from breaking the pallet up at the wood pile
  gasGustsBlocked: 2,       // fully blocked gusts earns the gas can
  gasBonus: 2,
};

export const WIND = {
  minGap: 30,
  maxGap: 55,
  gustSeconds: 8,
  extraBurnPerSec: 3.0,
  blockDot: 0.75,      // how squarely the player has to stand upwind
  blockDistance: 2.6,
};

export const CAMPER = {
  startComfort: 72,
  firstToBedId: "razoo",   // gets the heaviest chill factor so he folds first
  firstToBedChill: 1.35,
  scootDistance: 1.1,      // how far chairs back away from Hell's Anus
  coolBelow: 50,
  coldBelow: 30,
  leaveGraceSeconds: 4,
  chillMin: 1.0, chillMax: 1.35,
  lossMultiplier: 1.2,     // how fast comfort drops when the fire is low
  gainMultiplier: 0.7,     // how fast it recovers when the fire is up
  neutralFire: 50,         // fire level where comfort holds steady; below it they chill
  chatterMin: 14,
  chatterMax: 28,
  tomWComfortBoost: 15,
};

// Hell's Anus tiers, by fire level
export const HOT_LEVELS = [
  { at: 90, name: "HELL'S ANUS" },
  { at: 110, name: "HELL'S ANUS II" },
  { at: 130, name: "HELL'S ANUS III: RING OF FIRE" },
];

export const EVENTS = {
  coolerMinGap: 45, coolerMaxGap: 80, coolerStaySeconds: 9,
  guitarMinGap: 70, guitarMaxGap: 120, guitarSeconds: 14, guitarWarmPerSec: 1.4,
  yogurtMinGap: 80, yogurtMaxGap: 130,
  donMinGap: 90, donMaxGap: 150, donSeconds: 14, donRadius: 8.1,
  alanMin: 60, alanMax: 240, alanRadius: 5.7, alanLapSeconds: 5.5,
  snackMinGap: 35, snackMaxGap: 60, snackHopSeconds: 0.7, snackWarm: 3, wrapperFlare: 6, wrapperDip: 4, wrapperThrowSeconds: 0.7,
  bottleMin: 90, bottleMax: 160,
  beerFuse: 3.0, beerFlare: 15, beerShake: 0.7, beerFallers: 3,
  chatterRandomChance: 0.45,  // share of chatter that is a random comment instead of a warm line
  skyMinGap: 50, skyMaxGap: 110,
  plateMinGap: 55, plateMaxGap: 95, plateFlare: 12, plateDip: 10,
  coyoteBelow: 0.25, coyoteMinGap: 6, coyoteMaxGap: 11,
  // Camper-tossed beer can in the fire (once per night, Bryan's "put a full beer can
  // in the fire" ask). Separate from the player's own beer bomb above, which is
  // unchanged. Window is clock minutes, converted with the same gameMinutes() mapping.
  canBeerWindowStartMin: 22 * 60 + 30,  // 10:30 PM
  canBeerWindowEndMin: 24 * 60 + 180,   // 3:00 AM
  canBeerTossSeconds: 0.8,              // arm wind-up + arc, matches the wrapper toss
  canBeerHeatSeconds: 3.5,              // sits in the fire, visibly heating, before it goes
  canBeerShake: 0.9,                    // bigger than the player's own beer bomb (beerShake above)
  canBeerFlare: 8,                      // small, optional flare; kept light per Bryan's ask
  // "No Glass in the fire!" (once per night, not overlapping the can event above).
  glassWindowStartMin: 22 * 60 + 30,    // 10:30 PM
  glassWindowEndMin: 24 * 60 + 180,     // 3:00 AM
  glassMinGapFromCan: 45,               // keeps it off the beer-can event's back
  glassWindSeconds: 0.9,                // wind-up before Tom S shouts
  glassHoldSeconds: 1.0,                // held up while Tom S yells
  glassLowerSeconds: 0.6,               // arm comes back down, bottle set by the chair
  glassSitSeconds: 1.2,                 // bottle sits by the chair, then disappears
};

export const BEAR = {
  returnMin: 40,        // seconds after a taking before the bear brings him back
  returnMax: 65,
  fireThreshold: 12,    // "out" for the bear's purposes
  secondsAtZero: 2.5,
  walkInSeconds: 5,
  walkOutSeconds: 6,
  cooldown: 20,
};

// Hints: a bobbing arrow over a source the player has not found yet
export const HINTS = {
  stickAfter: 15, stickEvery: 45,
  woodBelow: 50, woodEvery: 35,
  gasBelow: 22, gasEvery: 40,
  showSeconds: 7,
};

export const SMOKE = {
  reach: 6.0,           // how far downwind the smoke stream traps you during a gust
  halfWidth: 1.0,
  slow: 0.35,
};

export const PLAYER = {
  speed: 4.2,
  carrySpeed: 3.0,
  reach: 1.6,
  // Touch only (a thumb stick is less precise than keys); no other gameplay numbers change. Phone controls, docs/PHONE.md.
  reachTouch: 2.1,
  // Per-item touch overrides (Bryan's phone play, 09/26: "the poker was tough to
  // get"). The poker is a thin cylinder and easy to miss with a thumb, so it gets
  // the most generous radius; everything else still uses reachTouch above.
  reachTouchStick: 3.0,
  minRadius: 1.3,
  maxRadius: 7.2,
};

// Don M's mini keg (Bryan, 09/26: replaces the log he used to hand out). Pours are
// a limited resource (about 5 liters, one pour per camper) rather than a wood
// source, so this does not feed the fire economy the way his log did; DIFFICULTY
// was retuned to account for that (see the comment on DIFFICULTY above).
export const KEG = {
  pours: 5,
  comfortBoost: 26,
  chillMultiplier: 0.6,   // a topped-off camper cools slower for the rest of the night ("stays longer")
  cheerSeconds: 4,
  fireDip: 55,            // the trap: dumping it on the fire knocks the flames down hard
  steamSeconds: 2.6,
};

// Overheat (Bryan, 09/26: standing too close to the fire at the hotter levels for
// too long makes you overheat). Only builds while at the fire AND state.fire.hot is
// true, i.e. strictly above FIRE.hot (Hell's Anus) — it must never trigger at normal
// fire levels. tierBoost scales the build rate up per Hell's Anus tier so tier II/III
// bite faster than tier I. Cools fast (coolPerSec) the moment either condition drops.
export const HEAT = {
  buildPerSec: 16,
  tierBoost: 0.25,
  coolPerSec: 46,
  max: 100,
  forceBackAt: 100,
  recoverAt: 20,       // must cool back down to this before fire actions unblock
  pushSpeed: 3.2,       // how fast the game nudges an overheated player back from the fire
  pushClear: 1.4,       // how far past the normal reach the push aims for
};

// Headlamp (Bryan, 09/26: fire gets low, camp goes dark, player gets a headlamp).
// One THREE.SpotLight on the player, faded in by fire level alone (phone camera
// numbers are off limits for this pass, so nothing here touches PHONE_FOLLOW/camera).
// Intensity looks small next to FIRE's numbers, but three r160's lighting is
// physically based (candela units), same as fireLight/keyLight in world.js/game.js
// which run into the tens-to-hundreds — a pre-r155-style "2.4" is invisible here.
export const HEADLAMP = {
  threshold: 25,   // raw fire level where it starts fading in
  fadeRange: 14,    // fully on by threshold - fadeRange (~11)
  intensity: 85,    // Bryan 09/27: a little brighter (was 50)
  angle: 0.34,
  penumbra: 0.4,
  distance: 8.5,
};

// Tom W's truck at midnight (added for the truck-arrival feature): timing for the
// headlights-first -> drive-in -> park-and-light -> lights-off sequence. Geometry
// (body color, lens/tail-light positions) lives in src/truck.js's TRUCK_GEOM so
// the two never drift apart. lightIntensity is candela-scale, same family as
// HEADLAMP.intensity/fireLight above (a pre-r155-style "2-ish" would be invisible
// next to them).
export const TRUCK = {
  driveSeconds: 10.5,         // spawn point (beyond the tree line) to LAYOUT.truckPark, a wide loop around the outside of every hazard
  lightsFadeInSeconds: 1.3,   // headlights visible before the truck starts moving
  litSeconds: 3.4,            // stopped, lights up, sweeping/lighting the campers
  fadeOutSeconds: 1.1,        // headlights fade to off before Tom gets out
  lightColor: "#fff3d6",
  lightIntensity: 260,
  lightAngle: 0.5,
  lightPenumbra: 0.5,
  lightDistance: 16,
  beamLength: 7,              // how far forward the visible beam cones reach
};

// Phone-only gentle camera follow (Bryan: "cam in a little", then a follow so the
// wood pile/gas/cooler/stick come fully into view). Works in screen space:
// every frame the player's feet+head and the current action target's whole
// footprint+top (not single ground points — a whole figure and a whole prop
// need real clearance, not just their base) are projected to screen pixels and
// checked against a safe box (topSafePx from the top, edgePx from every other
// screen edge, plus a box around the action button in whichever corner it's
// actually rendered, mirrored to the opposite corner for the stick, each with
// buttonMarginPx of clearance) — see updateCamera. At rest everything already
// sits inside the box, so nothing moves; maxShift is a hard clamp against a
// pathological correction, logged if it ever actually leaves something unsafe.
// Desktop never reads this.
export const PHONE_FOLLOW = {
  damp: 2.4,
  topSafePx: 110,
  edgePx: 70,
  buttonMarginPx: 40,
  maxShift: 9.5,
};

export const LAYOUT = {
  chairRadius: 3.3,
  chairStartDeg: 40,
  chairStepDeg: 35,
  woodPile: { x: 5.9, z: 2.4 },
  gasCan: { x: -5.2, z: 2.6 },
  cabinDoor: { x: -6.2, z: -4.2 },
  camperDoor: { x: 6.6, z: -4.4 },
  bearEntry: { x: 1.5, z: -12 },
  cooler: { x: -4.8, z: -1.4 },   // moved away from the wood pile 09/21 so a wood run cannot grab the beer
  stick: { x: 4.0, z: 3.4 },
  roadEntry: { x: 10, z: 6 },
  // Pallet powerup (09/27/2026): leaning against the cabin, off to the side of
  // LAYOUT.cabinDoor so it doesn't sit on a camper's walk-to-bed path. Distance
  // from origin (~7.6) is just past PLAYER.maxRadius (7.2) but within reach of a
  // player standing at the boundary, same as the cabin/camper doors themselves.
  pallet: { x: -5.1, z: -5.7 },
  // Tom W's truck (midnight arrival feature), repositioned 09/27/2026 (Bryan:
  // "park the truck more in the background to the right of the cabin"). The
  // old spot (-9.3, -3.0) sat almost due left of camp at nearly the same
  // depth as the cabin, reading as "beside" it rather than behind it. This
  // spot is well back (z -9.6, deeper than the cabin's -7) and, on screen, to
  // the right of the cabin (cabin's own NDC x is roughly -0.52 at 1440x900;
  // this spot projects to roughly -0.21, clearly inside/right of that) while
  // staying left of center so it reads as background, not a second building
  // in the main sightline. Radius from origin (~10.1) matches the cabin's
  // (~10.3) and the trailer's (~10.6), so it sits at the same clearing edge
  // they do rather than among the tree ring. Confirmed by projecting through
  // the gameplay camera's own matrices at both 1440x900 and 844x390 (both
  // land around NDC y 0.72-0.83, comfortably on screen, not clipped) rather
  // than eyeballed. Clears cabinDoor by ~7.1, camperDoor/trailer by ~11+,
  // pallet by ~5.2, and the bear corridor (LAYOUT.bearEntry toward the fire)
  // by ~4.3. The approach path's loop in game.js's updateMidnight() was
  // shortened to match (see the comment there) so the final leg swings
  // straight into this spot instead of sweeping on toward the cabin's angle
  // and doubling back. Final parked heading still faces the origin (see
  // updateTruckArrival in game.js) so the headlights sweep the campers
  // before they switch off.
  truckPark: { x: -3.2, z: -9.6 },
  // Johnny D's cornhole boards: off to the left side (Bryan 09/27), outside the
  // walkable radius, clear of the gas can and of Tom W's road on the right.
  // `rot` turns the pair so it runs along the edge of the clearing.
  cornhole: { x: -6.6, z: 5.2, gap: 3.0, rot: 0.75 },
};
