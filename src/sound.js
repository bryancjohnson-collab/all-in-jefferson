// Tiny synthesized sounds. No files. The context starts on the first user gesture.
let ctx = null;
export function initSound() {
  if (ctx) return;
  try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { ctx = null; }
}
function env(gain, t0, a, peak, d) {
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(peak, t0 + a);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + a + d);
}
// A coyote yip: two quick rising-falling squeaks
export function coyoteYip() {
  if (!ctx) return;
  const t0 = ctx.currentTime;
  for (let i = 0; i < 2 + Math.floor(Math.random() * 2); i++) {
    const t = t0 + i * 0.22;
    const o = ctx.createOscillator(); const g = ctx.createGain();
    o.type = "sawtooth";
    o.frequency.setValueAtTime(700 + Math.random() * 200, t);
    o.frequency.exponentialRampToValueAtTime(1500, t + 0.08);
    o.frequency.exponentialRampToValueAtTime(600, t + 0.2);
    const f = ctx.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = 2200;
    env(g, t, 0.02, 0.08, 0.18);
    o.connect(f).connect(g).connect(ctx.destination);
    o.start(t); o.stop(t + 0.25);
  }
}
// Gas fireball: a noise whoosh
export function whoosh() {
  if (!ctx) return;
  const t0 = ctx.currentTime;
  const len = ctx.sampleRate * 0.7;
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = ctx.createBufferSource(); src.buffer = buf;
  const f = ctx.createBiquadFilter(); f.type = "lowpass";
  f.frequency.setValueAtTime(300, t0); f.frequency.exponentialRampToValueAtTime(3000, t0 + 0.15); f.frequency.exponentialRampToValueAtTime(200, t0 + 0.7);
  const g = ctx.createGain(); env(g, t0, 0.03, 0.5, 0.6);
  src.connect(f).connect(g).connect(ctx.destination);
  src.start(t0);
}
// Low bear grumble
export function growl() {
  if (!ctx) return;
  const t0 = ctx.currentTime;
  const o = ctx.createOscillator(); const g = ctx.createGain();
  o.type = "sawtooth"; o.frequency.setValueAtTime(70, t0); o.frequency.linearRampToValueAtTime(45, t0 + 1.2);
  const f = ctx.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = 220;
  env(g, t0, 0.15, 0.25, 1.1);
  o.connect(f).connect(g).connect(ctx.destination);
  o.start(t0); o.stop(t0 + 1.4);
}

// A full beer going off: sharp crack plus a low thump
export function bang() {
  if (!ctx) return;
  const t0 = ctx.currentTime;
  const len = ctx.sampleRate * 0.5;
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.5);
  const src = ctx.createBufferSource(); src.buffer = buf;
  const g = ctx.createGain(); g.gain.setValueAtTime(0.9, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.5);
  src.connect(g).connect(ctx.destination); src.start(t0);
  const o = ctx.createOscillator(); const g2 = ctx.createGain();
  o.type = "sine"; o.frequency.setValueAtTime(90, t0); o.frequency.exponentialRampToValueAtTime(30, t0 + 0.4);
  g2.gain.setValueAtTime(0.8, t0); g2.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.45);
  o.connect(g2).connect(ctx.destination); o.start(t0); o.stop(t0 + 0.5);
}

