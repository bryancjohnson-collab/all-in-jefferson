// Roster and lines. Bryan's lines are canon; see docs/CAMPERS.md.
// `cap`/`shirt` are the original Storm Camp select-screen colors: kept as-is,
// unused for rendering now, in case anything else ever wants a flat two-tone
// swatch for a camper. What actually renders is `look` (art pass step 4; see
// docs/CAMPERS.md "Looks" and makeCamperMesh() in world.js for the field
// list). Exact `look` colors are picked for readability at night, per Bryan
// (09/25/2026); the garment types, hair, and face details are what he set.
export const campers = [
  { id: "tom-s", name: "Tom S", cap: "#bc4749", shirt: "#f4a261",
    look: { top: "tee", topColor: "#2f3542", graphic: { color: "#f4f1ea", shape: "circle" }, pants: "jeans", hair: { color: "#9aa0a6" }, cap: "#7d7358", hat: "bucket" },
    warm: "Uh-oh, I think I just sharded.", cold: "Is anybody else freezing?", leaving: "I'm gonna go inside and try on my wife-beater." },
  { id: "tom-w", name: "Tom W", cap: "#1d3557", shirt: "#a8dadc", arrivesAtMidnight: true,
    look: { top: "puffer", topColor: "#1d5fb0", pants: "jeans", shoes: "sneakers", hair: { color: "#d9b45c" }, cap: "#c1272d", hat: "beanie", pom: "#f4f1ea" },
    warm: "I just got here- what did I miss?", cold: "This is why I come up Saturday.", leaving: "I'm headed in before I have to sleep in a tent like a savage." },
  { id: "chris-occ", name: "Chris Occ", cap: "#6a4c93", shirt: "#f2e8cf",
    look: { top: "tee", topColor: "#1f2430", graphic: { color: "#c1121f", shape: "square" }, pants: "shorts-dark", hair: { color: "#1c1712" }, beard: "short", cap: "#6a4c93", hat: "beanie" },
    warm: "Hello, my esteemed colleague, Mr Heat !", cold: "My fingers are too cold to play.", leaving: "Guitar's going back in the cabin." },
  { id: "bryan-j", name: "Bryan J", cap: "#d62828", shirt: "#fcbf49",
    look: { top: "quarterzip", topColor: "#b7bcc4", pants: "shorts-dark", cap: "#1d3557", hair: { color: "#3b2a1d" } },
    warm: "Who used all the big ice? I need a bourbon refill!", cold: "Somebody feed that fire.", leaving: "I'll have breakfast ready at 7." },
  { id: "brian-r", name: "Brian R", cap: "#386641", shirt: "#dda15e",
    look: { top: "fleece", topColor: "#8a2e2a", hiVisHem: true, pants: "shorts-camo", hair: { color: "#c9c9c9" }, cap: "#3d6b35", hat: "beanie" },
    warm: "Remember when I skied the pond?", cold: "The pond was warmer than this.", leaving: "I'm going to go ski the pond." },
  { id: "perry-s", name: "Perry S", cap: "#7f5539", shirt: "#e9c46a",
    look: { top: "tee", topColor: "#1d3a63", pants: "black", cap: "#c9a86a", glasses: "clear", beard: "short", hair: { color: "#5a3d24" }, watch: true },
    warm: "Anyone interested in some 'Great Value' cheese puffs?", cold: "I never did get that tent up.", leaving: "I'm sleeping in the car." },
  { id: "johnny-d", name: "Johnny D", cap: "#003049", shirt: "#90e0ef",
    look: { top: "quarterzip", topColor: "#7d8791", pants: "jeans", hair: { color: "#e8e8e0" }, cap: "#1f6f6b", hat: "bucket", watch: true },
    warm: "Going live on cornhole!", cold: "Winners don't sit in the cold.", leaving: "Rematch tomorrow. I'm out." },
  { id: "spitty", name: "Spitty", cap: "#9d4edd", shirt: "#ffafcc",
    look: { top: "longsleeve", topColor: "#5c6b3f", pants: "jeans", hair: "bald", cap: "#d6478a", hat: "beanie" },
    warm: "Bologna Yogurt anyone?", cold: "My yogurt's colder than frozen bologna.", leaving: "I'm taking the yogurt to bed." },
  { id: "razoo", name: "Razoo", cap: "#283618", shirt: "#dda15e",
    look: { top: "fleece", topColor: "#2f6b46", pants: "black", cap: "#8fd694", hair: { color: "#6b4423" } },
    warm: "Please turn up Hell's Anus a notch!", cold: "My toes are colder than my trumpet mouthpiece in December!", leaving: "I'll be right back...really..." },
  { id: "scott-k", name: "Scott K", cap: "#264653", shirt: "#e76f51", bearFirst: true,
    look: { top: "hoodie", topColor: "#4a4038", graphic: { color: "#f4f1ea", shape: "circle" }, pants: "gray", cap: "#5b5a34", glasses: "dark", hair: { color: "#241c15" } },
    warm: "I know how to ride Black Hawks better than anyone.", cold: "Black Hawks have heaters, you know.", leaving: "Early flight. I'm out." },
];

