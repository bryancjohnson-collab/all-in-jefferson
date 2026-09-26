// Tuning knobs for the prototype. Everything gameplay-related lives here.
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

// Difficulty presets picked in the lobby. Everything else stays the same.
// CAMP retuned 09/26 with the fixed (sector-rotating) bot: burn 1.6 -> 2.05 so a
// tryhard (Bryan's own level) keeps about 5 of 9, not 6-7, and a decent player
// keeps about 3. Wood (16) and gas (3) left alone; burn is doing the work.
// A tryhard's fire still dies more often than we'd like at this burn
// (~1 in 4 runs, wanted rare); could not find a wood/gas/burn combo that both
// kept the mean near 5 and kept fire-death rare, since this bot is bimodal:
// once it's coping it usually keeps 7-9, so hitting mean 5 means some real
// share of runs collapsing outright. See HANDOFF.md.
export const DIFFICULTY = {
  easy: { name: "EASY", wood: 22, gas: 4, burn: 1.35, blurb: "Big pile, extra gas, slow burn." },
  camp: { name: "CAMP", wood: 16, gas: 3, burn: 2.05, blurb: "The real thing." },
  hell: { name: "HELL'S", wood: 12, gas: 2, burn: 1.85, blurb: "Short pile, two gas, fast burn. Good luck." },
};

// One-time power-ups, earned once per night.
export const POWERUPS = {
  woodHotSeconds: 10,   // cumulative seconds in Hell's Anus earns the pallet
  woodBonus: 8,
  gasGustsBlocked: 2,   // fully blocked gusts earns the gas can
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
};