// ---------- Continuous fire crackle ----------
let crackle = null;
function noiseBuffer(seconds, shape) {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1;
    if (shape === "brown") { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; } else d[i] = w;
  }
  return buf;
}
export function startCrackle() {
  if (!ctx || crackle) return;
  const src = ctx.createBufferSource(); src.buffer = noiseBuffer(4, "brown"); src.loop = true;
  const bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 1500; bp.Q.value = 1.4;   // narrow and high: hiss, not wind
  const g = ctx.createGain(); g.gain.value = 0;
  src.connect(bp).connect(g).connect(ctx.destination); src.start();
  crackle = { g, bp, popAt: 0 };
}
// level is 0..1.5 (1.0 at the Hell's Anus line). Call every frame.
export function setCrackle(level, dt) {
  if (!ctx || !crackle) return;
  const target = level <= 0.02 ? 0 : 0.015 + 0.05 * Math.min(1.5, level);
  crackle.g.gain.setTargetAtTime(target, ctx.currentTime, 0.25);
  crackle.bp.frequency.setTargetAtTime(1300 + 500 * Math.min(1.5, level), ctx.currentTime, 0.5);
  crackle.popAt -= dt;
  if (crackle.popAt <= 0 && level > 0.05) {
    crackle.popAt = (0.12 + Math.random() * 0.6) / Math.max(0.3, Math.min(1.5, level));
    pop(0.06 + Math.random() * 0.08, 0.5 + Math.random() * 0.5);
  }
}
function pop(vol, tone) {
  const t0 = ctx.currentTime;
  const src = ctx.createBufferSource(); src.buffer = noiseBuffer(0.05, "white");
  const hp = ctx.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 1800 * tone;
  const g = ctx.createGain(); g.gain.setValueAtTime(vol, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.05);
  src.connect(hp).connect(g).connect(ctx.destination); src.start(t0);
}
// Footstep: soft low thud
export function footstep() {
  if (!ctx) return;
  const t0 = ctx.currentTime;
  const src = ctx.createBufferSource(); src.buffer = noiseBuffer(0.08, "white");
  const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 260 + Math.random() * 80;
  const g = ctx.createGain(); g.gain.setValueAtTime(0.35, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.09);
  src.connect(lp).connect(g).connect(ctx.destination); src.start(t0);
}
// Log landing: thump plus a burst of sparks
export function logLand() {
  if (!ctx) return;
  const t0 = ctx.currentTime;
  const o = ctx.createOscillator(); const g = ctx.createGain();
  o.type = "sine"; o.frequency.setValueAtTime(120, t0); o.frequency.exponentialRampToValueAtTime(50, t0 + 0.18);
  g.gain.setValueAtTime(0.6, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.2);
  o.connect(g).connect(ctx.destination); o.start(t0); o.stop(t0 + 0.22);
  for (let i = 0; i < 7; i++) setTimeout(() => pop(0.12, 0.8 + Math.random()), 60 + i * 55 + Math.random() * 40);
}
// Poker: a scrape through the coals, then sparks
export function pokeSound() {
  if (!ctx) return;
  const t0 = ctx.currentTime;
  const src = ctx.createBufferSource(); src.buffer = noiseBuffer(0.25, "white");
  const bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.setValueAtTime(1400, t0); bp.frequency.exponentialRampToValueAtTime(3200, t0 + 0.2); bp.Q.value = 2;
  const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.22, t0 + 0.05); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.25);
  src.connect(bp).connect(g).connect(ctx.destination); src.start(t0);
  for (let i = 0; i < 5; i++) setTimeout(() => pop(0.1, 1 + Math.random()), 120 + i * 45);
}
// Bees: a wobbling buzz that lasts `seconds`
export function buzz(seconds) {
  if (!ctx) return;
  const t0 = ctx.currentTime;
  const o = ctx.createOscillator(); o.type = "sawtooth"; o.frequency.value = 170;
  const lfo = ctx.createOscillator(); lfo.frequency.value = 9; const lg = ctx.createGain(); lg.gain.value = 22;
  lfo.connect(lg).connect(o.frequency);
  const f = ctx.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = 900;
  const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.12, t0 + 0.4); g.gain.setValueAtTime(0.12, t0 + seconds - 0.6); g.gain.exponentialRampToValueAtTime(0.0001, t0 + seconds);
  o.connect(f).connect(g).connect(ctx.destination); o.start(t0); lfo.start(t0); o.stop(t0 + seconds); lfo.stop(t0 + seconds);
}