// What each guy pulls out of his bag. Wrapper goes in the fire after.
export const snacks = {
  "tom-s": "Slim Jims", "tom-w": "gas station donuts", "chris-occ": "trail mix", "bryan-j": "leftover breakfast bacon",
  "brian-r": "beef jerky", "perry-s": "'Great Value' cheese puffs", "johnny-d": "pepperoni sticks", "spitty": "Bologna Yogurt",
  "razoo": "pretzels from the IPA box", "scott-k": "an MRE",
};

// Signature emotes for the lobby. Names show on screen.
export const emotes = {
  "tom-s": "Coffee Mug Sip", "chris-occ": "Air Guitar", "bryan-j": "Bourbon Toast", "brian-r": "Pond Ski",
  "perry-s": "Cheese Puff Toss", "johnny-d": "Cornhole Toss", "spitty": "Yogurt Spoon", "razoo": "Trumpet Solo", "scott-k": "Black Hawk",
};

// Random comments, mixed into the chatter. "live" lines belong to Johnny D. "sky" lines trigger a sky event.
export const comments = [
  { text: "What was that?" },
  { text: "Look! A shooting star!", sky: "star" },
  { text: "Is that Starlink?", sky: "starlink" },
  { text: "Anyone wanna go to the cemetery?" },
  { text: "I'm hungry." },
  { text: "I'm going live on canoe!", who: "johnny-d" },
  { text: "I'm going live on cajun boil!", who: "johnny-d" },
  { text: "Live on fire!", who: "johnny-d" },
  { text: "Oh my god- what did you eat?" },
  { text: "Who farted?" },
  { text: "I need a beer!" },
  { text: "Who has the Reeses?" },
  { text: "Did you hear the coyotes?" },
  { text: "Is there catfish in the pond?" },
  { text: "Where is the rocket launcher?" },
];
// Said only at the cooler, by whoever is not one of the three with their own line
export const coolerComments = ["Anybody need one while I'm up?", "Who brought Strawberitas??"];

// Don M's mini keg (Bryan, 09/26; see docs/CAMPERS.md "Keg" section). Short, generic
// ad-libs for whoever just got topped off, not attributed to any one camper's voice.
// kegFireYell is what someone shouts if you pour it on the fire instead. Both approved
// by Bryan 09/26/2026.
export const kegCheers = ["Now we're talking!", "Cheers!", "That hits the spot.", "Attaboy.", "Keep it coming."];
export const kegFireYell = "Hey! Not the keg in the fire!";

const ROTATION_KEY = "aij-rotation";

// Random player each run, rotating so nobody repeats until everyone playable has had a turn.
// Tom W is not playable because he arrives at midnight.
export function pickPlayer() {
  const playable = campers.filter((c) => !c.arrivesAtMidnight).map((c) => c.id);
  let remaining = [];
  try {
    remaining = JSON.parse(localStorage.getItem(ROTATION_KEY) || "[]").filter((id) => playable.includes(id));
  } catch (e) { remaining = []; }
  if (remaining.length === 0) remaining = [...playable];
  const idx = Math.floor(Math.random() * remaining.length);
  const id = remaining.splice(idx, 1)[0];
  try { localStorage.setItem(ROTATION_KEY, JSON.stringify(remaining)); } catch (e) { /* private mode */ }
  return campers.find((c) => c.id === id);
}

// The player overrode the rotation's pick: put the default back, take the chosen one out.
export function commitPick(defaultId, chosenId) {
  if (defaultId === chosenId) return;
  let remaining = [];
  try { remaining = JSON.parse(localStorage.getItem(ROTATION_KEY) || "[]"); } catch (e) { remaining = []; }
  if (!remaining.includes(defaultId)) remaining.push(defaultId);
  remaining = remaining.filter((id) => id !== chosenId);
  try { localStorage.setItem(ROTATION_KEY, JSON.stringify(remaining)); } catch (e) { /* ignore */ }
}