// ---------- Music: a campfire tune, synthesized ----------
// A strummed riff for the lobby, a quiet loop for the night, a sting for dawn. M toggles it.
const NOTE = (n) => 440 * Math.pow(2, (n - 69) / 12);   // MIDI to Hz
const music = { on: true, master: null, timer: null, nextBeat: 0, beat: 0, mode: null, pass: 0, fadeTarget: 1, introEndsAt: 0 };
try { music.on = localStorage.getItem("aij-music") !== "off"; } catch (e) { /* ignore */ }
export function musicEnabled() { return music.on; }
// True once the scheduler has anything going (intro, loop, or dawn). Lets the
// title-screen and lobby hooks avoid ever starting a second one on top.
export function musicActive() { return !!music.mode; }
// Dev handle: lets a tuning script confirm the scheduler is running. Reports
// "intro" while the title-screen pickup is still ringing (mode is already
// "loop" internally the whole time, so a second startLoop() call during the
// intro is still correctly ignored) and "loop" once the loop's own first beat
// has actually started.
window.__music = { get state() {
  const inIntro = music.mode === "loop" && ctx && ctx.currentTime < music.introEndsAt;
  return { mode: inIntro ? "intro" : music.mode, beat: music.beat, pass: music.pass, on: music.on, ctx: ctx && ctx.state, master: music.master && music.master.gain.value };
} };
export function toggleMusic() {
  music.on = !music.on;
  try { localStorage.setItem("aij-music", music.on ? "on" : "off"); } catch (e) { /* ignore */ }
  if (music.master) music.master.gain.setTargetAtTime(music.on ? 1 : 0, ctx.currentTime, 0.1);
  return music.on;
}
function ensureMaster() {
  if (!ctx) return null;
  if (!music.master) { music.master = ctx.createGain(); music.master.gain.value = music.on ? 1 : 0; music.master.connect(ctx.destination); }
  return music.master;
}
// Plucked string: triangle with a quick decay through a lowpass that closes as it rings
function pluck(midi, t, dur, vol) {
  const o = ctx.createOscillator(); o.type = "triangle"; o.frequency.value = NOTE(midi);
  const f = ctx.createBiquadFilter(); f.type = "lowpass"; f.frequency.setValueAtTime(2600, t); f.frequency.exponentialRampToValueAtTime(700, t + dur);
  const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(f).connect(g).connect(music.master); o.start(t); o.stop(t + dur + 0.05);
}
function bass(midi, t, dur, vol) {
  const o = ctx.createOscillator(); o.type = "sine"; o.frequency.value = NOTE(midi);
  const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.02); g.gain.setValueAtTime(vol, t + dur * 0.6); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(music.master); o.start(t); o.stop(t + dur + 0.05);
}
function pad(midis, t, dur, vol) {
  midis.forEach((m) => {
    const o = ctx.createOscillator(); o.type = "sine"; o.frequency.value = NOTE(m);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + dur * 0.4); g.gain.linearRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(music.master); o.start(t); o.stop(t + dur + 0.05);
  });
}
// Chords in G: G, Em, C, D as [root, third, fifth] MIDI (G3 = 55)
const CH = { G: [55, 59, 62], Em: [52, 55, 59], C: [48, 52, 55], D: [50, 54, 57] };
const strum = (chord, t, vol = 0.09, spread = 0.045) => chord.forEach((m, i) => pluck(m + 12, t + i * spread, 1.6, vol));

// The lobby riff: four strummed chords and a little run up to a held G
export function playRiff() {
  if (!ctx || !ensureMaster()) return;
  const t0 = ctx.currentTime + 0.05, b = 60 / 84;
  [["G", 0], ["D", 1], ["Em", 2], ["C", 3]].forEach(([c, i]) => { strum(CH[c], t0 + i * b * 1.5); bass(CH[c][0] - 12, t0 + i * b * 1.5, b * 1.4, 0.16); });
  const run = [62, 64, 66, 67, 69, 71, 74];
  run.forEach((m, i) => pluck(m + 12, t0 + 6 * b + i * b * 0.25, 0.5, 0.08));
  strum(CH.G, t0 + 7.8 * b, 0.11, 0.06); pad([67, 71, 74, 79], t0 + 7.8 * b, 3.2, 0.05); bass(43, t0 + 7.8 * b, 3, 0.18);
}

// The title-screen intro: the very first sound of the game, played once on the
// player's first touch/pointer/key press on the title screen. Same key (G),
// tempo (84 bpm) and instruments (pluck/bass/strum) as the lobby riff above, so
// it reads as one song, not two: a low G pedal under a climbing arpeggio (bar 1,
// the pickup), then G and D chords strummed twice as fast into the same rising
// run the riff uses (bar 2, the build). It is timed to the loop's own beat grid
// (8 beats, ~5.7s) so its last note resolves right as the loop's first beat
// begins: no gap, and no note is ever played twice at the handoff.
export function playIntroThenLoop() {
  if (!ctx || !ensureMaster() || music.mode) return;   // mode is only ever set once something (intro/loop/dawn) is already going; never stack a second start on top
  const t0 = ctx.currentTime + 0.05, b = 60 / 84;
  // Bar 1: the pickup. G1 pedal under a climbing G-major arpeggio (G4 B4 D5 G5).
  bass(31, t0, b * 4, 0.14);
  [55, 59, 62, 67].forEach((m, i) => pluck(m + 12, t0 + i * b, b * 0.95, 0.06 + i * 0.01));
  // Bar 2: the build. G then D strummed at double speed (a dominant lean into the
  // loop's opening G), then the same ascending run the riff opens with, landing
  // its last note right on the loop's downbeat.
  strum(CH.G, t0 + 4 * b, 0.09, 0.03);
  strum(CH.D, t0 + 5 * b, 0.09, 0.03);
  const run = [62, 64, 66, 67, 69, 71, 74];
  run.forEach((m, i) => pluck(m + 12, t0 + 6 * b + i * b * 0.25, 0.5, 0.08));
  const introBeats = 8, loopStart = t0 + introBeats * b;
  music.introEndsAt = loopStart;
  startLoop(loopStart);
}

// The night loop: 8-bar arpeggio over G / Em / C / D, melody on alternate passes, a rest bar so it breathes
const LOOP = ["G", "G", "Em", "Em", "C", "C", "D", "D"];
const MEL_A = [null, 74, 71, null, 69, null, 67, 66, null, 64, null, 62, null, null, null, null];   // 16 steps over bars 5-8
const MEL_B = [null, 67, 69, 71, null, 74, null, 71, null, 69, 67, null, 66, null, 67, null];
function scheduleBeat(beatIndex, t) {
  const b = 60 / 84, bar = Math.floor(beatIndex / 4) % 8, step = beatIndex % 4;
  const chord = CH[LOOP[bar]];
  const arp = [chord[0], chord[2], chord[1], chord[2]];
  const resting = bar === 7 && step >= 2 && music.pass % 2 === 1;
  if (!resting) pluck(arp[step] + 12, t, b * 0.9, 0.065);
  if (step === 0 || step === 2) bass(chord[0] - 12, t, b * 1.8, 0.13);
  if (step === 0 && bar % 2 === 0) pad([chord[0] + 12, chord[1] + 12, chord[2] + 12], t, b * 8, 0.022);
  const mel = music.pass % 2 === 0 ? MEL_A : MEL_B;
  if (bar >= 4) {
    for (let s = 0; s < 4; s++) { const m = mel[(bar - 4) * 4 + s]; if (m && s === 0) pluck(m + 12, t, b * 0.8, 0.075); else if (m && s !== 0) pluck(m + 12, t + s * b * 0.25, b * 0.5, 0.06); }
  }
  if (beatIndex % 32 === 31) music.pass += 1;
}
// `startAt` (an AudioContext time) lets playIntroThenLoop() below hand off to the
// loop's exact first beat with no gap; omit it to start on the next tick as before.
// The music.mode === "loop" guard is what makes every later call (startNight()'s
// own startLoop(), or a second gesture on the title screen) a safe no-op instead
// of a restart or a duplicate scheduler.
export function startLoop(startAt) {
  if (!ctx || !ensureMaster() || music.mode === "loop") return;
  // No startAt means nothing is winding into this call, so clear any stale
  // introEndsAt left over from an earlier intro (otherwise the __music.state
  // "intro" label could wrongly reappear if ctx.currentTime happens to still be
  // behind that old timestamp when this fresh loop begins).
  if (startAt == null) music.introEndsAt = 0;
  music.mode = "loop"; music.beat = 0; music.pass = 0; music.nextBeat = startAt != null ? startAt : ctx.currentTime + 0.1;
  clearInterval(music.timer);
  music.timer = setInterval(() => {
    const b = 60 / 84;
    while (music.nextBeat < ctx.currentTime + 0.4) { scheduleBeat(music.beat, music.nextBeat); music.beat += 1; music.nextBeat += b; }
  }, 120);
}
export function stopMusic(fadeSeconds = 1.5) {
  if (!ctx || !music.master) return;
  clearInterval(music.timer); music.timer = null; music.mode = null;
  music.master.gain.setTargetAtTime(0, ctx.currentTime, fadeSeconds / 3);
  setTimeout(() => { if (music.master && !music.mode) music.master.gain.setValueAtTime(music.on ? 1 : 0, ctx.currentTime); }, fadeSeconds * 1000 + 200);
}
// Dawn sting: a bright rising figure and a held chord
export function playDawn() {
  if (!ctx || !ensureMaster()) return;
  clearInterval(music.timer); music.timer = null; music.mode = "dawn";
  music.master.gain.setValueAtTime(music.on ? 1 : 0, ctx.currentTime);
  const t0 = ctx.currentTime + 0.1, b = 60 / 84;
  [67, 71, 74, 79].forEach((m, i) => pluck(m + 12, t0 + i * b * 0.5, 1.2, 0.09));
  pad([67, 71, 74, 79, 83], t0 + 2 * b, 4, 0.05); bass(43, t0 + 2 * b, 3.5, 0.16);
}
// Night-level duck: quieter when the fire is low so the coyotes and the bear read
export function duckMusic(k) { if (music.master && music.on) music.master.gain.setTargetAtTime(0.35 + 0.65 * k, ctx.currentTime, 0.8); }

// ---------- The bear's tuba ----------
// A blatty low brass voice: two detuned saws through a lowpass with a little vibrato and a soft attack
function tuba(midi, t, dur, vol = 0.22) {
  const out = ctx.createGain();
  out.gain.setValueAtTime(0.0001, t); out.gain.exponentialRampToValueAtTime(vol, t + 0.06);
  out.gain.setValueAtTime(vol, t + dur * 0.7); out.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  const f = ctx.createBiquadFilter(); f.type = "lowpass"; f.frequency.setValueAtTime(420, t); f.frequency.linearRampToValueAtTime(320, t + dur); f.Q.value = 1.2;
  const lfo = ctx.createOscillator(); lfo.frequency.value = 5.5; const lg = ctx.createGain(); lg.gain.value = 1.6;
  [0, 4].forEach((cents) => {
    const o = ctx.createOscillator(); o.type = "sawtooth"; o.frequency.value = NOTE(midi); o.detune.value = cents;
    lfo.connect(lg).connect(o.detune);
    o.connect(f); o.start(t); o.stop(t + dur + 0.05);
  });
  f.connect(out).connect(ctx.destination);
  lfo.start(t); lfo.stop(t + dur + 0.05);
}
// Walking in: a slow oom-pah in E minor, two bars, the second one a half step up so it leans on you
export function bearTheme() {
  if (!ctx) return;
  const t0 = ctx.currentTime + 0.05, b = 60 / 76;
  const bar1 = [[40, 1], [40, 0.5], [43, 0.5], [40, 1], [38, 1]];           // E2 E2 G2 E2 D2
  const bar2 = [[41, 1], [41, 0.5], [44, 0.5], [41, 1], [39, 1.6]];          // F2 F2 Ab2 F2 Eb2
  let t = t0;
  [...bar1, ...bar2].forEach(([m, len]) => { tuba(m, t, b * len * 0.92); t += b * len; });
}
// Bringing him back: the same idea but bouncy and major
export function bearRideTheme() {
  if (!ctx) return;
  const t0 = ctx.currentTime + 0.05, b = 60 / 108;
  const notes = [[40, 0.5], [40, 0.5], [44, 0.5], [47, 0.5], [40, 0.5], [40, 0.5], [45, 0.5], [44, 1], [40, 0.5], [40, 0.5], [44, 0.5], [47, 0.5], [49, 0.5], [47, 0.5], [44, 1.2]];
  let t = t0;
  notes.forEach(([m, len]) => { tuba(m, t, b * len * 0.85, 0.2); t += b * len; });
}
// Scared off: womp womp
export function bearWomp() {
  if (!ctx) return;
  const t0 = ctx.currentTime + 0.05;
  const slide = (from, to, t, dur) => {
    const o = ctx.createOscillator(); o.type = "sawtooth"; o.frequency.setValueAtTime(NOTE(from), t); o.frequency.linearRampToValueAtTime(NOTE(to), t + dur);
    const f = ctx.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = 500;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.22, t + 0.05); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(f).connect(g).connect(ctx.destination); o.start(t); o.stop(t + dur + 0.05);
  };
  slide(45, 43, t0, 0.55); slide(43, 40, t0 + 0.65, 0.9);
}

// Keg dumped on the fire (Bryan, 09/26: it's a trap): a wet hiss and steam burst,
// pitch falling off as it settles.
export function hissSteam() {
  if (!ctx) return;
  const t0 = ctx.currentTime;
  const len = Math.floor(ctx.sampleRate * 1.1);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 0.6);
  const src = ctx.createBufferSource(); src.buffer = buf;
  const f = ctx.createBiquadFilter(); f.type = "bandpass";
  f.frequency.setValueAtTime(3600, t0); f.frequency.exponentialRampToValueAtTime(900, t0 + 1.0); f.Q.value = 0.8;
  const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.4, t0 + 0.05); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.05);
  src.connect(f).connect(g).connect(ctx.destination); src.start(t0);
}
